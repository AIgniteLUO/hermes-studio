export interface ChatAgentAvatar {
  label: 'Hermes'
  src: string
}

interface ChatAgentSessionIdentity {
  source?: string
  agent?: string
}

// Every session is Hermes now; historical rows from removed runtimes render
// the same icon rather than erroring.
const HERMES_AVATAR: ChatAgentAvatar = { label: 'Hermes', src: '/agents/hermes.png' }

export function chatSessionAgentAvatar(_session?: ChatAgentSessionIdentity | null): ChatAgentAvatar {
  return HERMES_AVATAR
}
