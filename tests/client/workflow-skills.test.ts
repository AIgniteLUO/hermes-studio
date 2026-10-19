import { describe, expect, it } from 'vitest'
import { buildWorkflowSkillOptions, workflowAgentToSkillTarget } from '@/utils/hermes/workflow-skills'

describe('workflow skill helpers', () => {
  it('maps every workflow agent, including historical ones, to the Hermes skill target', () => {
    expect(workflowAgentToSkillTarget('hermes')).toBe('hermes')
    expect(workflowAgentToSkillTarget('claude-code')).toBe('hermes')
    expect(workflowAgentToSkillTarget('codex')).toBe('hermes')
    expect(workflowAgentToSkillTarget('pi')).toBe('hermes')
    expect(workflowAgentToSkillTarget('unknown-agent')).toBe('hermes')
  })

  it('builds sorted enabled skill options without duplicate names', () => {
    expect(buildWorkflowSkillOptions({
      archived: [],
      categories: [
        {
          name: 'beta',
          description: '',
          skills: [
            { name: 'write-report', description: '', enabled: true },
            { name: 'disabled-skill', description: '', enabled: false },
          ],
        },
        {
          name: 'alpha',
          description: '',
          skills: [
            { name: 'analyze-data', description: '' },
            { name: 'write-report', description: '' },
          ],
        },
      ],
    })).toEqual([
      { label: 'analyze-data', value: 'analyze-data' },
      { label: 'write-report', value: 'write-report' },
    ])
  })
})
