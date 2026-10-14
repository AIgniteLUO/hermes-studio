import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appHome: `/tmp/hermes-web-ui-logs-controller-${process.pid}`,
  listLogFiles: vi.fn(async () => [] as Array<{ name: string; size: string; modified: string }>),
  readLogs: vi.fn(async () => ''),
  hermesAvailable: true,
}))

vi.mock('../../packages/server/src/modules/studio/public/config', () => ({
  config: { appHome: mocks.appHome },
}))

vi.mock('../../packages/server/src/modules/studio/public/agent-logs', () => ({
  listPrimaryAgentLogFiles: mocks.listLogFiles,
  readPrimaryAgentLogs: mocks.readLogs,
}))

vi.mock('../../packages/server/src/modules/studio/public/agent-status-registry', () => ({
  isHermesAgentAvailable: vi.fn(() => mocks.hermesAvailable),
}))

describe('Hermes logs controller source', () => {
  beforeAll(async () => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(mocks.appHome, { recursive: true })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hermesAvailable = true
    mocks.listLogFiles.mockResolvedValue([])
    mocks.readLogs.mockResolvedValue('')
  })

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(mocks.appHome, { recursive: true, force: true })
  })

  it('lists and reads the current profile Hermes logs through the existing logs API', async () => {
    mocks.listLogFiles.mockResolvedValue([
      { name: 'hermes', size: '2.0KB', modified: '2026-05-08 15:19:46' },
    ])
    mocks.readLogs.mockResolvedValue([
      '2026-05-08 15:19:46,000 INFO hermes: model.started session=session-other run=run-other',
      '2026-05-08 15:19:47,000 WARNING hermes: tool.failed session=session-target run=run-target data={"error":"timed out"}',
    ].join('\n'))

    const controller = await import('../../packages/server/src/modules/studio/controllers/logs')
    const listContext: any = {
      state: { profile: { name: 'work' } },
      query: {},
      body: null,
    }
    await controller.list(listContext)
    expect(mocks.listLogFiles).toHaveBeenCalled()
    expect(listContext.body.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'hermes' }),
    ]))

    const readContext: any = {
      state: { profile: { name: 'work' } },
      params: { name: 'hermes' },
      query: { lines: '100', session: 'session-target', level: 'WARNING' },
      body: null,
    }
    await controller.read(readContext)

    expect(mocks.readLogs).toHaveBeenCalledWith('hermes', 100, 'WARNING', 'session-target', undefined)
    expect(readContext.body.entries.map((entry: any) => entry.level)).toEqual(['WARNING', 'INFO'])
    expect(readContext.body.entries[0]).toMatchObject({ logger: 'hermes' })
    expect(readContext.body.entries[0].message).toContain('tool.failed')
    expect(readContext.body.entries[0].message).toContain('session=session-target')
  })

  it('keeps Studio logs but does not query Hermes logs when Hermes is unavailable', async () => {
    mocks.hermesAvailable = false
    const controller = await import('../../packages/server/src/modules/studio/controllers/logs')
    const listContext: any = { state: { profile: { name: 'work' } }, query: {}, body: null }

    await controller.list(listContext)

    expect(mocks.listLogFiles).not.toHaveBeenCalled()
    expect(listContext.body.files.map((file: any) => file.name)).not.toContain('agent')

    const readContext: any = {
      params: { name: 'agent' },
      query: { lines: '100' },
      body: null,
    }
    await controller.read(readContext)

    expect(mocks.readLogs).not.toHaveBeenCalled()
    expect(readContext.body).toEqual({ entries: [] })
  })
})
