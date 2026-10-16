import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const updateConfigYamlForProfileMock = vi.fn()
const listProfileNamesFromDiskMock = vi.fn()

const configMock = vi.hoisted(() => ({
  port: 8648,
  appHome: '/Users/test/.hermes-web-ui',
}))

vi.mock('../../packages/server/src/modules/studio/public/profile-config', () => ({
  updateConfigYamlForProfile: updateConfigYamlForProfileMock,
}))

vi.mock('../../packages/server/src/modules/hermes/services/profiles/profile', () => ({
  listProfileNamesFromDisk: listProfileNamesFromDiskMock,
}))

vi.mock('../../packages/server/src/modules/studio/public/config', () => ({
  config: configMock,
}))

vi.mock('../../packages/server/src/modules/studio/public/logging', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

async function loadCleanup() {
  return await import('../../packages/server/src/modules/hermes/services/mcp/studio-mcp-cleanup')
}

// Run the updater the module hands to updateConfigYamlForProfile against a
// given starting config, and report both the resulting config and the status.
async function cleanWith(start: Record<string, unknown>) {
  const { cleanupBundledMcpServer } = await loadCleanup()
  await cleanupBundledMcpServer()
  const calls = updateConfigYamlForProfileMock.mock.calls as Array<[string, (current: unknown) => any]>
  const last = calls[calls.length - 1]
  const updated = await last[1](start)
  return updated
}

describe('studio MCP cleanup', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.HERMES_WEB_UI_DISABLE_MCP_CLEANUP
    delete process.env.HERMES_WEB_UI_ALLOW_TRANSIENT_MCP_CLEANUP
    configMock.appHome = '/Users/test/.hermes-web-ui'
    listProfileNamesFromDiskMock.mockReturnValue(['default', 'work'])
    updateConfigYamlForProfileMock.mockImplementation(async (_profile: string, updater: any) => {
      const updated = await updater({})
      return updated.result
    })
  })

  afterEach(() => {
    delete process.env.HERMES_WEB_UI_DISABLE_MCP_CLEANUP
    delete process.env.HERMES_WEB_UI_ALLOW_TRANSIENT_MCP_CLEANUP
  })

  it('removes the four managed server entries Studio previously injected', async () => {
    const updated = await cleanWith({
      mcp_servers: {
        'hermes-studio-api': { command: 'node', args: ['x', 'api'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' } },
        'hermes-studio-browser': { command: 'node', args: ['x', 'browser'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' } },
        'hermes-studio-devices': { command: 'node', args: ['x', 'devices'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' } },
        'hermes-studio-use': { command: 'node', args: ['x', 'use'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' }, timeout: 1860 },
      },
    })

    expect(updated.data.mcp_servers).toEqual({})
    expect(updated.result.status).toBe('cleaned')
  })

  it('removes legacy PATH-only entries by their shipped command name', async () => {
    const updated = await cleanWith({
      mcp_servers: {
        'hermes-studio': { command: 'hermes-studio-mcp', args: ['api'] },
        legacy: { command: 'hermes-web-ui-mcp', args: ['use'] },
      },
    })

    expect(updated.data.mcp_servers).toEqual({})
    expect(updated.result.status).toBe('cleaned')
  })

  it('keeps a user-authored server whose name merely collides', async () => {
    const updated = await cleanWith({
      mcp_servers: {
        'hermes-studio-api': { command: 'my-own-server', args: [] },
        mine: { command: 'node', args: ['/home/me/server.mjs'] },
      },
    })

    expect(Object.keys(updated.data.mcp_servers)).toEqual(['hermes-studio-api', 'mine'])
    expect(updated.result.status).toBe('unchanged')
  })

  it('removes a marked server even when its name is not one Studio would pick', async () => {
    // The injector deleted by marker regardless of name, so cleanup mirrors it:
    // Studio's marker is proof Studio wrote the entry.
    const updated = await cleanWith({
      mcp_servers: {
        'my-tool': { command: 'node', args: ['/home/me/tool.mjs'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' } },
        mine: { command: 'node', args: [] },
      },
    })

    expect(Object.keys(updated.data.mcp_servers)).toEqual(['mine'])
    expect(updated.result.status).toBe('cleaned')
  })

  it('reports unchanged when no managed entry is present', async () => {
    const updated = await cleanWith({ mcp_servers: { mine: { command: 'node', args: [] } } })

    expect(updated.result.status).toBe('unchanged')
    expect(updated.data.mcp_servers).toEqual({ mine: { command: 'node', args: [] } })
  })

  it('writes nothing back when the config has no mcp_servers block', async () => {
    const updated = await cleanWith({ agent: { max_turns: 10 } })

    expect(updated.result.status).toBe('unchanged')
    expect(updated.write).toBe(false)
    expect(updated.data).toEqual({ agent: { max_turns: 10 } })
  })

  it('skips cleanup for transient preview homes by default', async () => {
    configMock.appHome = '/private/tmp/wui-preview-home'
    updateConfigYamlForProfileMock.mockClear()

    const { cleanupBundledMcpServer } = await loadCleanup()
    const result = await cleanupBundledMcpServer()

    expect(updateConfigYamlForProfileMock).not.toHaveBeenCalled()
    expect(result.targets).toEqual([])
  })

  it('honors the disable flag', async () => {
    process.env.HERMES_WEB_UI_DISABLE_MCP_CLEANUP = '1'
    updateConfigYamlForProfileMock.mockClear()

    const { cleanupBundledMcpServer } = await loadCleanup()
    const result = await cleanupBundledMcpServer()

    expect(updateConfigYamlForProfileMock).not.toHaveBeenCalled()
    expect(result.targets).toEqual([])
  })

  it('visits every profile', async () => {
    const { cleanupBundledMcpServer } = await loadCleanup()
    const result = await cleanupBundledMcpServer()

    expect(result.targets.map(target => target.profile)).toEqual(['default', 'work'])
    expect(updateConfigYamlForProfileMock).toHaveBeenCalledTimes(2)
  })
})