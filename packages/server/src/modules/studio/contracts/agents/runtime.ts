export const AGENT_RUNTIMES = ['hermes'] as const

export type AgentRuntime = typeof AGENT_RUNTIMES[number]

const AGENT_RUNTIME_SET = new Set<string>(AGENT_RUNTIMES)

export function isAgentRuntime(value: unknown): value is AgentRuntime {
  return typeof value === 'string' && AGENT_RUNTIME_SET.has(value)
}