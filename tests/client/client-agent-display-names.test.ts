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

  it.each([
    ['single chat', 'packages/client/src/components/hermes/chat/ChatPanel.vue', [
      '{ label: "Hermes", value: "hermes" }',
      '{ label: "Claude", value: "claude-code" }',
      '{ label: "Codex", value: "codex" }',
      '{ label: "Pi", value: "pi" }',
    ]],
    ['group chat', 'packages/client/src/components/hermes/group-chat/GroupChatPanel.vue', [
      "{ label: 'Hermes', value: 'hermes' }",
      "{ label: 'Claude', value: 'claude' }",
      "{ label: 'Codex', value: 'codex' }",
      "{ label: 'Pi', value: 'pi' }",
    ]],
    ['group chat link', 'packages/client/src/views/hermes/GroupChatLinkView.vue', [
      "{ label: 'Hermes', value: 'hermes' }",
      "{ label: 'Claude', value: 'claude' }",
      "{ label: 'Codex', value: 'codex' }",
      "{ label: 'Pi', value: 'pi' }",
    ]],
    ['workflow', 'packages/client/src/views/hermes/WorkflowView.vue', [
      "{ label: 'Hermes', value: 'hermes' }",
      "{ label: 'Claude', value: 'claude-code' }",
      "{ label: 'Codex', value: 'codex' }",
      "{ label: 'Pi', value: 'pi' }",
    ]],
  ])('lists Hermes first and the coding Agents after it in the %s Agent dropdown', (_name, path, options) => {
    const source = readFileSync(path, 'utf8')
    const indexes = options.map(option => source.indexOf(option))

    expect(indexes[0]).toBeGreaterThanOrEqual(0)
    for (let index = 1; index < indexes.length; index += 1) {
      expect(indexes[index]).toBeGreaterThan(indexes[index - 1])
    }
  })

  it('keeps server-managed provider choices available for coding-agent workflow nodes', () => {
    const view = readFileSync('packages/client/src/views/hermes/WorkflowView.vue', 'utf8')
    const node = readFileSync('packages/client/src/components/hermes/workflow/WorkflowAgentNode.vue', 'utf8')

    expect(view).toContain('canScopedCodingAgentUseProvider(')
    expect(node).toContain('canScopedCodingAgentUseProvider(')
  })

  it('shows log file names as-is without mapping a removed runtime prefix', () => {
    const logs = readFileSync('packages/client/src/views/hermes/LogsView.vue', 'utf8')

    expect(logs).toContain('`${f.name} (${f.size})`')
    expect(logs).toContain('{{ entry.logger }}')
    expect(logs).not.toContain('displayLogName')
  })

  it('uses Claude everywhere in the client without changing the internal runtime id', () => {
    const occurrences = clientSourceFiles('packages/client/src')
      .flatMap(path => readFileSync(path, 'utf8').includes('Claude Code') ? [path] : [])

    expect(occurrences).toEqual([])
    expect(readFileSync('packages/client/src/components/hermes/chat/ChatPanel.vue', 'utf8'))
      .toContain('{ label: "Claude", value: "claude-code" }')
  })
})
