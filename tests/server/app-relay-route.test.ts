import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readAppConfig, writeAppConfig } = vi.hoisted(() => ({
  readAppConfig: vi.fn(),
  writeAppConfig: vi.fn(),
}))

vi.mock('../../packages/server/src/modules/studio/services/config/app-config', () => ({
  readAppConfig,
  writeAppConfig,
}))

// Every route resolves to the relay configured through HERMES_APP_RELAY_URL; this
// build ships no vendor cloud relay URL.
vi.mock('../../packages/server/src/modules/studio/public/config', () => ({
  config: {
    appRelay: { url: 'https://relay.example.test', entitlementRequired: false },
  },
}))

describe('App Relay route configuration', () => {
  beforeEach(() => {
    readAppConfig.mockReset()
    writeAppConfig.mockReset()
    readAppConfig.mockResolvedValue({})
    writeAppConfig.mockResolvedValue({})
  })

  it('defaults old configs to the official route', async () => {
    const { getAppRelayRoute, appRelayUrlForRoute } = await import(
      '../../packages/server/src/modules/studio/services/app-relay/route'
    )

    expect(await getAppRelayRoute()).toBe('official')
    expect(appRelayUrlForRoute('official')).toBe('https://relay.example.test')
    expect(appRelayUrlForRoute('cloudflare')).toBe('https://relay.example.test')
  })

  it('persists the selected route while both routes keep using the configured relay', async () => {
    const { setAppRelayRoute, appRelayUrlForRoute } = await import(
      '../../packages/server/src/modules/studio/services/app-relay/route'
    )

    await setAppRelayRoute('cloudflare')
    expect(writeAppConfig).toHaveBeenCalledWith({ appRelayRoute: 'cloudflare' })
    expect(appRelayUrlForRoute('cloudflare')).toBe('https://relay.example.test')
  })
})
