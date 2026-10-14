import { describe, expect, it } from 'vitest'
import { chatSessionAgentAvatar } from '@/utils/chat-agent-avatar'

describe('single chat Agent avatars', () => {
  // Rows 2-3 feed the runtime ids persisted by builds that still shipped the
  // built-in agent, so they pin the Hermes fallback for stored legacy sessions.
  it.each([
    ['Hermes', { agent: 'hermes' }, '/coding-agents/hermes.png'],
    ['Hermes', { agent: 'ekko-agent' }, '/coding-agents/hermes.png'],
    ['Hermes', { agent: 'ekko_agent' }, '/coding-agents/hermes.png'],
    ['Claude', { agent: 'claude' }, '/coding-agents/claude-code.svg'],
    ['Claude', { codingAgentId: 'claude-code' }, '/coding-agents/claude-code.svg'],
    ['Codex', { codingAgentId: 'codex' }, '/coding-agents/codex-openai.png'],
    ['Pi', { codingAgentId: 'pi' }, '/coding-agents/pi.svg'],
  ])('maps session identity to the $label avatar', (label, session, src) => {
    expect(chatSessionAgentAvatar(session)).toEqual({ label, src })
  })

  it('caps the avatar label set at the four surviving agents', () => {
    const labels = ['hermes', 'ekko-agent', 'claude', 'codex', 'pi', 'unknown-agent']
      .map(agent => chatSessionAgentAvatar({ agent }).label)

    expect(new Set(labels)).toEqual(new Set(['Hermes', 'Claude', 'Codex', 'Pi']))
  })

  it('keeps legacy Coding Agent sessions without identity on the Claude avatar', () => {
    expect(chatSessionAgentAvatar({ source: 'coding_agent' })).toEqual({
      label: 'Claude',
      src: '/coding-agents/claude-code.svg',
    })
  })
})
