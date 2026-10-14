import { config } from '../../public/config'
import { readAppConfig, writeAppConfig } from '../config/app-config'

export type AppRelayRoute = 'official' | 'cloudflare'

export const DEFAULT_APP_RELAY_ROUTE: AppRelayRoute = 'official'

export function isAppRelayRoute(value: unknown): value is AppRelayRoute {
  return value === 'official' || value === 'cloudflare'
}

export function normalizeAppRelayRoute(value: unknown): AppRelayRoute {
  return isAppRelayRoute(value) ? value : DEFAULT_APP_RELAY_ROUTE
}

export async function getAppRelayRoute(): Promise<AppRelayRoute> {
  return normalizeAppRelayRoute((await readAppConfig()).appRelayRoute)
}

export async function setAppRelayRoute(route: AppRelayRoute): Promise<void> {
  const current = await readAppConfig()
  if (current.appRelayRoute === route) return
  await writeAppConfig({ appRelayRoute: route })
}

// This build has no vendor cloud relay: every route resolves to the relay configured
// through HERMES_APP_RELAY_URL, so an unconfigured deployment stays offline.
export function appRelayUrlForRoute(_route: AppRelayRoute): string {
  return config.appRelay.url
}
