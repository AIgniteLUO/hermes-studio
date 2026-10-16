import { describe, expect, it } from 'vitest'
import {
  AGENT_RUNTIMES,
  RUN_MODES,
  RUN_SURFACES,
  isAgentRuntime,
  isRunMode,
  isRunSurface,
} from '../../packages/server/src/modules/studio'

describe('Studio agent contracts', () => {
  it('recognizes only the Hermes runtime', () => {
    expect(AGENT_RUNTIMES).toEqual(['hermes'])
    expect(isAgentRuntime('hermes')).toBe(true)
    expect(isAgentRuntime('claude-code')).toBe(false)
    expect(isAgentRuntime('codex')).toBe(false)
    expect(isAgentRuntime('pi')).toBe(false)
    expect(isAgentRuntime('ekko-agent')).toBe(false)
  })

  it('keeps launch surface and mode independent from runtime', () => {
    expect(RUN_SURFACES).toEqual(['chat', 'workflow', 'group-chat', 'api'])
    expect(RUN_MODES).toEqual(['scoped', 'global'])
    expect(isRunSurface('workflow')).toBe(true)
    expect(isRunSurface('coding_agent')).toBe(false)
    expect(isRunSurface('global-agent')).toBe(false)
    expect(isRunMode('global')).toBe(true)
  })
})