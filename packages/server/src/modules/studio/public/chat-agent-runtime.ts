export type PrimaryAgentBridgeClient = Record<string, any>
export type PrimaryAgentBridgeContextEstimate = any
export type PrimaryAgentBridgeMessage = any
export type PrimaryAgentBridgeOutput = any
export type PrimaryAgentBridgeRunResult = any
export type ChatAgentMessage = any
export type ChatAgentClarificationRequest = any
export type ChatAgentOutputMessage = any
export type ChatAgentToolCall = any
export type ChatAgentToolApprovalRequest = any
export type ChatAgentToolResult = any
export type ChatModelClient = any
export type ChatModelEvent = any
export type ChatAgentRuntimeEvent = any
export type ChatModelProviderConfig = any
export type ChatModelReasoningEffort = any
export type ChatModelRequest = any
export type ChatModelResponse = any

export interface ChatAgentRuntimeDependencies {
  createPrimaryAgentBridge(options?: Record<string, unknown>): PrimaryAgentBridgeClient
  getPrimaryAgentBridgeManager(): any
  redactPrimaryAgentBridgeError(error: string | undefined, endpoint?: string, replacement?: string): string | undefined
}

let dependencies: ChatAgentRuntimeDependencies | null = null

export function configureChatAgentRuntime(next: ChatAgentRuntimeDependencies): void {
  dependencies = next
}

function configured(): ChatAgentRuntimeDependencies {
  if (!dependencies) throw new Error('Studio chat Agent runtime has not been configured')
  return dependencies
}

export const createPrimaryAgentBridge = (options?: Record<string, unknown>) => (
  configured().createPrimaryAgentBridge(options)
)
export const getPrimaryAgentBridgeManager = () => configured().getPrimaryAgentBridgeManager()
export const redactPrimaryAgentBridgeError = (
  error: string | undefined,
  endpoint?: string,
  replacement?: string,
) => configured().redactPrimaryAgentBridgeError(error, endpoint, replacement)


