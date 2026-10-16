import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { config } from '../../../studio/public/config'
import { logger } from '../../../studio/public/logging'
import { updateConfigYamlForProfile } from '../../../studio/public/profile-config'
import { isPathWithin } from '../runtime/path'
import { listProfileNamesFromDisk } from '../profiles/profile'

// Studio used to ship a bundled MCP server (`bin/hermes-studio-mcp.mjs`) and
// injected four managed entries into every Hermes profile's `config.yaml` on
// startup. That server has been removed, so this module now performs the
// inverse: it strips the managed entries it previously wrote, so a profile
// carried over from an older Studio does not keep launching a script that no
// longer exists.

const MANAGED_ENV_KEY = 'HERMES_WEB_UI_MANAGED_MCP'
// The launcher command names Studio shipped. A config entry whose command is
// one of these can only have come from Studio, in any Studio version.
const SHIPPED_COMMANDS = new Set([
  'hermes-lan-peer-mcp',
  'hermes-devices-mcp',
  'hermes-web-ui-mcp',
  'hermes-studio-mcp',
])

export type BundledMcpCleanupStatus = 'cleaned' | 'unchanged'

export interface BundledMcpCleanupTargetResult {
  profile: string
  status: BundledMcpCleanupStatus
}

export interface BundledMcpCleanupResult {
  targets: BundledMcpCleanupTargetResult[]
}

function isEnabledEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

function isDisabled(): boolean {
  return isEnabledEnv(process.env.HERMES_WEB_UI_DISABLE_MCP_CLEANUP)
}

function allowTransientCleanup(): boolean {
  return isEnabledEnv(process.env.HERMES_WEB_UI_ALLOW_TRANSIENT_MCP_CLEANUP)
}

function canonicalPath(pathname: string): string {
  try {
    return realpathSync(pathname)
  } catch {
    return resolve(pathname)
  }
}

function isTransientPath(pathname: string): boolean {
  const candidate = canonicalPath(pathname)
  return [tmpdir(), '/tmp', '/private/tmp']
    .filter(Boolean)
    .some(root => isPathWithin(candidate, canonicalPath(root)))
}

function shouldSkipTransientCleanup(): boolean {
  if (allowTransientCleanup()) return false
  return isTransientPath(config.appHome)
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

// Only entries this module's predecessor could have written are removable: the
// managed env marker, or one of the four command names Studio itself shipped.
// This mirrors the injector's scope exactly, so cleanup removes precisely what
// injection would have created — no more.
function isManagedServer(server: unknown): boolean {
  if (!isRecord(server)) return false
  if (isRecord(server.env) && server.env[MANAGED_ENV_KEY] === '1') return true
  return typeof server.command === 'string' && SHIPPED_COMMANDS.has(server.command)
}

async function cleanProfile(profile: string): Promise<BundledMcpCleanupTargetResult> {
  return await updateConfigYamlForProfile(profile, current => {
    const cfg = isRecord(current) ? current : {}
    if (!isRecord(cfg.mcp_servers)) {
      return {
        data: cfg,
        write: false,
        result: { profile, status: 'unchanged' } satisfies BundledMcpCleanupTargetResult,
      }
    }

    let removed = 0
    const kept: Record<string, unknown> = {}

    for (const [name, server] of Object.entries(cfg.mcp_servers)) {
      if (isManagedServer(server)) {
        removed += 1
        continue
      }
      kept[name] = server
    }

    if (removed === 0) {
      return {
        data: cfg,
        write: false,
        result: { profile, status: 'unchanged' } satisfies BundledMcpCleanupTargetResult,
      }
    }

    cfg.mcp_servers = kept
    return {
      data: cfg,
      result: { profile, status: 'cleaned' } satisfies BundledMcpCleanupTargetResult,
    }
  }) as BundledMcpCleanupTargetResult
}

export async function cleanupBundledMcpServer(): Promise<BundledMcpCleanupResult> {
  const result: BundledMcpCleanupResult = { targets: [] }

  if (isDisabled()) {
    logger.info('[mcp-cleanup] disabled by HERMES_WEB_UI_DISABLE_MCP_CLEANUP')
    return result
  }

  if (shouldSkipTransientCleanup()) {
    logger.info(
      { appHome: config.appHome },
      '[mcp-cleanup] skipped for transient Web UI home',
    )
    return result
  }

  for (const profile of listProfileNamesFromDisk()) {
    result.targets.push(await cleanProfile(profile))
  }

  const cleaned = result.targets.filter(target => target.status === 'cleaned')
  if (cleaned.length > 0) {
    logger.info({ targets: cleaned }, '[mcp-cleanup] removed bundled MCP server entries')
  }

  return result
}