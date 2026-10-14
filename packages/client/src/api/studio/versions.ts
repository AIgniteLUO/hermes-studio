export const STUDIO_VERSION_MANIFEST_URL = 'https://api.github.com/repos/AIgniteLUO/hermes-studio/releases?per_page=100'

export interface StudioMobileLinkChannel {
  url: string
  online: boolean
}

export interface StudioMobileRelease {
  version: string
  channels: {
    androidApk: {
      githubUrl: string
      cloudflareUrl: string
      online: boolean
    }
    googlePlay: StudioMobileLinkChannel
    apple: {
      testFlightUrl: string
      appStoreUrl: string
      online: boolean
    }
    harmony: StudioMobileLinkChannel
  }
}

export interface StudioVersionManifest {
  schema: 1
  hermes: string[]
  mobile: StudioMobileRelease
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStudioMobileRelease(value: unknown): value is StudioMobileRelease {
  if (!isRecord(value) || typeof value.version !== 'string' || !isRecord(value.channels)) return false
  const { androidApk, googlePlay, apple, harmony } = value.channels
  return isRecord(androidApk)
    && isRecord(googlePlay)
    && isRecord(apple)
    && isRecord(harmony)
}

// GitHub Releases API tag for a downloadable Hermes runtime package.
const HERMES_RUNTIME_RELEASE_TAG = /^hermes-(.+)-runtime$/

function hermesVersionsFromGitHubReleases(releases: unknown[]): string[] {
  const versions: string[] = []
  for (const release of releases) {
    if (!isRecord(release)) continue
    const tag = release.tag_name
    if (typeof tag !== 'string') continue
    const version = HERMES_RUNTIME_RELEASE_TAG.exec(tag.trim())?.[1]?.trim()
    if (version && !versions.includes(version)) versions.push(version)
  }
  return versions
}

// This fork publishes no HStudio mobile app, so the GitHub Releases API response
// is reported with every mobile channel unavailable instead of vendor store links.
function unavailableMobileRelease(): StudioMobileRelease {
  return {
    version: '',
    channels: {
      androidApk: { githubUrl: '', cloudflareUrl: '', online: false },
      googlePlay: { url: '', online: false },
      apple: { testFlightUrl: '', appStoreUrl: '', online: false },
      harmony: { url: '', online: false },
    },
  }
}

function toStudioVersionManifest(value: unknown): StudioVersionManifest | null {
  if (isRecord(value) && value.schema === 1 && isStudioMobileRelease(value.mobile)) {
    return value as unknown as StudioVersionManifest
  }
  if (Array.isArray(value)) {
    return {
      schema: 1,
      hermes: hermesVersionsFromGitHubReleases(value),
      mobile: unavailableMobileRelease(),
    }
  }
  return null
}

export async function fetchStudioVersionManifest(): Promise<StudioVersionManifest> {
  const response = await fetch(STUDIO_VERSION_MANIFEST_URL, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`GET ${STUDIO_VERSION_MANIFEST_URL} returned ${response.status}`)
  const manifest = toStudioVersionManifest(await response.json())
  if (!manifest) throw new Error('Invalid Studio version manifest')
  return manifest
}
