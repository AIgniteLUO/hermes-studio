import type { ChatCodingAgentId } from '@/api/coding-agents'

const SCOPED_EXTERNAL_AGENT_AUTH_PROVIDERS = new Set([
  'openai-codex',
  'copilot',
  'xai-oauth',
  'qwen-oauth',
  'nous',
  'claude-oauth',
  'minimax-oauth',
])

export function isAuthModelProvider(provider?: string): boolean {
  return SCOPED_EXTERNAL_AGENT_AUTH_PROVIDERS.has(String(provider || '').trim().toLowerCase())
}

export function canScopedCodingAgentUseProvider(
  _agentId: ChatCodingAgentId,
  provider?: string,
): boolean {
  return !isAuthModelProvider(provider)
}
