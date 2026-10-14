import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchStudioVersionManifest,
  STUDIO_VERSION_MANIFEST_URL,
} from '../../packages/client/src/api/studio/versions'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Studio version manifest client', () => {
  it('loads the production Studio manifest', async () => {
    const manifest = {
      schema: 1 as const,
      hermes: ['0.20.4'],
      mobile: {
        version: '1.0.0',
        channels: {
          androidApk: { githubUrl: 'https://github.example/app.apk', cloudflareUrl: 'https://cf.example/app.apk', online: true },
          googlePlay: { url: 'https://play.google.com/app', online: true },
          apple: { testFlightUrl: 'https://testflight.apple.com/join/test', appStoreUrl: 'https://apps.apple.com/app/test', online: true },
          harmony: { url: 'https://appgallery.huawei.com/app/test', online: true },
        },
      },
    }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => manifest })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchStudioVersionManifest()).resolves.toEqual(manifest)
    expect(STUDIO_VERSION_MANIFEST_URL).toBe('https://api.github.com/repos/AIgniteLUO/hermes-studio/releases?per_page=100')
    expect(fetchMock).toHaveBeenCalledWith(STUDIO_VERSION_MANIFEST_URL, {
      headers: { Accept: 'application/json' },
    })
  })

  it('maps a GitHub Releases API response onto the Studio manifest shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        { tag_name: 'hermes-0.20.4-runtime' },
        { tag_name: 'hermes-0.19.1-runtime' },
        { tag_name: 'hermes-0.20.4-runtime' },
        { tag_name: 'v0.7.34-1' },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const manifest = await fetchStudioVersionManifest()

    expect(manifest.schema).toBe(1)
    expect(manifest.hermes).toEqual(['0.20.4', '0.19.1'])
    expect(manifest.mobile.channels.androidApk).toEqual({ githubUrl: '', cloudflareUrl: '', online: false })
    expect(manifest.mobile.channels.googlePlay).toEqual({ url: '', online: false })
    expect(manifest.mobile.channels.apple).toEqual({ testFlightUrl: '', appStoreUrl: '', online: false })
    expect(manifest.mobile.channels.harmony).toEqual({ url: '', online: false })
    expect(fetchMock).toHaveBeenCalledWith(STUDIO_VERSION_MANIFEST_URL, {
      headers: { Accept: 'application/json' },
    })
  })

  it('rejects an invalid response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema: 1 }) }))

    await expect(fetchStudioVersionManifest()).rejects.toThrow('Invalid Studio version manifest')
  })
})
