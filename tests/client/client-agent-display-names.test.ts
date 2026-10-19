import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

function clientSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return clientSourceFiles(path)
    return ['.ts', '.vue'].includes(extname(entry.name)) ? [path] : []
  })
}

describe('client Agent display names', () => {
  it('never surfaces the removed built-in runtime anywhere in the client', () => {
    const occurrences = clientSourceFiles('packages/client/src')
      .flatMap(path => readFileSync(path, 'utf8').toLowerCase().includes('ekko') ? [path] : [])

    expect(occurrences).toEqual([])
  })

  it('shows log file names as-is without mapping a removed runtime prefix', () => {
    const logs = readFileSync('packages/client/src/views/hermes/LogsView.vue', 'utf8')

    expect(logs).toContain('`${f.name} (${f.size})`')
    expect(logs).toContain('{{ entry.logger }}')
    expect(logs).not.toContain('displayLogName')
  })

  it('offers only Hermes in every Agent picker', () => {
    for (const path of [
      'packages/client/src/views/hermes/WorkflowView.vue',
    ]) {
      const source = readFileSync(path, 'utf8')
      expect(source).toContain("{ label: 'Hermes', value: 'hermes' }")
      expect(source).not.toContain("value: 'claude-code'")
      expect(source).not.toContain("value: 'codex'")
      expect(source).not.toContain("value: 'pi'")
    }
  })
})
