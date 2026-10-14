import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import type { StudioHealthDependencies } from '../contracts/health'

declare const __APP_VERSION__: string

type PackageInfo = {
  name: string
  version: string
}

function readPackageInfo(): PackageInfo | null {
  const candidatePaths = [
    // Dev/test from the repository root.
    resolve(process.cwd(), 'package.json'),
    // Direct TypeScript execution from the migrated Studio module.
    resolve(__dirname, '../../../../../../package.json'),
    // Bundled server: dist/server -> repository/package root.
    resolve(__dirname, '../../package.json'),
  ]

  for (const packagePath of candidatePaths) {
    if (!existsSync(packagePath)) continue
    try {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
      if (pkg?.name && pkg?.version) {
        return { name: String(pkg.name), version: String(pkg.version) }
      }
    } catch {
      // Try the next candidate path.
    }
  }
  return null
}

const UPDATE_CHECK_DISABLE_ENV = 'HERMES_WEB_UI_DISABLE_UPDATE_CHECK'
const UPDATE_CHECK_ENABLE_ENV = 'HERMES_WEB_UI_ENABLE_UPDATE_CHECK'

function isEnvFlagEnabled(name: string): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes'
}

/**
 * Registry version checks are opt-in, not opt-out.
 *
 * This fork has no npm distribution channel: `registry.npmjs.org/hermes-web-ui` is the
 * upstream author's package, not this build. Nothing may poll it by default, so the
 * check stays off unless HERMES_WEB_UI_ENABLE_UPDATE_CHECK explicitly re-enables it.
 * HERMES_WEB_UI_DISABLE_UPDATE_CHECK keeps working as an explicit opt-out (the desktop
 * shell pins it to 'true'), which is why it still wins when both are set.
 */
function isUpdateCheckDisabled(): boolean {
  if (isEnvFlagEnabled(UPDATE_CHECK_DISABLE_ENV)) return true
  return !isEnvFlagEnabled(UPDATE_CHECK_ENABLE_ENV)
}

function compareVersions(left: string, right: string): number {
  const normalize = (value: string) => value.trim().replace(/^v/i, '').split(/[.-]/)
  const leftParts = normalize(left)
  const rightParts = normalize(right)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] || '0'
    const rightPart = rightParts[index] || '0'
    const leftNumber = Number.parseInt(leftPart, 10)
    const rightNumber = Number.parseInt(rightPart, 10)
    const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
    const diff = numeric
      ? leftNumber - rightNumber
      : leftPart.localeCompare(rightPart, undefined, { numeric: true })
    if (diff !== 0) return diff
  }
  return 0
}

function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}

export class StudioHealthService {
  private readonly packageInfo = readPackageInfo()
  private readonly localVersion = typeof __APP_VERSION__ !== 'undefined'
    ? __APP_VERSION__
    : this.packageInfo?.version || ''
  private cachedLatestVersion = ''

  constructor(private readonly dependencies: StudioHealthDependencies) {}

  async checkLatestVersion(): Promise<void> {
    if (isUpdateCheckDisabled()) return
    try {
      const packageName = this.packageInfo?.name || 'hermes-web-ui'
      const registryName = encodeURIComponent(packageName)
      const response = await fetch(`https://registry.npmjs.org/${registryName}/latest`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return
      const data = await response.json() as { version: string }
      this.cachedLatestVersion = data.version
      if (this.localVersion
        && this.cachedLatestVersion
        && isNewerVersion(this.cachedLatestVersion, this.localVersion)) {
        console.log(`Update available: ${this.localVersion} → ${this.cachedLatestVersion}`)
      }
    } catch {
      // Version checks must not affect server health.
    }
  }

  startVersionCheck(): void {
    if (isUpdateCheckDisabled()) return
    setTimeout(() => this.checkLatestVersion(), 5000)
    setInterval(() => this.checkLatestVersion(), 30 * 60 * 1000)
  }

  async snapshot() {
    const rawVersion = await this.dependencies.getPrimaryAgentVersion()
    const primaryAgentVersion = rawVersion.split('\n')[0].replace('Hermes Agent ', '') || ''
    const agentBridge = await this.dependencies.getPrimaryAgentBridgeHealth()
    const updateCheckDisabled = isUpdateCheckDisabled()

    return {
      status: 'ok',
      platform: this.dependencies.platform,
      version: primaryAgentVersion,
      gateway: 'running',
      webui_version: this.localVersion,
      webui_latest: updateCheckDisabled ? '' : this.cachedLatestVersion,
      // Never advertise an actionable update: this fork removed the npm self-update
      // channel, so POST /api/studio/update and `hermes-web-ui update` both refuse.
      // Keeping this false guarantees the sidebar never renders its "Upgrade to
      // v{version}" button (AppSidebar.vue v-if="appStore.updateAvailable"), so no
      // control can lead to a guaranteed failure. `webui_latest` stays informational
      // for deployments that explicitly re-enable the registry check.
      webui_update_available: false,
      node_version: process.versions.node,
      agent_bridge: agentBridge,
      is_docker: this.dependencies.isDockerContainer(),
    }
  }
}
