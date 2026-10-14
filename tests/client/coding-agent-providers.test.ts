import { describe, expect, it } from 'vitest'
import {
  canScopedCodingAgentUseProvider,
  isAuthModelProvider,
} from '../../packages/client/src/utils/codingAgentProviders'

const SERVER_MANAGED_AUTH_PROVIDERS = [
  'nous',
  'openai-codex',
  'copilot',
  'xai-oauth',
  'qwen-oauth',
  'claude-oauth',
  'minimax-oauth',
] as const

const SCOPED_CODING_AGENTS = ['claude-code', 'codex', 'pi'] as const

describe('coding agent provider visibility', () => {
  it.each(SERVER_MANAGED_AUTH_PROVIDERS)(
    'classifies %s as a server-managed auth provider',
    (provider) => {
      expect(isAuthModelProvider(provider)).toBe(true)
    },
  )

  it.each(SCOPED_CODING_AGENTS)(
    'keeps every server-managed auth provider hidden from scoped %s sessions',
    (agentId) => {
      for (const provider of SERVER_MANAGED_AUTH_PROVIDERS) {
        expect(canScopedCodingAgentUseProvider(agentId, provider)).toBe(false)
      }
      expect(canScopedCodingAgentUseProvider(agentId, 'deepseek')).toBe(true)
    },
  )

  it('matches providers case- and whitespace-insensitively', () => {
    expect(isAuthModelProvider('  OpenAI-Codex ')).toBe(true)
    expect(canScopedCodingAgentUseProvider('codex', ' OpenAI-Codex ')).toBe(false)
    expect(canScopedCodingAgentUseProvider('codex', '')).toBe(true)
  })
})
