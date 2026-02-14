import * as process from 'process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import * as http from '@actions/http-client'

// Run Oz agent.
export async function runAgent(): Promise<void> {
  const channel = core.getInput('oz_channel')
  const prompt = core.getInput('prompt')
  const savedPrompt = core.getInput('saved_prompt')
  const skill = core.getInput('skill')

  const model = core.getInput('model')
  const name = core.getInput('name')
  const mcp = core.getInput('mcp')

  if (!prompt && !savedPrompt && !skill) {
    throw new Error('Either `prompt`, `saved_prompt`, or `skill` must be provided')
  }

  const apiKey = core.getInput('warp_api_key')
  if (!apiKey) {
    throw new Error('`warp_api_key` must be provided.')
  }

  const command = resolveCommand(channel)

  await installOz(channel, core.getInput('oz_version'))

  const args = buildArgs({
    prompt,
    savedPrompt,
    skill,
    model,
    name,
    mcp,
    cwd: core.getInput('cwd'),
    profile: core.getInput('profile'),
    outputFormat: core.getInput('output_format'),
    shareRecipients: core.getMultilineInput('share'),
    debug: core.isDebug()
  })

  let execResult
  try {
    execResult = await exec.getExecOutput(command, args, {
      env: {
        ...process.env,
        WARP_API_KEY: apiKey
      }
    })
  } catch (error) {
    // Show Oz logs for troubleshooting.
    await logOzLogFile(channel)
    throw error
  }

  core.setOutput('agent_output', execResult.stdout)
}

// Resolve the CLI command name from the channel.
export function resolveCommand(channel: string): string {
  switch (channel) {
    case 'stable':
      return 'oz'
    case 'preview':
      return 'oz-preview'
    default:
      throw new Error(`Unsupported channel ${channel}`)
  }
}

export interface BuildArgsOptions {
  prompt: string
  savedPrompt: string
  skill: string
  model: string
  name: string
  mcp: string
  cwd: string
  profile: string
  outputFormat: string
  shareRecipients: string[]
  debug: boolean
}

// Build the CLI arguments array from the action inputs.
export function buildArgs(opts: BuildArgsOptions): string[] {
  const args = ['agent', 'run']

  if (opts.prompt) {
    args.push('--prompt', opts.prompt)
  }

  if (opts.savedPrompt) {
    args.push('--saved-prompt', opts.savedPrompt)
  }

  if (opts.skill) {
    args.push('--skill', opts.skill)
  }

  if (opts.model) {
    args.push('--model', opts.model)
  }

  if (opts.name) {
    args.push('--name', opts.name)
  }

  if (opts.mcp) {
    args.push('--mcp', opts.mcp)
  }

  if (opts.cwd) {
    args.push('--cwd', opts.cwd)
  }

  if (opts.profile) {
    args.push('--profile', opts.profile)
  } else {
    args.push('--sandboxed')
  }

  if (opts.outputFormat) {
    args.push('--output-format', opts.outputFormat)
  }

  if (opts.shareRecipients) {
    for (const recipient of opts.shareRecipients) {
      args.push('--share', recipient)
    }
  }

  if (opts.debug) {
    args.push('--debug')
  }

  return args
}

// Install the Oz CLI, using the specified channel and version.
export async function installOz(channel: string, version: string): Promise<void> {
  await core.group('Installing Oz', async () => {
    const ozDeb = await downloadOzDeb(channel, version)
    // Install the .deb file, and then use apt-get to install any dependencies.
    await exec.exec('sudo', ['dpkg', '-i', ozDeb])
    await exec.exec('sudo', ['apt-get', '-f', 'install'])
  })
}

// Download the .deb file for the Oz CLI. If the version is `latest`, this will resolve the
// latest version on `channel`.
export async function downloadOzDeb(channel: string, version: string): Promise<string> {
  if (process.platform !== 'linux') {
    throw new Error(
      `Only Linux runners are supported - the current platform is ${process.platform}`
    )
  }

  let debUrl: string
  let arch: string
  let debArch: string

  if (process.arch === 'x64') {
    arch = 'x86_64'
    debArch = 'amd64'
  } else if (process.arch === 'arm64') {
    arch = 'aarch64'
    debArch = 'arm64'
  } else {
    throw new Error(`Unsupported architecture ${process.arch}`)
  }

  if (version === 'latest') {
    const client = new http.HttpClient('oz-action', undefined, { allowRedirects: false })
    const response = await client.get(
      `https://app.warp.dev/download/cli?os=linux&package=deb&arch=${arch}&channel=${channel}`
    )

    if (response.message.statusCode === 302 || response.message.statusCode === 301) {
      const location = response.message.headers['location']
      if (!location) {
        throw new Error('Redirect location header missing')
      }
      debUrl = location
      const url = new URL(debUrl)
      const pathComponents = url.pathname.split('/').filter((c) => c)
      // Extract the version component from the URL.
      if (pathComponents.length >= 2) {
        version = pathComponents[1]
      }
    } else {
      throw new Error(`Expected redirect, got status ${response.message.statusCode}`)
    }

    core.info(`Latest version on ${channel} is ${version}`)
  } else {
    let debVersion: string
    if (version.startsWith('v')) {
      debVersion = version.slice(1)
    } else {
      debVersion = version
      version = 'v' + version
    }
    debUrl = `https://releases.warp.dev/${channel}/${version}/oz_${channel}_${debVersion}_${debArch}.deb`
  }

  const cacheVersion = `${channel}-${version}`
  let cachedDeb = tc.find('oz', cacheVersion)
  if (!cachedDeb) {
    core.debug(`Downloading from ${debUrl}...`)
    const downloadedDeb = await tc.downloadTool(debUrl)
    cachedDeb = await tc.cacheFile(downloadedDeb, 'oz.deb', 'oz', cacheVersion)
  } else {
    core.debug('Using cached .deb package')
  }
  return path.join(cachedDeb, 'oz.deb')
}

// Dump the Oz log file contents if it exists.
export async function logOzLogFile(channel: string): Promise<void> {
  const stateDir = process.env.XDG_STATE_DIR || path.join(os.homedir(), '.local', 'state')
  const channelSuffix = channel === 'stable' ? '' : `-${channel}`
  const logFileName = channel === 'stable' ? 'warp.log' : `warp_${channel}.log`
  const warpLogPath = path.join(stateDir, `warp-terminal${channelSuffix}`, logFileName)

  if (fs.existsSync(warpLogPath)) {
    await core.group('Warp Logs', async () => {
      try {
        const logContents = fs.readFileSync(warpLogPath, 'utf8')
        core.info(logContents)
      } catch (error) {
        core.warning(`Failed to read warp.log: ${error}`)
      }
    })
  } else {
    core.warning(`warp.log not found at ${warpLogPath}`)
  }
}
