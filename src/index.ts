import * as core from '@actions/core'
import { runAgent } from './agent.js'

try {
  await runAgent()
} catch (error) {
  if (error instanceof Error) {
    core.setFailed(error.message)
  } else {
    core.setFailed(String(error))
  }
}
