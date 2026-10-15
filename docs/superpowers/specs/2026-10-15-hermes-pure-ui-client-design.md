# 第三次精简:纯 Hermes Agent UI 客户端设计文档

**日期**:2026-10-15
**状态**:Boss 已逐节批准(口径 A/B/C 五轮确认 + 三节设计认可)
**仓库**:`/Users/aigniteluo/Workspace/FullStackProjects/hermes-studio` @ v1.1.0

---

## 1. 背景与目标

`hermes-studio` 已完成两次精简:

1. **2026-10-14** 移除 Ekko Agent 一族,建立自用 fork(v1.0.0)
2. **2026-10-15** 移除 MCU/ESP32 固件、Global Agent、实例间中继

本轮延续同一句话:**「我只需要一个纯粹的 Hermes Agent UI 客户端」**。

前两轮删的是"上游作者的私货"。本轮删的是**与 Hermes Agent 本体无关的产品线**,以及**让 Studio 反过来被 Hermes Agent 驱动的 MCP 服务器**。

### 一句话目标

把 `hermes-studio` 收敛成**一台 Hermes Agent 的纯 UI 客户端**:能对话、能管 Hermes 自己的运行时与配置,其余一律不存在。

### Boss 的五轮口径决策

| # | 问题 | 决策 |
|---|---|---|
| Q1 | Claude Code / Codex / Pi 三个 coding agent 怎么办 | **C**:全删(含服务端 10811 行运行时) |
| Q2 | 设备互联删到什么深度 | **C**:页面 + app-relay + app-connections + social-messages + LAN 发现 + devices 路由 + MCP devices toolset 全删 |
| Q3 | Hermes 设置挪到哪个设置页 | **B**:`SettingsView`(`hermes.settings`,主侧栏齿轮) |
| Q4 | 外围产物(MCP 服务器 / desktop / 文档) | **C**:连 `bin/hermes-studio-mcp.mjs` 一起删 |
| Q5 | 「继续精简」的边界 | **B**:三项 + 宠物族 + 版本预览 |

---

## 2. 删除清单(六个族群)

| # | 族群 | 范围 |
|---|---|---|
| E1 | **设备互联** | 页面(`ConnectionsPanel` / `AppConnectionsPanel` / `DevicesView`)+ app-relay + app-connections + social-messages + LAN 发现 + `routes/devices.ts` + MCP `devices` toolset + 启动时 UDP 广播 |
| E2 | **饲料** | `PageSidebarNav.vue:62-65,176-190` 的 `openApiRelay()` 外链(`https://apikey.fun/register?aff=LIBAPI`)+ `sidebar.apiRelay` 全部 11 语言文案 |
| E3 | **Agent 管理** | `AgentManagerView.vue` + coding agent **全链**:服务端 `modules/coding-agents/`(27 文件/10811 行)、对话框 agent 选择器、工作流 agent 节点、群聊 coding agent 成员、`/api/claude-code-proxy/*`、`/api/codex-proxy/*` |
| E4 | **Hermes 设置迁移**(非删除) | `VersionManagementModal.vue`(769 行)整体搬进 `SettingsView` 新增「Hermes 运行时」tab + Hermes 状态摘要;`ChatPanel.vue:1199` 引导跳转改指该 tab |
| E5 | **MCP 服务器** | `bin/hermes-studio-mcp.mjs` + `bin/hermes-web-ui-mcp.mjs` + `package.json` 两个 bin 入口 + `modules/hermes/services/mcp/studio-autoinject.ts` + MCP 注册链路 + 文档 |
| E6 | **宠物 + 版本预览** | Petdex / DesktopPet / WebPet / pets store / 服务端 pets+petdex 路由与表 / `PetStateSocketServer`;`hermes.versionPreview` 路由与 `GithubPreviewSettings` |

### 非目标

- **不动** `LICENSE`、`packages/skills/*/SKILL.md` 的 `author: Ekko` 署名、`docs/PROVENANCE.md` 的历史记录、`docs/superpowers/**`、`docs/planning/**`
- **不动** 双设置页分工:`SettingsView` 仍管 `account/users/webhooks/display/proxy/compression/privacy/models`,只**新增** runtime tab;`HermesSettingsView`(`agent/memory/session`)原样保留
- **不动** 语音全链(STT/TTS/实时语音台/麦克风)、文件、终端、看板、工作流引擎本体、群聊(去掉 coding agent 成员后)、历史、用量、日志、技能
- **保留** MCP 管理器页(`hermes.mcp`,`McpManagerView`)—— 它管理"你配置的 MCP 服务器",与被删的"Studio 自身作为 MCP 服务器"是两件事
- **不新增功能**、不做无关重构
- **不写 DB migration、不加 `DROP TABLE`**(沿用前两轮口径:删建表代码,旧库残留空表由 Boss 手工处理)

---

## 3. 执行策略:分层切除

代码库使用严格的 TypeScript 联合类型(`AgentFamily`、`AgentRuntime`、`ChatCodingAgentId`)与 `as const satisfies Record<...>` 约束,**类型检查器本身就是最可靠的"遗漏检查器"**。按依赖方向自下而上分层切除。

```
L0 契约层    contracts/agents/{family,runtime}.ts、contracts/runs/session.ts、contracts/devices.ts
L1 MCP 层    bin/hermes-studio-mcp.mjs + package.json bin + studio-autoinject.ts   ← 自包含,先摘
L2 模块层    modules/coding-agents/ 整包、app-relay、devices、pets/petdex、social-messages、lan-discovery
L3 bootstrap 解耦   routes.ts / http.ts / lifecycle.ts / 各 *-agent-runtime-adapter.ts
L4 服务端收敛  → server tsc 全绿
L5 客户端      先「迁移」后「删除」(见 §4 三个陷阱)
L6 i18n + 构建链路 + openapi 重生成
L7 测试收敛 + 终态验证 + 文档 + PROVENANCE
```

### 3.1 三个必须最先处理的陷阱(顺序不可调换)

**陷阱 1:Hermes 设置迁移必须先于页面删除。**

`VersionManagementModal.vue`(769 行)是全仓库**唯一**能管理 Hermes 运行时(下载/激活/删除/换存储目录)的入口,证据:`grep VersionManagementModal` 只命中 `AgentManagerView.vue:18,501`。必须先把它搬进 `SettingsView` 的新 tab 并改好 `ChatPanel.vue:1199` 两处引导跳转,**再**删 AgentManagerView——否则中间态会出现"用户无法安装 Hermes"的窗口期。与上一轮"分句器先迁出 mcu-interaction"是同一类陷阱。

**陷阱 2:Agent 管理页不是路由级页面。**

它是 `ChatView.vue:32` → `ChatPanel.vue:70` 的 `contentMode='agents'` → `ChatPanel.vue:2770` 内嵌渲染的。删页要同时收敛 `ChatPanel` 的 `contentMode` 联合类型、`:1989` 的三元、`:82` 的 async import,以及 `ChatView.vue:28-35` 的类型。**只删路由会留下悬空 import,而 `vue-tsc` 看不见 `.vue`** —— `vite/client` 的 `declare module '*.vue'` 通配声明让任何 `.vue` 路径都能解析,包括不存在的文件。**client 侧的唯一真判据是 `vite build`。**

**陷阱 3:coding agent 的两个深耦合点。**

- 工作流:`services/workflow/manager.ts:58,240-256,1491,2005-2006` 的三个内置 target;`import-capabilities.ts:6,34-40` 的能力门控;`WorkflowView.vue` 的协议选项
- 群聊:`services/group-chat/agent-clients.ts:300,1129,1148` 的 `coding_agent_id` 成员;`GroupChatPanel.vue` / `GroupMessageList.vue` 的头像与房间表单

这两处不是"删一个 import",是**功能级收敛** —— 必须让工作流只剩 Hermes 节点、群聊只剩 Hermes 成员,且旧数据读到 `coding_agent_id` 时落默认路径不抛错。

**陷阱 4(本轮最大技术风险):注入式接口塌缩。**

服务端用"公共接口 + bootstrap 适配器注入"模式把 coding agent 塞进通用聊天链路。`bootstrap/chat-agent-runtime-adapter.ts` 同时注入两样:1 Hermes 的 `AgentBridgeClient`(保留)2 coding agent 的 9 个方法(删除)。

`public/chat-agent-runtime.ts:24,53-60` 需要把注入接口**收窄** —— 留下 bridge 相关,删掉 `stop` / `hasSession` / `isSessionLaunchCompatible` / `isSessionProcessing` / `runIdForSession` / `interruptForQueueInsertion` / `resolveApproval` / `resolveClarification`。同样处理 `public/session-agent-runtime.ts`、`public/group-chat-agent-runtime.ts` 与各自 adapter。

⚠️ 这些接口的消费方散在 `sockets/chat-run.ts`(approvals/clarifications 回调、队列插入中断、run id 查询)。**必须逐个确认"该调用是否只服务 coding agent"** —— 若有 Hermes 路径也在用,就要保留接口只收敛实现,不能连接口一起删。

### 3.2 grep 假阳性白名单(勿动)

含 `device` / `connection` / `agent` 字样但与本次删除项无关:

- `packages/server/src/modules/hermes/services/providers/copilot-device-flow.ts`(Copilot 设备授权流)
- `packages/client/src/composables/useVoiceApiConnections.ts`、`components/hermes/settings/voice/VoiceApiFormModal.vue`(语音 provider 连接)
- `packages/client/src/utils/chat-agent-avatar.ts` 的 Hermes 分支(收敛后仍保留 Hermes 头像)
- `GithubPreviewSettings` 若被 `hermes.versionPreview` 之外的路径引用,需先核实

---

## 4. 客户端收敛方案

### 4.1 新建会话弹窗的收缩(收益最大)

`ChatPanel.vue` 的 New Chat 抽屉现在有**一整套只为 coding agent 存在的表单**。逻辑侧对应 `:770-780` 的 ref 串、`:922-937` 的 `newChatAgentOptions` / `newChatApiModeOptions` / `newChatAgentModeOptions`、`:1035-1060` 的 8 个 computed、`:1191-1231` 的两段预检、`:1234-1257` 的载荷构造。

只剩 Hermes 之后(**Boss 已确认:agent 选择器整个删掉,不留单选项下拉**):

- `newChatAgent` 塌缩为字面量 `'hermes'`;`newChatAgentOptions` 整个删除
- `isNewChatCodingAgent` / `isNewChatExternalCodingAgent` / `effectiveNewChatAgentMode` / `isNewChatGlobalCodingAgent` / `newChatNeedsBaseUrl` / `newChatNeedsApiKey` **全部删除**
- `source` 恒为 `'cli'`;`codingAgentId` / `codingAgentMode` / `apiMode` 从 `newChat()` 载荷消失
- `confirmNewChat` 里 `:1212-1231` 的 coding agent 预检整段删除;`:1191-1210` 的 Hermes 预检**保留但改跳转目标**(→ `hermes.settings?tab=runtime`)
- `newChatUsesProviderModel` 恒真 → provider/model 选择器**保留**(Hermes 会话也要选模型)

### 4.2 类型塌缩(编译器驱动)

| 位置 | 现状 | 收敛后 |
|---|---|---|
| `stores/hermes/chat.ts:30` | `ChatAgentId = 'hermes' \| 'claude' \| 'codex' \| 'pi'` | 单值 → 类型与 `agentToCodingAgentId` / `codingAgentIdToAgent` 两个映射函数删除 |
| `chat.ts:449` | `codingAgentMode?: 'global' \| 'scoped'` | 删除 |
| `chat.ts:3482-3535` | `startRun` 载荷按 `codingAgentMode` 分叉 | 只保留 Hermes 路径 |
| `ChatInput.vue:234-244` | `isCodingAgentSession` 四路判定 | 删除,连带 `:264-280` slash 白名单、`:605-611` 分支 |
| `api/studio/chat.ts` | `ChatRunTransport`、`coding_agent` source | 收敛为单一取值 |
| `shared/session-display.ts`、`utils/chat-agent-avatar.ts`、`utils/group-agent-avatar.ts` | 按 agent 取头像/配色 | 只剩 Hermes 一种 |

**历史数据容错**:读到 `source: 'coding_agent'` 或 `agent: 'codex'` 的旧会话,必须落默认路径**不抛错** —— 塌缩后天然如此,但**不额外加抛错**。

### 4.3 `contentMode` 塌缩(陷阱 2 落地)

- `ChatPanel.vue:70`:`contentMode?: "chat" | "connections" | "agents" | "models"` → `"chat" | "models"`
- `:1989` 四层三元塌缩;`:82` 的 `AgentManagerPanel` async import 删除;`:2765-2774` 两个 `v-else-if` 分支删除
- `:81` 的 `ConnectionsPanel` async import 同步删除
- `ChatView.vue:28-35` 的 `ChatContentMode` 同步塌缩
- 路由删除后,`/hermes/devices` / `/hermes/agents` / `/hermes/coding-agents` / `/social-messages` 四个 redirect **改为指向 `hermes.chat`**(Boss 已确认用 redirect,不留死链)

### 4.4 `SettingsView` 新增「运行时」tab(陷阱 1 落地)

`SettingsView.vue` 的 `validTabs`(`:30-39`)加 `runtime`,新增 `<NTabPane name="runtime">`,内容 = 从 `VersionManagementModal` 抽出的两块:

1. **状态摘要**(`fetchAgentStatusSnapshot()` 中 `id === 'hermes'` 那条):CLI / Runtime 徽标、版本号、`HermesDataDirectoryHint`
2. **运行时管理**(`fetchRuntimeVersionStatus()` 全家族):版本列表、激活 / 删除 / 从 GitHub 下载、存储目录选择(桌面 bridge)、下载任务进度

`VersionManagementModal.vue` 作为独立组件**删除** —— 769 行全为这个页面存在,抽屉形态搬进 tab 更顺。

`SettingsView.vue:56-78` 的 query 重定向表**新增一条**:`tab=runtime` 不再被 `agent|memory|session|gateway` 规则吞掉。

`ChatPanel.vue:1199` 引导跳转改为 `{ name: 'hermes.settings', query: { tab: 'runtime' } }`。

tab 命名:**「运行时」(en: `Runtime`)**(Boss 已确认)。

### 4.5 侧栏重排

- `PageSidebarNav.vue`:删 connections 按钮(`:103-127`)、agentManager 按钮(`:128-152`)、apiRelay 外链(`:176-190`);`ActiveSection` 联合类型从 7 值收到 5 值(去 `connections`、`agents`)
- `App.vue:88-101` 的 `usesPageSidebar` 去掉 `hermes.connections`、`hermes.agentManager`
- `HermesConfigSidebar.vue:257-276` 的「返回聊天」从 `hermes.agentManager` 改指 `hermes.chat`
- `AppSidebar.vue`:删 versionPreview 入口(`:217-242`)、petdex 入口(`:270-288`)

---

## 5. 服务端收敛方案

### 5.1 模块级整删

| 模块 | 备注 |
|---|---|
| `modules/coding-agents/` | 27 文件 / 10811 行,整目录 |
| `modules/studio/services/app-relay/` | 含 `app-connections.ts` |
| `modules/studio/services/devices/` | 含 `device-relations.ts`(需白名单核实后处理) |
| `modules/studio/services/network/lan-discovery.ts` | 唯一消费者是设备页 |
| `modules/studio/services/social-messages/` | |
| `modules/studio/routes/{app-connections,app-relay,devices,social-messages,petdex,pets}.ts` | 6 文件 |
| `modules/studio/controllers/{app-connections,app-relay,devices,social-messages}.ts` | 4 文件 |
| `modules/studio/repositories/{app-connections-store,devices-store,social-message-store}.ts` | 3 文件 |
| `modules/studio/sockets/pet-state.ts` | 桌面宠物状态推送 |
| `modules/studio/public/social-messages.ts` | |
| `modules/studio/contracts/devices.ts` | |
| `bootstrap/{app-relay,devices}.ts` | |
| `modules/hermes/services/mcp/studio-autoinject.ts` | MCP 自动注入 |
| `bin/hermes-studio-mcp.mjs`、`bin/hermes-web-ui-mcp.mjs` | |

### 5.2 注入式接口塌缩(见 §3.1 陷阱 4)

`public/{chat,session,group-chat}-agent-runtime.ts` 三个接口的注入面收窄,对应 adapter 同步。

### 5.3 `sockets/chat-run.ts`(重灾区)

`isCodingAgentExecution`(`:198`)、`webhookAgentForRun`(`:209`)、coding agent slash 命令解析(`:443-445`)、`coding_agent_id` 在多个 data 类型里的字段(`:376,792,1650`)、`source === 'coding_agent'` 分支(`:1393`)、`interruptForQueueInsertion`(`:1480`)、approvals/clarifications 的 coding agent 分支(`:662,715,759,1723`)。删完后 `source` 只剩 `api_server | cli | workflow | group_chat`,历史 `coding_agent` 值读侧落默认路径不抛错。

### 5.4 两条产品线的功能级收敛

| 产品线 | 收敛点 |
|---|---|
| **工作流** | `services/workflow/manager.ts:58` 的 `codingAgentId?: 'claude-code'\|'codex'\|'pi'`、`:240-256` 三个内置 target、`:1491,2005-2006` 的写入 → 只留 Hermes target;`import-capabilities.ts:6,34-40` 门控删除。**引擎本体不动** |
| **群聊** | `services/group-chat/agent-clients.ts:300` 的成员 `coding_agent_id` 字段、`:1129,1148` 构造 → 群成员只剩 Hermes;`respondCodingAgentApproval` / `respondCodingAgentClarification` 删除 |

### 5.5 契约与类型(L0)

`contracts/agents/family.ts`、`contracts/agents/runtime.ts`、`contracts/runs/session.ts` 的 `ChatCodingAgentId` / `AgentFamily` / `AgentRuntime` 联合类型收窄。**必须最先改** —— 改完编译器会把所有扩散点报出来当工作清单。

### 5.6 数据层

`infrastructure/database/schemas.ts`:删除 devices / app_connections / social_messages / pets 相关表定义与 `syncTable` 建表调用。**不加 `DROP TABLE`**。

`middleware/legacy-app-api.ts`:15 条映射里**没有一条**指向被删能力(全是 studio API 前缀),**不改**。

### 5.7 构建与边界脚本

- `scripts/server-module-boundaries.mjs`:模块清单从三个收成两个(必须与 `ARCHITECTURE.md`、`AGENTS.md` 同一次提交)
- `scripts/generate-openapi.mjs`:删除 6 个已删路由文件的 tag 映射
- `scripts/build-server.mjs`:确认无残留拷贝
- `package.json`:删除两个 bin 入口

---

## 6. 数据兼容策略

DB 无 migration 目录,`agent` / `source` 列全是自由 `TEXT`,**无需改表**。

历史库可能残留:`sessions.agent`(`'codex'`/`'claude'`/`'pi'`/`'coding_agent'`)、`sessions.source`(`'coding_agent'`)、`gc_room_agents.coding_agent_id`、workflow run 的 node data、`mcu_devices` 与 pets 相关表。

**策略:读侧容错,不做强制清库。**
- 未知 `agent` 值归一到 `'hermes'`
- workflow 节点读到已删 target 时落 Hermes 节点
- 运行事件 `runtime` 不匹配任何已知分支时走默认路径,不得抛错
- 不提供 SQL 清理脚本(自用场景无必要,且有误删风险)

---

## 7. 测试处置

### 7.1 整删(被测主体已消失)

- coding agent 专测:服务端约 10 文件(~5557 行)+ 客户端 17 个 agent/coding 相关测试
- `agent-manager-page.test.ts`、`agent-ai-help-run-payload.test.ts`、`agent-manager-routing.test.ts`、`agent-manager-locales.test.ts`、`chat-view-tab-title.test.ts`
- `studio-mcp-autoinject.test.ts`
- devices / app-relay / social-messages / pets 专测

### 7.2 改写(断言幸存能力)

| 文件 | 处理 |
|---|---|
| `hermes-config-navigation.test.ts` | 断言 `HermesConfigSidebar` 指向 `hermes.agentManager` → 改指 `hermes.chat` |
| `style-system.test.ts:101-120` | agent-manager 样式断言 → 换成幸存页面 |
| `legacy-app-api.test.ts` | 保持 15 条映射断言不变 |
| `server-module-boundaries.test.ts` | 模块从三个收成两个 |
| 工作流/群聊测试 | 断言 coding agent 节点/成员的用例 → 改为断言"只剩 Hermes" |
| `tests/e2e/theme.spec.ts:195-196` | `goto('/#/studio/agents')` → 换页 |

### 7.3 新增

- `SettingsView` runtime tab 行为测试(版本列表渲染、下载/激活按钮、`tab=runtime` 不被重定向吞掉)
- 注入式接口塌缩防回归测试(确认 8 个已删方法无幸存消费方)
- 历史数据容错测试(`source: 'coding_agent'` / `agent: 'codex'` 不抛错)

---

## 8. i18n

11 个 locale 删除:`sidebar.{apiRelay,connections,devices,agentManager,codingAgents,versionPreview,petdex}`、`connections.*` 整块、`devices.*` 整块、`agentManager.*` 整块、`codingAgents.*` 整块、`chat.agent` / 协议相关键、`runtimeVersions.*`(部分保留给新 tab 复用)。

**关键校验**:用上一轮那套 `locale-check.mjs` 做**改动前后逐字节 diff**,验收标准是"键集未漂移",不是"输出为空"(7 个 locale 基线就缺顶层键)。

`i18n/social-messages.ts`、`i18n/social-messages-locales.ts` 整删。

---

## 9. 文档

| 文档 | 处置 |
|---|---|
| `ARCHITECTURE.md` | 包边界表、服务端结构("三个模块"→两个)、Client Structure |
| `AGENTS.md:42` | "…or `modules/coding-agents`" → 收成两个 |
| `README.md` / `README_zh.md` | 删设备互联、coding agent、宠物、MCP 服务器、版本预览的描述 |
| `docs/harness/server-module-boundaries.md` | 模块清单与依赖矩阵重写(与 `server-module-boundaries.mjs` 同提交) |
| `docs/app-relay.md` | 整删 |
| `docs/PROVENANCE.md` | 追加「第三次精简(2026-10-15)」一节 |
| `docs/planning/*.md` | **不改**(历史记录) |

---

## 10. 验证策略

### 每个任务结束都要过

```bash
npx vue-tsc -b --noEmit                            # client 类型(有盲区)
npx tsc --noEmit -p packages/server/tsconfig.json  # server 类型
npx vite build                                     # ← client 的真正判据
npx vitest run
npm run build && npm run harness:check
```

> ⚠️ `vue-tsc` 对 `.vue` 路径有盲区(`vite/client` 的 `declare module '*.vue'` 通配声明让任何 `.vue` 路径都能解析)。**client 侧必须以 `vite build` 为准。**

### 基线(前一阶段实测)

`npx vitest run` → exit 0,零失败(上一轮记录 `4396 passed | 6 skipped (4402)`,本轮起点 v1.1.0 会略高)。

**回归判据**:失败数 0,或 ≤3 且全部是 `Error: Test timed out in 5000ms.` 且仅在 `tests/server/hermes-cli-discovery.test.ts`、`hermes-cli-selection-live.test.ts`、`hermes-runtime-selection.test.ts`(会拉起真实 CLI 子进程,随负载抖动)。

**测试必须在仓库根目录运行** —— `cd /tmp` 会让 `studio-mcp-autoinject.test.ts` 产生假红(`isTransientPath()` 命中 `/private/tmp`)。

### 终态全量验证

```bash
npx vue-tsc -b --noEmit
npx tsc --noEmit -p packages/server/tsconfig.json
npx vite build
npm run build && npm run harness:check
npx vitest run
npm run verify:sharp-runtime
```

### 终态残留扫描(必须带 `-a`)

```bash
grep -rai "coding.agent\|app-relay\|social.message\|petdex\|apikey.fun\|hermes_studio_" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist . \
  | grep -v "docs/superpowers/" | grep -v "docs/PROVENANCE.md" | grep -v "docs/planning/"
```

> **`-a` 不可省** —— macOS/BSD 的 `grep -r` 默认跳过二进制文件;v1.0.0 时期正是因此漏掉了一个内含 phone-home URL 的预编译固件。

预期只剩 §3.2 的白名单项。

### 必须手工确认仍可用的能力

1. 对话:建会话 → 发消息 → 流式回复 → 工具调用
2. **Hermes 运行时管理(新 tab)**:版本列表、下载、激活、删除、存储目录
3. 输入框麦克风语音输入
4. 实时语音对话台
5. 消息/群聊朗读
6. 语音设置页(STT/TTS provider、本地模型下载)
7. 文件、终端、看板
8. 工作流(**只剩 Hermes 节点**)
9. 群聊(**只剩 Hermes 成员**)
10. 历史、用量、日志、技能
11. MCP 管理器页(`hermes.mcp`)

无 GUI 环境时**不声称做了浏览器验证**,如实记录。

---

## 11. 风险

| # | 风险 | 严重度 | 缓解 |
|---|---|---|---|
| R1 | **注入式接口塌缩误删 Hermes 路径依赖** —— 8 个方法散落在 `chat-run.ts` 多处 | **高** | 单独成任务;逐个确认消费方;配专门防回归测试 |
| R2 | Hermes 运行时管理在迁移窗口期不可用 | **高** | 陷阱 1:先迁移后删除,顺序不可调换;迁移任务必须先过 `vite build` |
| R3 | 工作流/群聊的编码 agent 深耦合收敛不彻底,留下悬空引用 | 高 | 陷阱 3;依赖 TS 编译器 + `vite build` 双重把关 |
| R4 | 客户端 `vue-tsc` 盲区导致已删 `.vue` 的 import 不被发现 | 高 | **以 `vite build` 为唯一判据** |
| R5 | MCP 自动注入被误当"无关代码"保留 → Hermes 配置里指向已删 bin | 中 | E5 范围已含 `studio-autoinject.ts` 与其测试 |
| R6 | 大规模删除引入隐性遗漏 | 高 | 依赖 TS 编译器驱动收敛 + 终态 `grep -a` 残留扫描 |
| R7 | 旧库残留 devices/pets 空表 | 低 | 接受(§6),Boss 手工处理 |
| R8 | i18n 键集漂移 | 中 | 逐字节 diff 校验(§8) |
| R9 | 工作流/群聊历史数据含已删 target/coding_agent_id | 中 | 读侧容错(§6) |

---

## 12. 未决(实施中确认)

- `services/devices/device-relations.ts` 是否有 LAN 发现之外的幸存消费方(白名单核实)
- `GithubPreviewSettings` 除 `VersionPreviewView` 外是否还有引用
- `copilot-device-flow.ts` 与 devices 模块是否共享 `contracts/devices.ts` 类型(若共享需先拆契约)
- `packages/desktop` 是否引用 app-relay / devices / coding-agents(探查未完成)
- `bin/hermes-web-ui-mcp.mjs` 是否只是 `hermes-studio-mcp.mjs` 的转发(已确认为 `import './n.mjs'` 形态,待终态确认)
