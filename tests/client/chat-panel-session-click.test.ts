import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

describe('ChatPanel session clicks', () => {
  it('switches the store when the route is already on the clicked session', () => {
    const source = readFileSync('packages/client/src/components/hermes/chat/ChatPanel.vue', 'utf8')

    expect(source).toContain('if (chatStore.activeSessionId !== sessionId)')
    expect(source).toContain('await chatStore.switchSession(sessionId)')
  })

  it('opens desktop sessions in a native chat window while preserving the web tab fallback', () => {
    const source = readFileSync('packages/client/src/components/hermes/chat/ChatPanel.vue', 'utf8')

    expect(source).toContain('bridge.openChatWindow(sessionId, sessionProfile(sessionId) || undefined)')
    expect(source).toContain('window.open(sessionHref(sessionId), "_blank", "noopener,noreferrer")')
    expect(source).toContain('v-if="currentMode === \'chat\' && !standalone"')
    expect(source).toContain('<header v-if="!standalone" class="chat-header">')
  })

  it('replays the whole chat surface fade without remounting the input', () => {
    const source = readFileSync('packages/client/src/components/hermes/chat/ChatPanel.vue', 'utf8')

    expect(source).toContain('ref="chatMainContentRef" class="chat-main-content"')
    expect(source).toContain('() => chatStore.activeSessionId')
    expect(source).toContain('sessionFadeAnimation = surface.animate(')
    expect(source).toContain('sessionFadeAnimation?.cancel()')
    expect(source).not.toContain(':key="chatStore.activeSessionId" class="chat-main-content"')
  })

  it('keeps the custom session model provider below the scrollable model lists', () => {
    const source = readFileSync('packages/client/src/components/hermes/chat/ChatPanel.vue', 'utf8')
    const modalStart = source.indexOf('v-model:show="showSessionModelModal"')
    const modalEnd = source.indexOf('</NModal>', modalStart)
    const modal = source.slice(modalStart, modalEnd)
    const standardList = modal.indexOf('<div v-if="sessionModelKind === \'model\'" class="session-model-list"')
    const moaList = modal.indexOf('<div v-else class="session-model-list"', standardList)
    const customFooter = modal.indexOf('<div v-if="sessionModelKind === \'model\'" class="session-model-custom"', moaList)

    expect(standardList).toBeGreaterThanOrEqual(0)
    expect(moaList).toBeGreaterThan(standardList)
    expect(customFooter).toBeGreaterThan(moaList)
    expect(modal.slice(standardList, moaList)).not.toContain('session-model-custom')
  })

  it('uses the active sidebar model as the new chat default for the active profile', () => {
    const source = readFileSync('packages/client/src/components/hermes/chat/ChatPanel.vue', 'utf8')

    expect(source).toContain('const selectedProvider = appStore.selectedProvider || ""')
    expect(source).toContain('const selectedModel = appStore.selectedModel || ""')
    expect(source).toContain('profile === activeProfileName')
    expect(source).toContain('selectedGroup?.models.includes(selectedModel)')
  })

  it('uses a create action in the new chat drawer instead of duplicating the new chat trigger label', () => {
    const source = readFileSync('packages/client/src/components/hermes/chat/ChatPanel.vue', 'utf8')

    expect(source).toContain('{{ t("common.create") }}')
    expect(source).not.toContain('{{ t("chat.newChat") }}\n            </NButton>')
  })

  it('offers MoA for session creation and switching', () => {
    const source = readFileSync('packages/client/src/components/hermes/chat/ChatPanel.vue', 'utf8')

    expect(source).toContain('const newChatCanUseMoa = computed(() => Boolean(newChatMoaGroup.value?.models.length))')
    expect(source).toContain('name="new-chat-model-kind"')
    expect(source).toContain('name="session-model-kind"')
    expect(source).toContain("{{ t('chat.modelType') }}")
    expect(source).toContain('<NRadioButton value="model">{{ t(\'chat.standardModels\') }}</NRadioButton>')
    expect(source).toContain('<NRadioButton value="moa">{{ t(\'chat.moaPresets\') }}</NRadioButton>')
    expect(source).toContain('await applySessionModelSwitch(preset, "moa")')
  })
})
