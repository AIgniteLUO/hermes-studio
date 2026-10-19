import { describe, expect, it } from 'vitest'
import { chatSessionAgentAvatar } from '@/utils/chat-agent-avatar'

const HERMES_AVATAR = { label: 'Hermes', src: '/agents/hermes.png' }

describe('single chat Agent avatars', () => {
  it.each([
    [{ agent: 'hermes' }],
    [{ agent: 'ekko-agent' }],
    [{ agent: 'claude' }],
    [{ agent: 'codex' }],
    [{ agent: 'pi' }],
    [{ source: 'coding_agent' }],
    [{}],
    [null],
  ])('renders every session, including historical identities, as Hermes', (session) => {
    expect(chatSessionAgentAvatar(session as any)).toEqual(HERMES_AVATAR)
  })
})
