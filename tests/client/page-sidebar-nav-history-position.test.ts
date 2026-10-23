import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const navSource = readFileSync(
  'packages/client/src/components/layout/PageSidebarNav.vue',
  'utf8',
)
const historyViewSource = readFileSync(
  'packages/client/src/views/hermes/HistoryView.vue',
  'utf8',
)

describe('page sidebar conversation switch', () => {
  it('places history after single chat, group chat, and workflow', () => {
    const switchStart = navSource.indexOf('conversation-switch conversation-switch--four')
    const switchSource = navSource.slice(switchStart)

    expect(switchStart).toBeGreaterThan(-1)
    expect(switchSource.indexOf('@click="openChat"')).toBeLessThan(switchSource.indexOf('@click="openGroupChat"'))
    expect(switchSource.indexOf('@click="openGroupChat"')).toBeLessThan(switchSource.indexOf('@click="openWorkflow"'))
    expect(switchSource.indexOf('@click="openWorkflow"')).toBeLessThan(switchSource.indexOf('@click="openHistory"'))
    expect(navSource.match(/@click="openHistory"/g)).toHaveLength(1)
  })

  it('shows the conversation switch on the history page', () => {
    const historyNav = historyViewSource.match(/<PageSidebarNav[\s\S]*?\/>/)?.[0] || ''

    expect(historyNav).toContain('active="history"')
    expect(historyNav).not.toContain('hide-mode-switch')
  })

  it('puts the Hermes Agent config entry directly below models', () => {
    const tabsStart = navSource.indexOf('page-sidebar-tabs')
    const tabsEnd = navSource.indexOf('conversation-switch conversation-switch--four')
    const tabsSource = navSource.slice(tabsStart, tabsEnd)

    expect(navSource).toContain('@click="openHermesAgentConfig"')
    expect(navSource).toContain("router.push({ name: 'hermes.configSettings' })")
    expect(navSource).toContain("t('sidebar.hermesAgentConfig')")
    // 顺序:新建对话 → 搜索 → 模型 → Hermes Agent 配置
    expect(tabsSource.indexOf('@click="openModels"')).toBeGreaterThan(-1)
    expect(tabsSource.indexOf('@click="openModels"')).toBeLessThan(
      tabsSource.indexOf('@click="openHermesAgentConfig"'),
    )
  })
})
