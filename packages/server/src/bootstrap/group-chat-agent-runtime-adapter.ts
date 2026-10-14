import { AgentBridgeClient } from '../modules/hermes/services/bridge/client'
import { SessionDeleter } from '../modules/hermes/services/history/session-deleter'
import { getAvailableModelGroupsForProfile } from '../modules/hermes/controllers/models'
import { configureGroupChatAgentRuntime } from '../modules/studio/public/group-chat-agent-runtime'

configureGroupChatAgentRuntime({
  createPrimaryAgentBridge: options => new AgentBridgeClient(options),
  drainPrimaryAgentSessions: profile => SessionDeleter.getInstance().drain(profile),
  getAvailableModelGroups: getAvailableModelGroupsForProfile,
})
