export type GroupPrimaryAgentBridge = Record<string, any>
export type GroupPrimaryAgentBridgeContextEstimate = any
export type GroupPrimaryAgentBridgeMessage = any
export type GroupPrimaryAgentBridgeOutput = any

export interface GroupChatAgentRuntimeDependencies {
  createPrimaryAgentBridge(options?: Record<string, unknown>): GroupPrimaryAgentBridge
  drainPrimaryAgentSessions(profile: string): Promise<any>
  getAvailableModelGroups(profile: string): Promise<any[]>
}

let dependencies: GroupChatAgentRuntimeDependencies | null = null

export function configureGroupChatAgentRuntime(next: GroupChatAgentRuntimeDependencies): void {
  dependencies = next
}

function configured(): GroupChatAgentRuntimeDependencies {
  if (!dependencies) throw new Error('Studio group chat Agent runtime has not been configured')
  return dependencies
}

export const createGroupPrimaryAgentBridge = (options?: Record<string, unknown>) => configured().createPrimaryAgentBridge(options)
export const drainGroupPrimaryAgentSessions = (profile: string) => configured().drainPrimaryAgentSessions(profile)
export const getGroupAvailableModelGroups = (profile: string) => configured().getAvailableModelGroups(profile)
