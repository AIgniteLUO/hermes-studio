import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetAgentStatusRegistryForTests,
  updateAgentStatus,
} from '../../packages/server/src/modules/studio/public/agent-status-registry'
import {
  AGENT_NOT_INSTALLED,
  assertAgentAvailable,
  resolveAgentStatusId,
} from '../../packages/server/src/modules/studio/services/agent-availability'

describe('Agent availability validation', () => {
  beforeEach(resetAgentStatusRegistryForTests)

  it('resolves only the Hermes runtime', () => {
    expect(resolveAgentStatusId('hermes')).toBe('hermes')
    // Removed runtimes resolve to null so callers must reject them.
    expect(resolveAgentStatusId('claude')).toBeNull()
    expect(resolveAgentStatusId('claude-code')).toBeNull()
    expect(resolveAgentStatusId('codex')).toBeNull()
    expect(resolveAgentStatusId('pi')).toBeNull()
    expect(resolveAgentStatusId('ekko')).toBeNull()
  })

  it('rejects unavailable and removed Agents with stable error codes', () => {
    expect(() => assertAgentAvailable('hermes')).toThrow('Hermes is not installed')

    try {
      assertAgentAvailable('hermes')
    } catch (error: any) {
      expect(error).toMatchObject({ status: 409, code: AGENT_NOT_INSTALLED, agent: 'hermes' })
    }

    updateAgentStatus('hermes', {
      installed: true,
      source: 'user-cli',
      path: '/usr/local/bin/hermes',
    })
    expect(assertAgentAvailable('hermes')).toBe('hermes')

    expect(() => assertAgentAvailable('codex')).toThrow('Invalid agent')
    try {
      assertAgentAvailable('codex')
    } catch (error: any) {
      expect(error).toMatchObject({ status: 400, code: 'INVALID_AGENT' })
    }
  })

  it('validates every workflow node before execution', async () => {
    const { assertWorkflowAgentDependencies } = await import(
      '../../packages/server/src/modules/studio/services/workflow/manager'
    )
    const nodes = [{
      id: 'node-1',
      type: 'agent',
      data: {
        title: 'Reviewer',
        agent: 'hermes',
        provider: 'openai',
        model: 'gpt-test',
        reasoningEffort: '',
        input: 'Review',
        skills: [],
        images: [],
        approvalRequired: false,
        orchestration: { join: 'all' as const },
      },
    }]

    expect(() => assertWorkflowAgentDependencies(nodes)).toThrow('Hermes is not installed')
    updateAgentStatus('hermes', { installed: true, source: 'user-cli', path: '/usr/local/bin/hermes' })
    expect(() => assertWorkflowAgentDependencies(nodes)).not.toThrow()
  })
})
