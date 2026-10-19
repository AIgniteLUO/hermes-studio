import { describe, expect, it } from 'vitest'
import { getSystemPrompt } from '../../packages/server/src/modules/studio/public/runs/prompt'

describe('LLM prompt', () => {
  it('keeps the custom instructions and output-format guidance without MCP server values', () => {
    const prompt = getSystemPrompt('custom instructions')

    expect(prompt).toContain('custom instructions')
    expect(prompt).toContain('# 输出格式规范')
    // The bundled Studio MCP server was removed, so its usage guidance must not
    // be injected into the system prompt any more.
    expect(prompt).not.toContain('hermes_studio_')
    expect(prompt).not.toContain('Hermes Studio MCP usage')
    expect(prompt).not.toContain('hermes://openapi.json')
    expect(prompt).not.toContain('[Current Hermes profile:')
  })
})
