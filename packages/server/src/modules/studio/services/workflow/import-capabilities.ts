import { createHash } from 'crypto'

interface CapabilityGroup { provider: string; models: string[] }

function normalizedProviderModels(groups: CapabilityGroup[]): Set<string> {
  return new Set(groups.flatMap(group => (group.models || []).map(model => `${group.provider}\u0000${model}`)))
}

export function workflowImportEnvironmentRevision(groups: CapabilityGroup[]): string {
  return createHash('sha256').update(JSON.stringify({ models: [...normalizedProviderModels(groups)].sort() })).digest('hex')
}

export function assertWorkflowImportCapabilities(nodes: unknown[], groups: CapabilityGroup[]): void {
  const configuredProviderModels = normalizedProviderModels(groups)
  for (const raw of nodes) {
    const node = raw && typeof raw === 'object' ? raw as Record<string, any> : {}
    const data = node.data && typeof node.data === 'object' ? node.data as Record<string, any> : {}
    const provider = typeof data.provider === 'string' ? data.provider.trim() : ''
    const model = typeof data.model === 'string' ? data.model.trim() : ''
    if (!provider && !model) continue
    if (!configuredProviderModels.has(`${provider}\u0000${model}`)) {
      throw Object.assign(new Error(`workflow node ${String(node.id || '?')} target capability is unavailable in profile`), { status: 409 })
    }
  }
}
