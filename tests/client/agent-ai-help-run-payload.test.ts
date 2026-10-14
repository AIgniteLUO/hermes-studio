// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

const chatApi = vi.hoisted(() => ({
  startRunViaSocket: vi.fn(),
  registerSessionHandlers: vi.fn(),
  unregisterSessionHandlers: vi.fn(),
  socketEmit: vi.fn(),
  getChatRunSocket: vi.fn(() => ({ emit: chatApi.socketEmit })),
  // Resolve the resume handshake synchronously so `switchSession` settles in the test.
  resumeSession: vi.fn((sessionId: string, onResumed: (data: unknown) => void) => {
    onResumed({ session_id: sessionId, messages: [], isWorking: false, events: [], queueLength: 0 })
    return {}
  }),
}))

vi.mock('@/api/studio/chat', () => ({
  startRunViaSocket: chatApi.startRunViaSocket,
  resumeSession: chatApi.resumeSession,
  registerSessionHandlers: chatApi.registerSessionHandlers,
  unregisterSessionHandlers: chatApi.unregisterSessionHandlers,
  getChatRunSocket: chatApi.getChatRunSocket,
  respondToolApproval: vi.fn(),
  respondClarify: vi.fn(),
  onPeerUserMessage: vi.fn(() => vi.fn()),
  onSessionCommand: vi.fn(() => vi.fn()),
  onSessionTitleUpdated: vi.fn(() => vi.fn()),
  onSessionWorkspaceUpdated: vi.fn(() => vi.fn()),
  onSessionSettingsUpdated: vi.fn(() => vi.fn()),
}))

vi.mock('@/api/client', () => ({
  getActiveProfileName: () => 'default',
  hasApiKey: () => false,
}))

vi.mock('@/api/studio/sessions', () => ({
  archiveSession: vi.fn(),
  deleteSession: vi.fn(),
  fetchSession: vi.fn(),
  fetchSessions: vi.fn(async () => []),
  fetchWorkspaceRunChangesForSession: vi.fn(async () => []),
  fetchWorkspaceRunChangeFile: vi.fn(async () => null),
  setSessionModel: vi.fn(),
  setSessionPushEnabled: vi.fn(),
  setSessionReasoningEffort: vi.fn(),
}))

vi.mock('@/api/studio/download', () => ({
  getDownloadUrl: (_path: string, name: string) => `/download/${name}`,
}))

vi.mock('@/utils/completion-sound', () => ({
  primeCompletionSound: vi.fn(),
  playCompletionSound: vi.fn(),
}))

const agentApi = vi.hoisted(() => ({
  checkCodingAgentUpdate: vi.fn(),
  deleteCodingAgent: vi.fn(),
  fetchCodingAgentsStatus: vi.fn(),
  installCodingAgent: vi.fn(),
  fetchAgentStatusSnapshot: vi.fn(),
  fetchRuntimeVersionStatus: vi.fn(),
}))

vi.mock('@/api/coding-agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/coding-agents')>()
  return {
    ...actual,
    checkCodingAgentUpdate: agentApi.checkCodingAgentUpdate,
    deleteCodingAgent: agentApi.deleteCodingAgent,
    fetchCodingAgentsStatus: agentApi.fetchCodingAgentsStatus,
    installCodingAgent: agentApi.installCodingAgent,
  }
})

vi.mock('@/api/agent-status', () => ({
  fetchAgentStatusSnapshot: agentApi.fetchAgentStatusSnapshot,
}))

vi.mock('@/api/hermes/runtime-versions', () => ({
  fetchRuntimeVersionStatus: agentApi.fetchRuntimeVersionStatus,
}))

vi.mock('@/components/layout/VersionManagementModal.vue', () => ({
  default: defineComponent({
    name: 'VersionManagementModal',
    props: { show: Boolean },
    template: '<div data-testid="runtime-manager-modal" />',
  }),
}))

vi.mock('@/components/hermes/chat/ChatPanel.vue', () => ({
  default: defineComponent({
    name: 'ChatPanel',
    props: {
      standalone: Boolean,
      initialComposerText: String,
      composerPersistDraft: Boolean,
    },
    template: '<div data-testid="ai-help-chat" />',
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('naive-ui', () => {
  const Slot = defineComponent({ template: '<div><slot /></div>' })
  return {
    NAlert: Slot,
    NButton: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      emits: ['click'],
      template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
    }),
    NDrawer: defineComponent({
      name: 'NDrawer',
      props: { show: Boolean, width: [String, Number] },
      emits: ['update:show'],
      template: '<aside v-if="show" class="n-drawer-stub"><slot /></aside>',
    }),
    NDrawerContent: defineComponent({
      name: 'NDrawerContent',
      props: { title: String },
      template: '<section><header>{{ title }}</header><slot /></section>',
    }),
    NPopconfirm: defineComponent({
      name: 'NPopconfirm',
      emits: ['positive-click'],
      template: '<div><slot name="trigger" /><slot /></div>',
    }),
    NSpin: Slot,
    NTag: defineComponent({ template: '<span><slot /></span>' }),
    useDialog: () => ({ warning: vi.fn() }),
    useMessage: () => ({ success: vi.fn(), error: vi.fn() }),
  }
})

import { useChatStore } from '@/stores/hermes/chat'
import AgentManagerView from '@/views/hermes/AgentManagerView.vue'

function agentStatusSnapshot() {
  return {
    revision: 1,
    updatedAt: '2026-08-27T00:00:00.000Z',
    agents: [
      { id: 'hermes', installed: true, source: 'managed-runtime', path: '/runtime/bin/hermes', version: '0.21.0' },
    ],
  }
}

describe('Agent Manager AI help run payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    chatApi.startRunViaSocket.mockReturnValue({ abort: vi.fn() })
    agentApi.fetchAgentStatusSnapshot.mockResolvedValue(agentStatusSnapshot())
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })
  })

  it('runs the AI help session as Hermes instead of falling back to claude-code', async () => {
    const wrapper = mount(AgentManagerView, {
      props: { sidebarCollapsed: false },
      global: {
        stubs: { VersionManagementModal: true },
      },
    })
    await flushPromises()

    const chatStore = useChatStore()
    const askAiButton = wrapper.get('.agent-manager-header-actions').findAll('button')
      .find(button => button.text() === 'agentManager.aiHelpDialogPositive')
    expect(askAiButton).toBeDefined()
    await askAiButton!.trigger('click')
    await flushPromises()

    // The drawer itself stays — only the Agent it runs on changed.
    const drawer = wrapper.get('.n-drawer-stub')
    expect(drawer.text()).toContain('agentManager.aiHelpDrawerTitle')

    const session = chatStore.activeSession
    expect(session).toBeTruthy()
    // The session must be Hermes-shaped: `source: 'coding_agent'` with a
    // non-coding agent is exactly what triggered the claude-code fallback.
    expect(session?.source).toBe('cli')
    expect(session?.agent).toBe('hermes')
    expect(session?.codingAgentId).toBeUndefined()

    await chatStore.sendMessage('diagnose the Agent installation')
    await flushPromises()

    expect(chatApi.startRunViaSocket).toHaveBeenCalledOnce()
    const payload = chatApi.startRunViaSocket.mock.calls[0][0]

    // A `source: 'coding_agent'` session whose agent is not a coding agent would
    // fall back to `coding_agent_id: 'claude-code'` + `mode: 'scoped'` in chat.ts.
    expect(payload.source).not.toBe('coding_agent')
    expect(payload.source).toBe('cli')
    expect(payload.coding_agent_id).toBeUndefined()
    expect(payload.mode).toBeUndefined()
  })
})
