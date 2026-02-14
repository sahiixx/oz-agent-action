import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCommand, buildArgs, type BuildArgsOptions } from './agent.js'

describe('resolveCommand', () => {
  it('returns "oz" for stable channel', () => {
    expect(resolveCommand('stable')).toBe('oz')
  })

  it('returns "oz-preview" for preview channel', () => {
    expect(resolveCommand('preview')).toBe('oz-preview')
  })

  it('throws for unsupported channel', () => {
    expect(() => resolveCommand('beta')).toThrow('Unsupported channel beta')
  })

  it('throws for empty channel', () => {
    expect(() => resolveCommand('')).toThrow('Unsupported channel ')
  })
})

function defaultOpts(overrides: Partial<BuildArgsOptions> = {}): BuildArgsOptions {
  return {
    prompt: '',
    savedPrompt: '',
    skill: '',
    model: '',
    name: '',
    mcp: '',
    cwd: '',
    profile: '',
    outputFormat: '',
    shareRecipients: [],
    debug: false,
    ...overrides
  }
}

describe('buildArgs', () => {
  it('starts with "agent run"', () => {
    const args = buildArgs(defaultOpts())
    expect(args[0]).toBe('agent')
    expect(args[1]).toBe('run')
  })

  it('adds --sandboxed when no profile is set', () => {
    const args = buildArgs(defaultOpts())
    expect(args).toContain('--sandboxed')
  })

  it('adds --profile and omits --sandboxed when profile is set', () => {
    const args = buildArgs(defaultOpts({ profile: 'my-profile' }))
    expect(args).toContain('--profile')
    expect(args).toContain('my-profile')
    expect(args).not.toContain('--sandboxed')
  })

  it('adds --prompt when provided', () => {
    const args = buildArgs(defaultOpts({ prompt: 'fix the bug' }))
    expect(args).toContain('--prompt')
    expect(args).toContain('fix the bug')
  })

  it('adds --saved-prompt when provided', () => {
    const args = buildArgs(defaultOpts({ savedPrompt: 'prompt-id-123' }))
    expect(args).toContain('--saved-prompt')
    expect(args).toContain('prompt-id-123')
  })

  it('adds --skill when provided', () => {
    const args = buildArgs(defaultOpts({ skill: 'review-pr' }))
    expect(args).toContain('--skill')
    expect(args).toContain('review-pr')
  })

  it('adds --model when provided', () => {
    const args = buildArgs(defaultOpts({ model: 'gpt-4' }))
    expect(args).toContain('--model')
    expect(args).toContain('gpt-4')
  })

  it('adds --name when provided', () => {
    const args = buildArgs(defaultOpts({ name: 'my-agent' }))
    expect(args).toContain('--name')
    expect(args).toContain('my-agent')
  })

  it('adds --mcp when provided', () => {
    const args = buildArgs(defaultOpts({ mcp: '{"servers":{}}' }))
    expect(args).toContain('--mcp')
    expect(args).toContain('{"servers":{}}')
  })

  it('adds --cwd when provided', () => {
    const args = buildArgs(defaultOpts({ cwd: '/tmp/work' }))
    expect(args).toContain('--cwd')
    expect(args).toContain('/tmp/work')
  })

  it('adds --output-format when provided', () => {
    const args = buildArgs(defaultOpts({ outputFormat: 'json' }))
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
  })

  it('adds --share for each recipient', () => {
    const args = buildArgs(
      defaultOpts({ shareRecipients: ['user1@example.com', 'user2@example.com'] })
    )
    const shareIndices = args.reduce<number[]>((acc, arg, i) => {
      if (arg === '--share') acc.push(i)
      return acc
    }, [])
    expect(shareIndices).toHaveLength(2)
    expect(args[shareIndices[0] + 1]).toBe('user1@example.com')
    expect(args[shareIndices[1] + 1]).toBe('user2@example.com')
  })

  it('adds --debug when debug is true', () => {
    const args = buildArgs(defaultOpts({ debug: true }))
    expect(args).toContain('--debug')
  })

  it('does not add --debug when debug is false', () => {
    const args = buildArgs(defaultOpts({ debug: false }))
    expect(args).not.toContain('--debug')
  })

  it('combines multiple options correctly', () => {
    const args = buildArgs(
      defaultOpts({
        prompt: 'do something',
        model: 'claude',
        skill: 'code-review',
        profile: 'prod',
        outputFormat: 'json',
        debug: true
      })
    )
    expect(args).toContain('--prompt')
    expect(args).toContain('--model')
    expect(args).toContain('--skill')
    expect(args).toContain('--profile')
    expect(args).toContain('--output-format')
    expect(args).toContain('--debug')
    expect(args).not.toContain('--sandboxed')
  })
})
