// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

const routerReplace = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { tab: 'runtime' } }),
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}))

vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    NSpin: defineComponent({
      name: 'NSpin',
      setup(_props, { slots }) {
        return () => h('div', slots.default?.())
      },
    }),
    NTabPane: defineComponent({
      name: 'NTabPane',
      props: { name: String, tab: String },
      setup(props, { slots }) {
        return () => h('section', { 'data-tab': props.name }, slots.default?.())
      },
    }),
    NTabs: defineComponent({
      name: 'NTabs',
      props: { value: String },
      emits: ['update:value'],
      setup(props, { slots }) {
        return () => h('div', { class: 'n-tabs-stub', 'data-value': props.value }, slots.default?.())
      },
    }),
  }
})

vi.mock('@/stores/hermes/settings', () => ({
  useSettingsStore: () => ({
    loading: false,
    saving: false,
    fetchSettings: vi.fn(async () => {}),
  }),
}))
vi.mock('@/stores/hermes/profiles', () => ({
  useProfilesStore: () => ({
    activeProfileName: 'default',
    profiles: [{ name: 'default' }],
    fetchProfiles: vi.fn(async () => {}),
  }),
}))
vi.mock('@/api/client', () => ({ isStoredSuperAdmin: () => false }))

vi.mock('@/components/hermes/settings/AccountSettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/AgentSettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/CompressionSettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/DisplaySettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/GatewayAutoStartSettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/MemorySettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/ModelSettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/PrivacySettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/ProxySettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/SessionSettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/UserManagementSettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/WebhookSettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/settings/HermesRuntimeSummary.vue', () => ({
  default: { name: 'HermesRuntimeSummary', template: '<div data-testid="hermes-runtime-summary-stub" />' },
}))
vi.mock('@/components/hermes/settings/RuntimeSettings.vue', () => ({
  default: { name: 'RuntimeSettings', template: '<div data-testid="runtime-settings-stub" />' },
}))

import SettingsView from '@/views/hermes/SettingsView.vue'

describe('settings runtime tab', () => {
  it('accepts the runtime tab from the route query without falling back to account', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    await wrapper.vm.$nextTick()

    // runtime 不被 normalizeTab 回落为 account
    expect(wrapper.findComponent({ name: 'NTabs' }).props('value')).toBe('runtime')
    expect(routerReplace).not.toHaveBeenCalled()
    expect(wrapper.find('[data-tab="runtime"]').exists()).toBe(true)
  })

  it('mounts the extracted runtime manager inside the runtime tab', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    await wrapper.vm.$nextTick()

    const runtimeTab = wrapper.get('[data-tab="runtime"]')
    expect(runtimeTab.find('[data-testid="hermes-runtime-summary-stub"]').exists()).toBe(true)
    expect(runtimeTab.find('[data-testid="runtime-settings-stub"]').exists()).toBe(true)
  })

  it('keeps the Hermes agent tabs on the same page as runtime', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    await wrapper.vm.$nextTick()

    for (const tab of ['agent', 'memory', 'session']) {
      expect(wrapper.find(`[data-tab="${tab}"]`).exists()).toBe(true)
    }
  })
})
