import {
  isAgentAvailable,
  type AgentStatusId,
} from '../public/agent-status-registry'

// Historical aliases ('claude', 'claude-code', 'codex', 'pi') are no longer
// accepted: those agents are gone, and group-chat/workflow validation should
// reject them instead of silently rerouting to Hermes.
const AGENT_ALIASES: Record<string, AgentStatusId> = {
  hermes: 'hermes',
}

const AGENT_NAMES: Record<AgentStatusId, string> = {
  hermes: 'Hermes',
}

export const AGENT_NOT_INSTALLED = 'AGENT_NOT_INSTALLED'

export function resolveAgentStatusId(agent: unknown): AgentStatusId | null {
  const key = typeof agent === 'string' ? agent.trim().toLowerCase() : ''
  return AGENT_ALIASES[key] || null
}

export function assertAgentAvailable(agent: unknown): AgentStatusId {
  const id = resolveAgentStatusId(agent)
  if (!id) {
    throw Object.assign(new Error('Invalid agent'), { status: 400, code: 'INVALID_AGENT' })
  }
  if (!isAgentAvailable(id)) {
    throw Object.assign(new Error(`${AGENT_NAMES[id]} is not installed`), {
      status: 409,
      code: AGENT_NOT_INSTALLED,
      agent: id,
    })
  }
  return id
}
