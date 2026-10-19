import { describe, expect, it } from 'vitest'
import { chatSessionAgentAvatar } from '@/utils/chat-agent-avatar'

const HERMES_AVATAR = { label: 'Hermes', src: '/agents/hermes.png' }

describe('single chat Agent avatars', () => {
  it.each<[string, Parameters<typeof chatSessionAgentAvatar>[0]]>([
    ['hermes', { agent: 'hermes' }],
    ['legacy ekko', { agent: 'ekko-agent' }],
    ['legacy claude', { agent: 'claude' }],
    ['legacy codex', { agent: 'codex' }],
    ['legacy pi', { agent: 'pi' }],
    ['legacy coding source', { source: 'coding_agent' }],
    ['empty', {}],
    ['missing', null],
  ])('renders the %s session as Hermes', (_name, session) => {
    expect(chatSessionAgentAvatar(session)).toEqual(HERMES_AVATAR)
  })
})
