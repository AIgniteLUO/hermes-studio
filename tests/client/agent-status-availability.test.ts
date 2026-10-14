// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  agentInstallationState,
  isAgentStatusAvailable,
  resolveAgentStatusId,
  type AgentAvailabilitySnapshot,
  type AgentStatusSnapshot,
} from '../../packages/client/src/api/agent-status'

function snapshot(): AgentStatusSnapshot {
  return {
    revision: 1,
    updatedAt: new Date(0).toISOString(),
    agents: [
      { id: 'hermes', installed: false, source: 'not-installed', path: '', version: '' },
      { id: 'claude-code', installed: false, source: 'not-installed', path: '', version: '' },
      { id: 'codex', installed: true, source: 'user-cli', path: '/usr/local/bin/codex', version: '1.0.0' },
      { id: 'pi', installed: false, source: 'not-installed', path: '', version: '' },
    ],
  }
}

describe('Agent status availability', () => {
  it('normalizes group-chat and workflow Agent aliases', () => {
    expect(resolveAgentStatusId('hermes')).toBe('hermes')
    expect(resolveAgentStatusId('claude')).toBe('claude-code')
    expect(resolveAgentStatusId('codex')).toBe('codex')
    expect(resolveAgentStatusId('pi')).toBe('pi')
  })

  it('rejects the runtime that is no longer shipped instead of mapping it to a coding agent', () => {
    // Both the display alias used by group chat and the internal id persisted by
    // older builds must resolve to null so no picker can offer the agent again.
    expect(resolveAgentStatusId('ekko')).toBeNull()
    expect(resolveAgentStatusId('ekko-agent')).toBeNull()
    expect(resolveAgentStatusId('ekko_agent')).toBeNull()
  })

  it('only exposes Agents that the server inventory marks installed', () => {
    const status = snapshot()

    expect(isAgentStatusAvailable(status, 'hermes')).toBe(false)
    expect(isAgentStatusAvailable(status, 'claude-code')).toBe(false)
    expect(isAgentStatusAvailable(status, 'codex')).toBe(true)
    expect(isAgentStatusAvailable(status, 'pi')).toBe(false)
    // A removed runtime is never available, whatever the inventory reports.
    expect(isAgentStatusAvailable(status, 'ekko')).toBe(false)
  })

  it('uses the shared inventory state without requiring a version or executable path', () => {
    const availability: AgentAvailabilitySnapshot = {
      revision: 2,
      updatedAt: new Date(0).toISOString(),
      agents: [
        { id: 'hermes', installed: true, source: 'managed-runtime' },
      ],
    }

    expect(agentInstallationState(availability, 'hermes')).toBe('installed')
    availability.agents[0] = { id: 'hermes', installed: false, source: 'not-installed' }
    expect(agentInstallationState(availability, 'hermes')).toBe('not-installed')
    expect(agentInstallationState(null, 'hermes')).toBe('unknown')
    expect(agentInstallationState(availability, 'ekko')).toBe('unknown')
  })
})
