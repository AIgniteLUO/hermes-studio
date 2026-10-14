import { MCU_VOICE_SYSTEM_INSTRUCTIONS } from './mcu-voice-instructions'

export type McuAgentRuntime = 'hermes'

export const DEFAULT_MCU_AGENT_RUNTIME: McuAgentRuntime = 'hermes'

export function normalizeMcuAgentRuntime(_value: unknown): McuAgentRuntime {
  return DEFAULT_MCU_AGENT_RUNTIME
}

export function mcuChatRunFields(_agentRuntime: McuAgentRuntime) {
  return {
    source: 'global_agent' as const,
    session_source: 'global_agent' as const,
    instructions: MCU_VOICE_SYSTEM_INSTRUCTIONS,
  }
}
