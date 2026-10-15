# 第三次精简:纯 Hermes Agent UI 客户端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `hermes-studio` 收敛成一台 Hermes Agent 的纯 UI 客户端——删除设备互联、饲料外链、Agent 管理与 coding agent 全链、MCP 服务器、宠物与版本预览,并把 Hermes 运行时管理迁进系统设置。

**Architecture:** 先把 Hermes 运行时管理从 `AgentManagerView` 的私有入口迁到 `SettingsView`(否则中间态用户无法安装 Hermes),再自包含地摘掉 MCP 服务器,然后自下而上分层切除:契约层 → 服务端模块整删 → 注入式接口塌缩 → 服务端收敛至 `tsc` 全绿 → 客户端收敛至 `vite build` 全绿 → i18n/构建链路 → 测试与终态验证。

**Tech Stack:** TypeScript 5 / Vue 3 (`<script setup>`) / Pinia / Vite / Koa / Socket.IO / SQLite (better-sqlite3) / Vitest / Playwright

**Spec:** `docs/superpowers/specs/2026-10-15-hermes-pure-ui-client-design.md`

## Global Constraints

- **目标仓库**:`/Users/aigniteluo/Workspace/FullStackProjects/hermes-studio`,分支 `main`,起点 `v1.1.0`(commit `a744d76`)
- **不得修改** `LICENSE`、`packages/skills/*/SKILL.md`(`author: Ekko` 是真实作者署名)、`docs/PROVENANCE.md`(Task 13 追加除外)、`docs/superpowers/**`、`docs/planning/**`
- **不得移除**:语音全链(STT/TTS/实时语音台/麦克风)、文件、终端、看板、工作流引擎本体、群聊、历史、用量、日志、技能、`hermes.mcp`(MCP 管理器页)
- **grep 假阳性,勿动**:`modules/hermes/services/providers/copilot-device-flow.ts`(Copilot 设备授权流)、`composables/useVoiceApiConnections.ts` 与 `settings/voice/VoiceApiFormModal.vue`(语音 provider 连接)、`utils/chat-agent-avatar.ts` 的 Hermes 分支
- **不得用 `as any` / `@ts-expect-error` / 非空断言**掩盖类型错误
- **不得弱化测试**:断言已删能力的测试可整删(主体已消失),断言幸存能力的必须改写而非删除,不得放松为 `expect.anything()`
- **禁止运行任何全局格式化工具**(`prettier` / `eslint --fix` / `npm run batch:prettier`)
- **提交信息**:中文,格式 `<emoji> <type>(scope): summary`,emoji 遵循 gitmoji.dev
- **测试必须在仓库根目录运行**,禁止 `cd /tmp`(会让 `studio-mcp-autoinject.test.ts` 产生假红)
- **client 侧的真正闸门是 `npx vite build`**,不是 `npx vue-tsc -b --noEmit` —— `vite/client` 的 `declare module '*.vue'` 通配声明让任何 `.vue` 路径都能通过类型检查,包括已删除的文件
- **回归判据**:`npx vitest run` 失败数 0,或 ≤3 且全部是 `Error: Test timed out in 5000ms.` 且仅出现在 `tests/server/hermes-cli-discovery.test.ts`、`hermes-cli-selection-live.test.ts`、`hermes-runtime-selection.test.ts`
- **不在代码中加 `DROP TABLE`** —— 删除建表代码即不再创建,旧库残留空表由 Boss 手工处理
- **本计划引用的行号来自 v1.1.0 快照**。执行每个 Step 前先跑该 Step 给出的 `grep`/`sed` 复核;行号漂移时按内容定位,不要按行号盲改
- **保留 MCP 管理器页**(`hermes.mcp` / `McpManagerView.vue`):它管理"你配置的 MCP 服务器",与被删的"Studio 自身作为 MCP 服务器"是两件事

---

## 文件结构总览

| 层 | 新建 | 删除 |
|---|---|---|
| 客户端设置 | `components/hermes/settings/RuntimeSettings.vue`、`HermesRuntimeSummary.vue` | — |
| 客户端页面 | — | `views/hermes/AgentManagerView.vue`、`DevicesView.vue`、`PetdexView.vue`、`DesktopPetView.vue`、`VersionPreviewView.vue`、`views/social-messages/SocialMessagesView.vue` |
| 客户端组件 | — | `components/hermes/connections/{ConnectionsPanel,AppConnectionsPanel}.vue`、`components/hermes/pets/WebPet.vue`、`components/layout/VersionManagementModal.vue` |
| 客户端 API | — | `api/coding-agents.ts`、`api/studio/{app-connections,app-relay,devices,social-messages,petdex,pets,pet-state}.ts` |
| 服务端模块 | — | `modules/coding-agents/**`、`modules/studio/services/{app-relay,devices,network,social-messages}/**`、`modules/studio/{routes,controllers,repositories}/{app-connections,app-relay,devices,social-messages,petdex,pets}*`、`modules/studio/sockets/pet-state.ts`、`modules/studio/public/social-messages.ts`、`modules/studio/contracts/devices.ts`、`modules/hermes/services/mcp/studio-autoinject.ts` |
| 入口 | — | `bin/hermes-studio-mcp.mjs`、`bin/hermes-web-ui-mcp.mjs` |

---

## Task 1:迁移 Hermes 运行时管理到系统设置(陷阱,必须最先做)

`VersionManagementModal.vue`(769 行)是全仓库**唯一**能管理 Hermes 运行时(下载/激活/删除/换存储目录)的入口,且仅被 `AgentManagerView.vue:18,501` 引用。**先迁移并让新入口可用,再删旧页面**,否则中间态用户无法安装 Hermes。

**做法**:把 Modal 的**抽屉内容抽取**成独立的 `RuntimeSettings.vue`,`VersionManagementModal` 退化为「抽屉壳 + `RuntimeSettings`」。这样两个入口同时可用,零窗口期;Modal 本身在 Task 9 删除。

**Files:**
- Create: `packages/client/src/components/hermes/settings/RuntimeSettings.vue`
- Create: `packages/client/src/components/hermes/settings/HermesRuntimeSummary.vue`
- Modify: `packages/client/src/components/layout/VersionManagementModal.vue:284-513`(抽成壳)
- Modify: `packages/client/src/views/hermes/SettingsView.vue:30-39,56-78,104-128`
- Modify: `packages/client/src/components/hermes/chat/ChatPanel.vue:1199`
- Modify: 11 个 locale 文件(`settings.tabs.runtime`)
- Create: `tests/client/settings-runtime-tab.test.ts`
- Modify: `tests/client/agent-manager-page.test.ts`(若其断言 Modal 内部结构,改为断言 `RuntimeSettings`)

**Interfaces:**
- Consumes: 无(本任务最先执行)
- Produces:
  - `@/components/hermes/settings/RuntimeSettings.vue` —— 无 props 的卡片式组件,自带版本列表/下载/激活/删除/存储目录/下载进度,内部自行调用 `fetchRuntimeVersionStatus` / `activateRuntimeVersion` / `selectRuntimeRoot` / `downloadRuntimeVersion` / `deleteRuntimeVersion` / `fetchVersionDownloadJobs`
  - `@/components/hermes/settings/HermesRuntimeSummary.vue` —— 无 props,调用 `fetchAgentStatusSnapshot()` 取 `id === 'hermes'`,渲染 CLI/Runtime 徽标 + 版本号
  - 路由入口:`{ name: 'hermes.settings', query: { tab: 'runtime' } }`
  - i18n 键:`settings.tabs.runtime`

- [ ] **Step 1: 复核 VersionManagementModal 的结构边界**

```bash
grep -n "NDrawer\|NDrawerContent\|</NDrawerContent>\|</NDrawer>" packages/client/src/components/layout/VersionManagementModal.vue
```

确认抽屉壳的起止行(报告中为 `:284` 起的内容区、`:490-513` 的内嵌 CLI 详情抽屉、`</NDrawer>` 收尾)。记下实际行号。

- [ ] **Step 2: 抽取 `RuntimeSettings.vue`**

新建 `packages/client/src/components/hermes/settings/RuntimeSettings.vue`,把 `VersionManagementModal.vue` **从抽屉内容开始到 `</NDrawerContent>` 为止的全部模板**逐字搬入其 `<template>`,把 Modal 的 `<script setup>` 里**除 `show` / `update:show` props 与 `defineEmits` 之外的全部逻辑**逐字搬入。要求:

- **不改任何实现逻辑**,只搬迁
- Modal 里对 `show` 的条件渲染(如 `v-if="show"`)去掉,改为常驻渲染
- 保留全部 import(`useRuntimeRestartPrompt`、`desktopBridge`、`HermesDataDirectoryHint`、`fetchVersionDownloadJobs` 等)
- 顶部加注释说明来源:

```ts
// Hermes 运行时管理:版本列表、下载/激活/删除、存储目录迁移与下载进度。
// 原先内嵌在 layout/VersionManagementModal.vue 的抽屉里,随 Agent 管理页移除而迁入系统设置。
```

- [ ] **Step 3: 把 `VersionManagementModal.vue` 改成薄壳**

改后全文应等价于:

```vue
<script setup lang="ts">
import { NDrawer, NDrawerContent } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import RuntimeSettings from '@/components/hermes/settings/RuntimeSettings.vue'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()
const { t } = useI18n()
</script>

<template>
  <NDrawer
    :show="show"
    placement="right"
    width="min(720px, 100vw)"
    @update:show="emit('update:show', $event)"
  >
    <NDrawerContent :title="t('runtimeVersions.title')" closable>
      <RuntimeSettings />
    </NDrawerContent>
  </NDrawer>
</template>
```

> 抽屉宽度与标题键以原文件实际值为准(`grep -n "NDrawerContent\|width=" packages/client/src/components/layout/VersionManagementModal.vue`)。

- [ ] **Step 4: 新建 `HermesRuntimeSummary.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NTag } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { fetchAgentStatusSnapshot, type AgentStatusSnapshot } from '@/api/agent-status'
import HermesDataDirectoryHint from '@/components/hermes/HermesDataDirectoryHint.vue'

const { t } = useI18n()
const snapshot = ref<AgentStatusSnapshot | null>(null)
const hermes = computed(() => snapshot.value?.agents.find(agent => agent.id === 'hermes'))
const detected = computed(() => Boolean(hermes.value?.installed))
const sourceType = computed<'CLI' | 'Runtime' | ''>(() => {
  if (hermes.value?.source === 'user-cli') return 'CLI'
  if (hermes.value?.source === 'managed-runtime') return 'Runtime'
  return ''
})
const version = computed(() => {
  const raw = hermes.value?.version?.split('·')[0]?.trim()
  if (!raw) return t('agentManager.unknownVersion')
  return /^v(?=\d)/i.test(raw) ? raw : `v${raw}`
})

onMounted(async () => {
  try {
    snapshot.value = await fetchAgentStatusSnapshot()
  } catch {
    snapshot.value = null
  }
})
</script>

<template>
  <section class="hermes-runtime-summary" data-testid="hermes-runtime-summary">
    <div class="summary-row">
      <strong>Hermes</strong>
      <NTag v-if="detected && sourceType" data-testid="hermes-source-type" type="info" size="small" :bordered="false">
        {{ sourceType }}
      </NTag>
      <NTag :type="detected ? 'success' : 'warning'" size="small" :bordered="false">
        {{ detected ? t('codingAgents.installed') : t('codingAgents.notInstalled') }}
      </NTag>
      <span v-if="detected" class="summary-version">{{ version }}</span>
    </div>
    <HermesDataDirectoryHint />
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-version {
  color: $text-primary;
  font-size: 13px;
  font-weight: 650;
}
</style>
```

> `t('codingAgents.installed')` / `t('codingAgents.notInstalled')` 在 Task 12 删除 `codingAgents.*` 时会失效 —— **Task 12 必须把这两个键保留或迁到 `settings.runtime.*`**。在本 Step 直接改用新键 `settings.runtime.installed` / `settings.runtime.notInstalled`,并在 Step 6 一并加到 11 个 locale,避免 Task 12 的耦合。
> 同理 `agentManager.unknownVersion` 改用 `settings.runtime.unknownVersion`。

- [ ] **Step 5: 在 `SettingsView.vue` 挂载 runtime tab**

`validTabs`(`:30-39`)加入 `"runtime"`:

```ts
const validTabs = computed(() => new Set([
  "account",
  ...(canManageUsers ? ["users"] : []),
  ...(canManageUsers ? ["webhooks"] : []),
  "display",
  "proxy",
  "compression",
  "privacy",
  "models",
  "runtime",
]));
```

**关键**:`:56-78` 的 query 重定向表会把 `agent|memory|session|gateway` 导向 `hermes.configSettings`。`runtime` 不在该列表内,**无需改**;但要在 `watch` 之前确认没有任何规则会吞掉它。在 `watch` 内加一行前置守卫并保留原逻辑:

```ts
watch(() => route.query.tab, (tab) => {
  if (tab === 'runtime') {
    activeTab.value = 'runtime'
    return
  }
  if (tab === "agent" || tab === "memory" || tab === "session" || tab === "gateway") {
    // ...原样保留
  }
  // ...原样保留
}, { immediate: true });
```

模板末尾(`:126-128` 的 models pane 之后、`</NTabs>` 之前)加:

```vue
<NTabPane name="runtime" :tab="t('settings.tabs.runtime')">
  <HermesRuntimeSummary />
  <RuntimeSettings />
</NTabPane>
```

并在 import 区加:

```ts
import RuntimeSettings from "@/components/hermes/settings/RuntimeSettings.vue";
import HermesRuntimeSummary from "@/components/hermes/settings/HermesRuntimeSummary.vue";
```

- [ ] **Step 6: 补 11 个 locale 的新键**

对 `packages/client/src/i18n/locales/{ar,de,en,es,fr,ja,ko,pt,ru,zh-TW,zh}.ts` 各加:

1. `settings.tabs.runtime`(`zh`: `'运行时'`;`en`: `'Runtime'`)
2. `settings.runtime.installed` / `.notInstalled` / `.unknownVersion`

**11 个文件必须做同样的结构改动** —— 任何 locale 的顶层键集与 `en.ts` 不一致都是错误。

```bash
for f in packages/client/src/i18n/locales/*.ts; do
  echo "--- $f"; grep -n "settings:" "$f" | head -3
done
```

逐文件定位 `settings.tabs` 与 `settings:` 块,按实际缩进插入。

- [ ] **Step 7: 改 `ChatPanel.vue` 的引导安装落点**

```bash
sed -n 1191,1212p packages/client/src/components/hermes/chat/ChatPanel.vue
```

把 `:1199` 的

```ts
await router.push({ name: "hermes.agentManager", query: { runtime: "install" } });
```

改为

```ts
await router.push({ name: "hermes.settings", query: { tab: "runtime" } });
```

- [ ] **Step 8: 写测试**

创建 `tests/client/settings-runtime-tab.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import SettingsView from '@/views/hermes/SettingsView.vue'
import en from '@/i18n/locales/en'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { tab: 'runtime' } }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

describe('settings runtime tab', () => {
  it('runtime tab 被 tab 白名单接受', () => {
    const wrapper = mount(SettingsView, { global: { plugins: [i18n] } })
    // runtime 不被 normalizeTab 回落为 account
    expect(wrapper.vm.activeTab).toBe('runtime')
  })
})
```

> 若 `mount` 因 Naive UI provider 缺失而失败,改为**源码断言**(读 `SettingsView.vue` 文本断言 `"runtime"` 存在于 `validTabs` 且 `tab === 'runtime'` 守卫存在),与仓库既有的 `agent-manager-routing.test.ts` 风格一致。**不要为了跑通测试而引入新的测试基建。**

- [ ] **Step 9: 跑新测试与闸门**

```bash
npx vitest run tests/client/settings-runtime-tab.test.ts
npx vite build
```

预期:测试 PASS;`vite build` exit 0 且无 `UNLOADABLE_DEPENDENCY`。

- [ ] **Step 10: 提交**

```bash
git add -A
git commit -m "♻️ refactor(client): 把 Hermes 运行时管理迁入系统设置运行时标签页"
```

---

## Task 2:删除 MCP 服务器(L1,自包含)

`bin/hermes-studio-mcp.mjs` **不是被动注册**,而是被 `modules/hermes/services/mcp/studio-autoinject.ts` 主动注入 Hermes Agent 配置。两者必须同任务删除,否则 Hermes 配置里会留下指向已删 bin 的条目。

**Files:**
- Delete: `bin/hermes-studio-mcp.mjs`
- Delete: `bin/hermes-web-ui-mcp.mjs`
- Delete: `packages/server/src/modules/hermes/services/mcp/studio-autoinject.ts`
- Delete: `tests/server/studio-mcp-autoinject.test.ts`
- Modify: `package.json`(bin 段 3 项 → 1 项)
- Modify: 引用 `studio-autoinject` 的调用点

**Interfaces:**
- Consumes: 无
- Produces: 服务端不再自动向 Hermes 配置注入 `hermes_studio_*` MCP 服务器

- [ ] **Step 1: 定位 studio-autoinject 的消费方**

```bash
grep -rn "studio-autoinject\|studioAutoinject\|autoinjectStudio" packages/server/src scripts tests --include='*.ts' --include='*.mjs'
```

同时确认待删 bin 的实际形态与引用:

```bash
cat bin/hermes-web-ui-mcp.mjs
grep -rn "hermes-studio-mcp\|hermes-web-ui-mcp" package.json bin scripts packages docs README.md README_zh.md 2>/dev/null | grep -v node_modules
```

- [ ] **Step 2: 删除文件**

```bash
git rm --quiet bin/hermes-studio-mcp.mjs bin/hermes-web-ui-mcp.mjs
git rm --quiet packages/server/src/modules/hermes/services/mcp/studio-autoinject.ts
git rm --quiet tests/server/studio-mcp-autoinject.test.ts
```

- [ ] **Step 3: 改 `package.json` 的 bin 段**

由

```json
"bin": {
  "hermes-web-ui": "./bin/hermes-web-ui.mjs",
  "hermes-web-ui-mcp": "./bin/hermes-studio-mcp.mjs",
  "hermes-studio-mcp": "./bin/hermes-studio-mcp.mjs"
},
```

改为

```json
"bin": {
  "hermes-web-ui": "./bin/hermes-web-ui.mjs"
},
```

> `hermes-web-ui` 入口**必须保留**(FPK 构建契约、CLI 名、`HERMES_WEB_UI_HOME` 均依赖它)。

- [ ] **Step 4: 断开调用点**

按 Step 1 的 grep 结果,删除对 `studio-autoinject` 的 import 与调用(预期在 `bootstrap/*` 或 `modules/hermes/services/mcp/*`)。若有其他 MCP 自动注入逻辑**与被删能力无关**,保留它们,只删指向 `bin/hermes-studio-mcp.mjs` 的部分。

- [ ] **Step 5: 过闸门**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json
grep -rn "hermes-studio-mcp\|hermes-web-ui-mcp\|studio-autoinject" packages scripts tests bin package.json
```

预期:`tsc` exit 0;grep **零命中**。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "🔥 feat(mcp): 移除 Studio 自身的 MCP 服务器与 Hermes 自动注入"
```

---

## Task 3:契约层塌缩(L0)

**必须最先改类型**,改完编译器会把所有扩散点报出来当后续任务的清单。

**Files:**
- Modify: `packages/server/src/modules/studio/contracts/agents/family.ts`
- Modify: `packages/server/src/modules/studio/contracts/agents/runtime.ts`
- Modify: `packages/server/src/modules/studio/contracts/runs/session.ts`
- Delete: `packages/server/src/modules/studio/contracts/devices.ts`

**Interfaces:**
- Consumes: 无
- Produces: `ChatCodingAgentId` 不再存在;`AgentFamily` / `AgentRuntime` 只含 Hermes

- [ ] **Step 1: 读三个契约文件的实际形状**

```bash
cat packages/server/src/modules/studio/contracts/agents/family.ts
cat packages/server/src/modules/studio/contracts/agents/runtime.ts
grep -n "ChatCodingAgentId\|coding_agent" packages/server/src/modules/studio/contracts/runs/session.ts
```

- [ ] **Step 2: 塌缩类型**

从 `family.ts` / `runtime.ts` 的联合类型中删除 `'coding_agent'` / `'claude-code'` / `'codex'` / `'pi'` 等取值;从 `runs/session.ts` 删除 `ChatCodingAgentId` 的使用与 `source` 里的 `'coding_agent'`。

**若删空后某类型只剩一个取值**,优先选择删除该类型本身并在使用点内联字面量;若删空后类型被大量引用不宜删除,保留类型但收窄取值。**不得用 `as any` 绕过。**

- [ ] **Step 3: 删除 devices 契约**

```bash
grep -rn "contracts/devices" packages/server/src | grep -v node_modules
```

确认 `contracts/devices.ts` 的消费方**全部**属于本次待删范围(app-relay / devices / app-connections / pet 相关)。若有幸存消费方(如 `copilot-device-flow.ts` 共享类型),**先拆分契约再删** —— 把幸存部分搬到 `contracts/` 下的新文件,并在报告中说明。

确认后:

```bash
git rm --quiet packages/server/src/modules/studio/contracts/devices.ts
```

- [ ] **Step 4: 用编译器产出工作清单**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 | grep "error TS" | cut -d'(' -f1 | sort | uniq -c | sort -rn
```

把这个输出**完整记入报告**,它是 Task 4–6 的清单。**本任务不修**。

- [ ] **Step 5: 提交(有意以 tsc 红灯结束)**

```bash
git add -A
git commit -m "♻️ refactor(contracts): 收窄 Agent 家族与运行时契约并移除 devices 契约"
```

---

## Task 4:服务端整模块删除与 bootstrap 解耦(L2)

**Files:**
- Delete: `packages/server/src/modules/coding-agents/`(27 文件)
- Delete: `packages/server/src/modules/studio/services/app-relay/`
- Delete: `packages/server/src/modules/studio/services/devices/`
- Delete: `packages/server/src/modules/studio/services/network/lan-discovery.ts`
- Delete: `packages/server/src/modules/studio/services/social-messages/`
- Delete: `packages/server/src/modules/studio/sockets/pet-state.ts`
- Delete: `packages/server/src/modules/studio/public/social-messages.ts`
- Delete: `packages/server/src/modules/studio/routes/{app-connections,app-relay,devices,social-messages,petdex,pets}.ts`
- Delete: `packages/server/src/modules/studio/controllers/{app-connections,app-relay,devices,social-messages}.ts`
- Delete: `packages/server/src/modules/studio/repositories/{app-connections-store,devices-store,social-message-store}.ts`
- Delete: `packages/server/src/bootstrap/{app-relay,devices,coding-agents}.ts`
- Delete: `packages/server/src/bootstrap/coding-agent-adapters.ts`
- Modify: `packages/server/src/bootstrap/routes.ts`、`http.ts`、`lifecycle.ts`

**Interfaces:**
- Consumes: Task 3 的收窄契约
- Produces: 服务端不再有 `/api/coding-agents*`、`/api/claude-code-proxy/*`、`/api/codex-proxy/*`、devices / app-relay / app-connections / social-messages / petdex / pets 任何入口

- [ ] **Step 1: 复核 `services/network/` 与 `services/devices/` 的边界**

```bash
ls packages/server/src/modules/studio/services/network/ packages/server/src/modules/studio/services/devices/
grep -rn "lan-discovery\|lanDiscovery" packages/server/src packages/client/src --include='*.ts' --include='*.vue' | grep -v node_modules
grep -rn "from.*services/devices\|services/devices/" packages/server/src | grep -v node_modules
```

**若 `lan-discovery.ts` 或 `device-relations.ts` 有非设备页的消费方**(例如 auth 或 app-connections 之外的路径),**不要删**,把它们移出待删清单并在报告中说明理由。预期:唯一消费者是已删的 devices 路由/控制器。

- [ ] **Step 2: 删除目录与文件**

```bash
cd /Users/aigniteluo/Workspace/FullStackProjects/hermes-studio
git rm -r --quiet packages/server/src/modules/coding-agents
git rm -r --quiet packages/server/src/modules/studio/services/app-relay
git rm -r --quiet packages/server/src/modules/studio/services/devices
git rm -r --quiet packages/server/src/modules/studio/services/social-messages
git rm --quiet packages/server/src/modules/studio/services/network/lan-discovery.ts \
  packages/server/src/modules/studio/sockets/pet-state.ts \
  packages/server/src/modules/studio/public/social-messages.ts \
  packages/server/src/modules/studio/routes/app-connections.ts \
  packages/server/src/modules/studio/routes/app-relay.ts \
  packages/server/src/modules/studio/routes/devices.ts \
  packages/server/src/modules/studio/routes/social-messages.ts \
  packages/server/src/modules/studio/routes/petdex.ts \
  packages/server/src/modules/studio/routes/pets.ts \
  packages/server/src/modules/studio/controllers/app-connections.ts \
  packages/server/src/modules/studio/controllers/app-relay.ts \
  packages/server/src/modules/studio/controllers/devices.ts \
  packages/server/src/modules/studio/controllers/social-messages.ts \
  packages/server/src/modules/studio/repositories/app-connections-store.ts \
  packages/server/src/modules/studio/repositories/devices-store.ts \
  packages/server/src/modules/studio/repositories/social-message-store.ts \
  packages/server/src/bootstrap/app-relay.ts \
  packages/server/src/bootstrap/devices.ts \
  packages/server/src/bootstrap/coding-agents.ts \
  packages/server/src/bootstrap/coding-agent-adapters.ts
```

> 若某文件在上一步被判定为"有幸存消费方"而保留,**从这条命令里删掉对应行**。

- [ ] **Step 3: 解耦 bootstrap**

逐个定位并删除导入与注册:

```bash
grep -n "app-relay\|devices\|petdex\|pets\|social-messages\|coding-agent\|codingAgents\|codingAgent" packages/server/src/bootstrap/routes.ts packages/server/src/bootstrap/http.ts packages/server/src/bootstrap/lifecycle.ts
```

预期处理(行号以实际为准):

| 文件 | 删除内容 |
|---|---|
| `bootstrap/routes.ts` | `app-connections` / `app-relay` / `devices` / `social-messages` / `petdex`(含 `petdexPublicRoutes`) / `pets` 的 import 与 `app.use(...)`;`codingAgentRoutes` 的 import 与 `:95` 的 `app.use`;`claudeCodeProxyRoutes` / `codexProxyRoutes` 的 import 与 `:77-78` 的 `app.use` |
| `bootstrap/http.ts` | `PetStateSocketServer` 的 import(`:45`)、变量(`:86`)、实例化(`:586`);`coding-agent` 相关 import(`:62-63`)与 `isAuthorizedCodexProxyRequest` 的使用 |
| `bootstrap/lifecycle.ts` | `codingAgentRunManager` 的 import(`:1`)、`:110` 与 `:145` 的 shutdown 步骤 |

- [ ] **Step 4: 用编译器产出剩余清单**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 | grep "error TS" | cut -d'(' -f1 | sort | uniq -c | sort -rn
```

记入报告,**本步骤不修**。

- [ ] **Step 5: 提交(有意以 tsc 红灯结束)**

```bash
git add -A
git commit -m "🔥 feat(server): 删除 coding agent、设备互联、社交消息与宠物服务端模块"
```

> **不要在本任务里修悬空引用**,也不要跑 `npx vitest run` —— 由 Task 5–6 修到绿。

---

## Task 5:注入式接口塌缩(⚠️ 本轮最大技术风险)

服务端用"公共接口 + bootstrap 适配器注入"把 coding agent 塞进通用聊天链路。必须**逐个确认"该调用是否只服务 coding agent"** —— 若有 Hermes 路径也在用,就要保留接口只收敛实现。

**Files:**
- Modify: `packages/server/src/modules/studio/public/chat-agent-runtime.ts`
- Modify: `packages/server/src/modules/studio/public/session-agent-runtime.ts`
- Modify: `packages/server/src/modules/studio/public/group-chat-agent-runtime.ts`
- Modify: `packages/server/src/bootstrap/chat-agent-runtime-adapter.ts`
- Modify: `packages/server/src/bootstrap/session-agent-runtime-adapter.ts`
- Modify: `packages/server/src/bootstrap/group-chat-agent-runtime-adapter.ts`
- Modify: `packages/server/src/modules/studio/sockets/chat-run.ts`
- Create: `tests/server/agent-runtime-injection-collapse.test.ts`

**Interfaces:**
- Consumes: Task 4 的删除结果
- Produces: 三个 `public/*-agent-runtime.ts` 的注入面只剩 Hermes bridge 相关方法

- [ ] **Step 1: 逐个方法确认消费方(本任务的判断核心)**

对以下 8 个方法,逐一跑:

```bash
for m in stop hasSession isSessionLaunchCompatible isSessionProcessing runIdForSession interruptForQueueInsertion resolveApproval resolveClarification; do
  echo "===== $m ====="
  grep -rn "\b$m\b" packages/server/src --include='*.ts' | grep -v node_modules
done
```

对每个命中判断:它是否**只**服务于 coding agent?

| 方法 | 报告中的已知消费方 | 处置 |
|---|---|---|
| `stop` | `sockets/chat-run.ts`、`session-agent-runtime-adapter.ts:43`、`workflow-runtime-adapter.ts:20` | 确认 Hermes 是否有独立停止路径;若无,保留接口 |
| `hasSession` / `isSessionProcessing` / `runIdForSession` | `sockets/chat-run.ts` | 逐个确认 |
| `isSessionLaunchCompatible` | `sockets/chat-run.ts` | 逐个确认 |
| `interruptForQueueInsertion` | `sockets/chat-run.ts:1480` | 确认队列插入在 Hermes 路径上是否有替代 |
| `resolveApproval` / `resolveClarification` | `sockets/chat-run.ts:662,715,759,1723` | 确认 Hermes 审批是否走 `AgentBridgeClient` 的独立通道 |

**把每个方法的一行结论写进报告**(`保留` / `删除`,附证据)。

- [ ] **Step 2: 按结论收窄三个 public 接口**

`public/chat-agent-runtime.ts`:删除被判定为"删除"的方法定义(`:24` 的 `codingAgentRunManager` 注入位与 `:53-60` 的 8 个转发),`configureChatAgentRuntime` 的参数类型同步收窄。

`public/session-agent-runtime.ts`、`public/group-chat-agent-runtime.ts` 同理。

> 保留 bridge 相关(`createPrimaryAgentBridge` / `getPrimaryAgentBridgeManager` / `redactPrimaryAgentBridgeError`)。

- [ ] **Step 3: 同步三对 adapter**

`bootstrap/chat-agent-runtime-adapter.ts`:删除 `:5-10` 的 coding agent import 与 `:17-21` 的注入键。改后应等价于:

```ts
import './agent-profile-adapter'
import { AgentBridgeClient } from '../modules/hermes/services/bridge/client'
import { getAgentBridgeManager } from '../modules/hermes/services/bridge/manager'
import { redactAgentBridgeError } from '../modules/hermes/services/bridge/redact'
import { configureChatAgentRuntime } from '../modules/studio/public/chat-agent-runtime'

configureChatAgentRuntime({
  createPrimaryAgentBridge: options => new AgentBridgeClient(options),
  getPrimaryAgentBridgeManager: getAgentBridgeManager,
  redactPrimaryAgentBridgeError: redactAgentBridgeError,
})
```

`session-agent-runtime-adapter.ts`、`group-chat-agent-runtime-adapter.ts` 同法处理。

- [ ] **Step 4: 收敛 `sockets/chat-run.ts`**

按 Step 1 的结论删除 coding agent 专属分支:

- `:198-201` `isCodingAgentExecution`
- `:209-211` `webhookAgentForRun` 的 coding agent 取值
- `:376,792,1650` 的 `coding_agent_id?: ChatCodingAgentId` 字段
- `:443-445` 的 `parseCodingAgentSessionCommand` / `handleCodingAgentSessionCommand`
- `:1393` 的 `state.source === 'coding_agent'`
- `:1480` 的 `interruptForQueueInsertion`
- `:662,715,759,1723` 的 approvals/clarifications coding agent 分支

删完后 `source` 只剩 `api_server | cli | workflow | group_chat`。**历史 `coding_agent` 值必须落默认路径不抛错** —— 不要新增抛错分支。

- [ ] **Step 5: 写防回归测试**

创建 `tests/server/agent-runtime-injection-collapse.test.ts`,断言注入面已收窄且无残留消费:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('agent runtime injection surface', () => {
  it('chat-agent-runtime 不再暴露 coding agent 运行管理方法', () => {
    const src = read('packages/server/src/modules/studio/public/chat-agent-runtime.ts')
    expect(src).not.toContain('codingAgentRunManager')
    expect(src).not.toContain('unavailable')
  })

  it('chat-run 不再有 coding_agent 分支', () => {
    const src = read('packages/server/src/modules/studio/sockets/chat-run.ts')
    expect(src).not.toContain("'coding_agent'")
    expect(src).not.toContain('coding_agent_id')
  })
})
```

> 第二条若因**历史数据容错注释**而含字符串而失败,把断言改为只查 `codingAgentRunManager` 与 `parseCodingAgentSessionCommand` —— **不要为了过测试而删除容错注释**。

- [ ] **Step 6: 让 server tsc 变绿**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json
```

预期:逐步收敛至 **exit 0**。若仍有错,继续按报错清单修;**不得用 `as any` / `@ts-expect-error` 掩盖**。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "♻️ refactor(server): 塌缩 Agent 运行时注入接口并收敛 chat-run 分支"
```

---

## Task 6:服务端残留收敛至 tsc 全绿

**Files:**
- Modify: `packages/server/src/modules/studio/services/workflow/manager.ts:58,240-256,1491,2005-2006`
- Modify: `packages/server/src/modules/studio/services/workflow/import-capabilities.ts:6,34-40`
- Modify: `packages/server/src/modules/studio/services/group-chat/agent-clients.ts:300,1129,1148`
- Modify: `packages/server/src/modules/studio/controllers/group-chat.ts`
- Modify: `packages/server/src/modules/studio/controllers/auth.ts`、`devices` 相关收敛
- Modify: `packages/server/src/modules/studio/infrastructure/database/schemas.ts`(删表定义)
- Modify: `scripts/server-module-boundaries.mjs`、`scripts/generate-openapi.mjs`

**Interfaces:**
- Consumes: Task 5 的注入面塌缩
- Produces: `npx tsc --noEmit -p packages/server/tsconfig.json` **exit 0**

- [ ] **Step 1: 收敛工作流**

`services/workflow/manager.ts`:删除 `:58` 的 `codingAgentId?: 'claude-code' | 'codex' | 'pi'`、`:240-256` 的三个内置 target 定义、`:1491,2005-2006` 的 `coding_agent_id` / `agent_id` 写入。**保留 Hermes target 与引擎本体。**

`import-capabilities.ts`:删除 `:6` 的 `SCOPED_CODING_AGENT_API_MODES` 与 `:34-40` 的 `codingAgentTargetAvailable` 门控,保留 Hermes 的能力判定。

> ⚠️ 历史 workflow 节点的 `coding_agent_id` 读到时必须落 Hermes 默认路径,**不抛错**。

- [ ] **Step 2: 收敛群聊**

`services/group-chat/agent-clients.ts`:删除 `:300` 的成员 `coding_agent_id` 字段、`:1129,1148` 的构造逻辑、`respondCodingAgentApproval` / `respondCodingAgentClarification` 及其调用点。群成员只剩 Hermes 类型。

`controllers/group-chat.ts`:同步删除 coding agent 相关的请求参数与响应字段。

- [ ] **Step 3: 删除 DB 表定义**

```bash
grep -n -i "device\|app_connection\|social_message\|pet" packages/server/src/modules/studio/infrastructure/database/schemas.ts | head -40
```

删除 devices / app_connections / social_messages / pets(petdex)相关表与索引定义,以及 `syncTable(...)` 里对应的建表调用。

**不要加 `DROP TABLE`。**

- [ ] **Step 4: 同步模块边界脚本与 openapi 脚本**

`scripts/server-module-boundaries.mjs`:模块清单从三个收成两个(去 `coding-agents`),删除对应路径枚举。

`scripts/generate-openapi.mjs`:删除 `app-connections` / `app-relay` / `devices` / `social-messages` / `petdex` / `pets` 六条 tag 映射。

> ⚠️ `scripts/server-module-boundaries.mjs` 与 `ARCHITECTURE.md`、`AGENTS.md` **必须同一次提交**,否则边界测试与文档不一致(Task 13 会改文档,本 Step 先只改脚本并在提交信息中标注)。

- [ ] **Step 5: 让 tsc 变绿**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json
```

预期:**exit 0,无输出**。

- [ ] **Step 6: 确认残留**

```bash
grep -rn -i "coding_agent\|coding-agent\|app-relay\|social-message\|petdex\|lan-discovery" packages/server/src
```

预期:只剩 Global Constraints 列出的白名单项与读侧容错注释。其余任何命中都要处理或在报告中说明理由。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "♻️ refactor(server): 收敛工作流与群聊的 coding agent 耦合至 tsc 全绿"
```

---

## Task 7:客户端页面删除与 contentMode 塌缩(陷阱 2)

**Files:**
- Delete: `packages/client/src/views/hermes/AgentManagerView.vue`
- Delete: `packages/client/src/components/layout/VersionManagementModal.vue`
- Modify: `packages/client/src/components/hermes/chat/ChatPanel.vue:15,70-82,1989,2770-2774`
- Modify: `packages/client/src/views/hermes/ChatView.vue:28-35`
- Modify: `packages/client/src/router/index.ts`
- Modify: `packages/client/src/App.vue:88-101`
- Modify: `packages/client/src/components/layout/PageSidebarNav.vue`
- Modify: `packages/client/src/components/layout/HermesConfigSidebar.vue:257-276`

**Interfaces:**
- Consumes: Task 1 的 `RuntimeSettings.vue`、`HermesRuntimeSummary.vue`(AgentManagerView 的能力已迁出)
- Produces: `contentMode` 塌缩为 `"chat" | "models"`;`vite build` 无悬空 import

- [ ] **Step 1: 删除页面与旧抽屉壳**

```bash
git rm --quiet packages/client/src/views/hermes/AgentManagerView.vue \
  packages/client/src/components/layout/VersionManagementModal.vue
```

> 删 `VersionManagementModal` 前确认 `grep -rn VersionManagementModal packages/client/src` 只剩 `AgentManagerView` 一处(Task 1 已把它改成薄壳,消费方仍只有 AgentManagerView)。若 Step 发现其它消费方,先改指 `RuntimeSettings`,再删。

- [ ] **Step 2: 塌缩 `ChatPanel.vue` 的 contentMode**

```bash
sed -n 68,84p packages/client/src/components/hermes/chat/ChatPanel.vue
sed -n 1985,1995p packages/client/src/components/hermes/chat/ChatPanel.vue
sed -n 2760,2780p packages/client/src/components/hermes/chat/ChatPanel.vue
```

处理:

- `:70` 类型 `"chat" | "connections" | "agents" | "models"` → `"chat" | "models"`
- `:75` 默认值保持 `"chat"`
- `:81` 删除 `ConnectionsPanel` 的 `defineAsyncComponent`
- `:82` 删除 `AgentManagerPanel` 的 `defineAsyncComponent`
- `:1989` 四层三元塌缩为 `contentMode === 'models' ? 'models' : 'chat'`
- `:2765-2774` 删除 `<ConnectionsPanel>` 与 `<AgentManagerPanel>` 两个 `v-else-if` 分支

- [ ] **Step 3: 塌缩 `ChatView.vue`**

`:28` 的 `ChatContentMode` → `'chat' | 'models'`;`:30-35` 删除 `hermes.connections` / `hermes.agentManager` 两条判断。

- [ ] **Step 4: 改路由**

```bash
grep -n "hermes.connections\|hermes.devices\|hermes.agentManager\|social-messages\|hermes.agents\|hermes.coding-agents" packages/client/src/router/index.ts
```

处理:

- 删除 `hermes.agentManager`(`:190-195`)与 `hermes.connections`(`:172-175`)两条路由定义
- `/hermes/agents`(`:196-199`)、`/hermes/coding-agents`(`:229-232`)、`/hermes/devices`(`:177-183`)、`/social-messages`(`:162-167`)四个 redirect **改为指向 `hermes.chat`**:

```ts
{ path: '/hermes/agents', redirect: { name: 'hermes.chat' } },
```

- `/hermes/version-preview` 路由在 Task 11 处理(宠物与版本预览)

- [ ] **Step 5: 收敛侧栏与布局**

`App.vue:88-101`:从 `usesPageSidebar` 数组删除 `"hermes.connections"`、`"hermes.agentManager"`。

`PageSidebarNav.vue`:
- `:9` `ActiveSection` 去掉 `'connections'` 与 `'agents'`
- `:23` 删除 `canManageAgents`
- `:37-45` 删除 `openConnections` / `openAgentManager`
- `:103-127` 删除 connections 按钮
- `:128-152` 删除 agentManager 按钮

`HermesConfigSidebar.vue:260`:`:to="{ name: 'hermes.agentManager' }"` → `:to="{ name: 'hermes.chat' }"`。

- [ ] **Step 6: 过真正的闸门**

```bash
npx vue-tsc -b --noEmit     # 必须 exit 0(但查不到缺失的 .vue)
npx vite build              # ← 真正判据,必须 exit 0 且无 UNLOADABLE_DEPENDENCY
```

> `vue-tsc` 看不见指向已删 `.vue` 的 import —— **只有 `vite build` 能证明 client 已收敛**。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "♻️ refactor(client): 删除 Agent 管理页与设备互联页并塌缩内容模式"
```

---

## Task 8:客户端 coding agent 会话入口收敛

**Files:**
- Modify: `packages/client/src/components/hermes/chat/ChatPanel.vue:770-780,922-937,1035-1060,1191-1257,2560-2600`
- Modify: `packages/client/src/components/hermes/chat/ChatInput.vue:82-83,229-280,605-611`
- Modify: `packages/client/src/stores/hermes/chat.ts:30-44,449,1103-1120,1166-1179,1794-1814,3482-3535`
- Modify: `packages/client/src/api/studio/chat.ts`
- Modify: `packages/client/src/shared/session-display.ts`
- Modify: `packages/client/src/utils/{chat-agent-avatar,group-agent-avatar}.ts`
- Modify: `packages/client/src/components/hermes/chat/{MessageList,SessionSearchModal,RealtimeVoiceStage}.vue`
- Modify: `packages/client/src/components/hermes/group-chat/{GroupChatPanel,CreateRoomForm,GroupMessageList}.vue`
- Modify: `packages/client/src/views/hermes/{HistoryView,WorkflowView,GroupChatLinkView}.vue`
- Modify: `packages/client/src/components/hermes/workflow/{types.ts,WorkflowAgentNode.vue}`
- Modify: `packages/client/src/components/layout/GlobalPendingActions.vue`
- Create: `tests/client/hermes-only-sessions.test.ts`

**Interfaces:**
- Consumes: Task 3 的契约塌缩、Task 7 的 contentMode 塌缩
- Produces: 客户端不再存在 coding agent 会话概念;`ChatAgentId` 单值化

- [ ] **Step 1: 收敛 New Chat 弹窗**

> **Boss 已确认:agent 选择器整个删掉,不留单选项下拉。**

`ChatPanel.vue`:
- `:770-780` 删除 `newChatAgent` / `newChatAgentMode` / `newChatApiMode` 三个 ref
- `:922-927` 删除 `newChatAgentOptions`
- `:929-937` 删除 `newChatApiModeOptions` / `newChatAgentModeOptions`
- `:1035-1060` 删除 `isNewChatCodingAgent` / `isNewChatExternalCodingAgent` / `effectiveNewChatAgentMode` / `isNewChatGlobalCodingAgent` / `newChatNeedsBaseUrl` / `newChatNeedsApiKey`;`newChatUsesProviderModel` 恒真 → 删除并在使用点取 `true`
- `:2560-2600` 模板删除 agent `NSelect`、`agentMode` 单选、`apiMode` 选择及其条件容器
- `:1191-1210` Hermes 预检**保留**,跳转目标已是 Task 1 改好的 `hermes.settings?tab=runtime`
- `:1212-1231` coding agent 预检**整段删除**
- `:1234-1257` 载荷构造收敛:

```ts
const session = chatStore.newChat({
  profile: newChatProfile.value,
  provider: newChatProvider.value,
  model: newChatModel.value,
  source: 'cli',
  agent: 'hermes',
  workspace: newChatWorkspace.value || null,
  categoryId: newChatCategoryId.value,
});
```

- [ ] **Step 2: 收敛 ChatInput**

`ChatInput.vue`:
- `:234-244` 删除 `isCodingAgentSession`
- `:264-280` 删除 `filteredBridgeCommands` 里的 coding agent 白名单分支
- `:605-611` 删除对应条件
- `:1235` 的 `!isGlobalCodingAgentSession` 条件简化为恒真 → 去掉该条件

- [ ] **Step 3: 收敛 store 与 api**

`stores/hermes/chat.ts`:
- `:30` 删除 `ChatAgentId` 类型
- `:32-44` 删除 `agentToCodingAgentId` / `codingAgentIdToAgent`
- `:449` 删除 `codingAgentMode`
- `:1103-1120` 删除 `codingAgentId` / `codingAgentMode` 推断
- `:1166-1179` 删除 `isCodingAgentLikeSession` / `clearCodingAgentRuntimeCredentials` 及相关分支
- `:1794-1814` 的 `newChat` options 删除 `codingAgentId` / `codingAgentMode`
- `:3482-3535` `startRun` 载荷只保留 Hermes 路径

`api/studio/chat.ts`:`ChatRunTransport` 收敛为单一取值,删除 `coding_agent` source 相关分支。

**历史数据容错**:读到 `source: 'coding_agent'` 或 `agent: 'codex'` 的旧会话记录,必须落默认路径**不抛错**。塌缩后天然如此,但**不要额外加抛错**。

- [ ] **Step 4: 收敛共享工具与展示层**

`shared/session-display.ts`、`utils/chat-agent-avatar.ts`、`utils/group-agent-avatar.ts`:删除按 agent 分叉的头像/配色/coding agent 判定,**保留 Hermes 分支**。

`components/hermes/chat/{MessageList,SessionSearchModal,RealtimeVoiceStage}.vue`、`components/layout/GlobalPendingActions.vue`:删除 coding agent 分支,用 grep 逐一定位:

```bash
grep -rn "codingAgent\|coding_agent\|claude-code\|'codex'\|'pi'" packages/client/src/components packages/client/src/views packages/client/src/utils packages/client/src/shared
```

- [ ] **Step 5: 收敛两条产品线**

工作流:`components/hermes/workflow/types.ts:3,17` 的 `CodingAgentApiMode` 字段、`WorkflowAgentNode.vue:10,13,42-44` 的协议选项与 `canScopedCodingAgentUseProvider` 调用、`WorkflowView.vue:64,114,428,2663,3132` 的 coding agent 提示。**引擎本体不动**。

群聊:`GroupChatPanel.vue`、`CreateRoomForm.vue:10,56-58`、`GroupMessageList.vue:30-32`(头像硬编码 4 个 → 1 个)、`GroupChatLinkView.vue:30,550`。群成员只剩 Hermes。

- [ ] **Step 6: 写测试**

创建 `tests/client/hermes-only-sessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('hermes-only session model', () => {
  it('new chat 弹窗不再提供 agent 选择器', () => {
    const src = read('packages/client/src/components/hermes/chat/ChatPanel.vue')
    expect(src).not.toContain('newChatAgentOptions')
    expect(src).not.toContain('isNewChatExternalCodingAgent')
  })

  it('chat store 不再有 coding agent 映射', () => {
    const src = read('packages/client/src/stores/hermes/chat.ts')
    expect(src).not.toContain('agentToCodingAgentId')
    expect(src).not.toContain('codingAgentMode')
  })

  it('ChatInput 不再有 coding agent 会话判定', () => {
    const src = read('packages/client/src/components/hermes/chat/ChatInput.vue')
    expect(src).not.toContain('isCodingAgentSession')
  })
})
```

> 若因历史数据容错而含 `'coding_agent'` 字符串导致某条断言失败,收窄该断言到具体符号名 —— **不要为过测试而删容错**。

- [ ] **Step 7: 过闸门**

```bash
npx vite build
npx vitest run tests/client/hermes-only-sessions.test.ts
```

预期:构建 exit 0;测试 PASS。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "♻️ refactor(client): 收敛会话模型为纯 Hermes 并移除 coding agent 入口"
```

---

## Task 9:客户端设备互联、饲料、宠物与版本预览清理

**Files:**
- Delete: `packages/client/src/components/hermes/connections/{ConnectionsPanel,AppConnectionsPanel}.vue`
- Delete: `packages/client/src/views/hermes/{DevicesView,PetdexView,DesktopPetView,VersionPreviewView}.vue`
- Delete: `packages/client/src/views/social-messages/SocialMessagesView.vue`
- Delete: `packages/client/src/components/hermes/pets/WebPet.vue`
- Delete: `packages/client/src/api/coding-agents.ts`
- Delete: `packages/client/src/api/studio/{app-connections,app-relay,devices,social-messages,petdex,pets,pet-state}.ts`
- Delete: `packages/client/src/i18n/{social-messages,social-messages-locales}.ts`
- Modify: `packages/client/src/components/layout/PageSidebarNav.vue:62-65,176-190`
- Modify: `packages/client/src/components/layout/AppSidebar.vue:217-242,270-288`
- Modify: `packages/client/src/router/index.ts`
- Modify: `packages/client/src/stores/hermes/{pets,group-chat}.ts`

**Interfaces:**
- Consumes: Task 7 的侧栏收敛
- Produces: 侧栏不再有设备互联、饲料、宠物、版本预览入口

- [ ] **Step 1: 删除文件**

```bash
git rm --quiet packages/client/src/components/hermes/connections/ConnectionsPanel.vue \
  packages/client/src/components/hermes/connections/AppConnectionsPanel.vue \
  packages/client/src/views/hermes/DevicesView.vue \
  packages/client/src/views/hermes/PetdexView.vue \
  packages/client/src/views/hermes/DesktopPetView.vue \
  packages/client/src/views/hermes/VersionPreviewView.vue \
  packages/client/src/views/social-messages/SocialMessagesView.vue \
  packages/client/src/components/hermes/pets/WebPet.vue \
  packages/client/src/api/coding-agents.ts \
  packages/client/src/i18n/social-messages.ts \
  packages/client/src/i18n/social-messages-locales.ts
```

> **删除 `api/coding-agents.ts` 前**确认 Task 8 已清掉它的全部消费方:

```bash
grep -rn "@/api/coding-agents\|api/coding-agents" packages/client/src
```

预期:零命中。若有残留,先处理。

- [ ] **Step 2: 删除 studio API 客户端**

逐个确认无消费方后删除:

```bash
for m in app-connections app-relay devices social-messages petdex pets pet-state; do
  echo "===== $m ====="
  grep -rn "api/studio/$m" packages/client/src | grep -v node_modules
done
```

预期每个都零命中(消费方是被删的页面)。确认后:

```bash
git rm --quiet packages/client/src/api/studio/app-connections.ts \
  packages/client/src/api/studio/app-relay.ts \
  packages/client/src/api/studio/devices.ts \
  packages/client/src/api/studio/social-messages.ts \
  packages/client/src/api/studio/petdex.ts \
  packages/client/src/api/studio/pets.ts \
  packages/client/src/api/studio/pet-state.ts
```

> `api/studio/download.ts` 若同时服务 APK 下载与其它下载,先拆再处理(见 Step 4)。

- [ ] **Step 3: 删除「饲料」与其余侧栏入口**

`PageSidebarNav.vue`:删除 `:62-65` 的 `openApiRelay()` 与 `:176-190` 的整个按钮块。

`AppSidebar.vue`:删除 `:217-242` 的 versionPreview 入口与 `:270-288` 的 petdex 入口。

- [ ] **Step 4: 清路由与残留引用**

`router/index.ts`:删除 `hermes.petdex`、`desktop.pet`、`hermes.versionPreview`、`hermes.settings` 之外的所有相关路由;`/hermes/version-preview` 的 redirect 改为 `hermes.chat`(若要保留旧书签可达)。

```bash
grep -rn "petdex\|pet-state\|desktop.pet\|versionPreview\|WebPet\|pet" packages/client/src --include='*.vue' --include='*.ts' | grep -v node_modules | grep -vi "compet\|repeat\|update\|deep"
```

> `-i "pet"` 会命中大量假阳性(`update`、`compete` 等)。**必须逐条人工判定**。真阳性应全部属于 pets 族。

`stores/hermes/pets.ts` 整删;`stores/hermes/group-chat.ts` 删除 remote-rooms 相关(若依赖已删的 devices)。

- [ ] **Step 5: 过闸门**

```bash
grep -rn "apikey.fun\|LIBAPI" packages/client/src packages/server/src
npx vite build
```

预期:grep 零命中;`vite build` exit 0 且无 `UNLOADABLE_DEPENDENCY`。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "🔥 feat(client): 删除设备互联、饲料外链、宠物与版本预览入口"
```

---

## Task 10:i18n 与构建链路

**Files:**
- Modify: `packages/client/src/i18n/locales/{ar,de,en,es,fr,ja,ko,pt,ru,zh-TW,zh}.ts`(11 文件)
- Modify: `scripts/generate-openapi.mjs`
- Modify: `scripts/build-server.mjs`
- Modify: `.gitignore`
- Modify: `docs/openapi.json`(重新生成,勿手改)

**Interfaces:**
- Consumes: Task 9 的客户端收敛
- Produces: `npm run build` exit 0;locale 键集未漂移

- [ ] **Step 1: 记录 locale 键集基线**

```bash
cat > /tmp/locale-check.mjs <<'EOF'
import fs from 'node:fs'
const dir = 'packages/client/src/i18n/locales'
const keys = s => new Set([...s.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*):/gm)].map(m => m[1]))
const en = keys(fs.readFileSync(`${dir}/en.ts`, 'utf8'))
for (const f of fs.readdirSync(dir).sort()) {
  if (f === 'en.ts') continue
  const k = keys(fs.readFileSync(`${dir}/${f}`, 'utf8'))
  const missing = [...en].filter(x => !k.has(x))
  const extra = [...k].filter(x => !en.has(x))
  if (missing.length || extra.length) console.log(f, 'missing:', missing.join(',') || '-', 'extra:', extra.join(',') || '-')
}
EOF
git stash && node /tmp/locale-check.mjs > /tmp/locale-before.txt && git stash pop
```

> 本仓库有若干 locale 在基线就缺顶层键,`FAIL` 属正常 —— **验收标准是"改动前后逐字节相同",不是"输出为空"**。

- [ ] **Step 2: 删除 i18n 条目**

11 个 locale 各删除:

- `sidebar.{apiRelay, connections, devices, agentManager, codingAgents, versionPreview, petdex}`
- `connections.*` 整块
- `devices.*` 整块
- `agentManager.*` 整块(**除 Task 1 已迁出的 `settings.runtime.*`**)
- `codingAgents.*` 整块(**除 Task 1 的 `codingAgents.installed` / `notInstalled` 若仍被引用**)
- `chat.agent` 与协议相关键(`protocolOpenAiChat` 等)
- pets 相关键

```bash
grep -n "codingAgents\|agentManager\|connections:\|devices:\|petdex" packages/client/src/i18n/locales/en.ts
```

逐文件用 grep 确认各 locale 的实际行号后删除。

**changelog**:`packages/client/src/data/changelog.ts` 若引用被删键,必须同步删除该引用,否则 UI 渲染裸键:

```bash
grep -rn "changelog" packages/client/src/i18n/locales/zh.ts | head -5
```

- [ ] **Step 3: 校验键集未漂移**

```bash
node /tmp/locale-check.mjs > /tmp/locale-after.txt
diff /tmp/locale-before.txt /tmp/locale-after.txt && echo "键集未漂移 ✓"
```

预期:`diff` 无输出。

- [ ] **Step 4: 清理构建链路**

`scripts/generate-openapi.mjs`:删除 6 个已删路由文件的 tag 映射(若 Task 6 未做完)。

`scripts/build-server.mjs`:确认无残留拷贝(上一轮已清 `dist/mcu`);检查是否有 petdex/assets 相关拷贝。

`.gitignore`:删除已消失的产物路径。

- [ ] **Step 5: 重新生成 openapi 并构建**

```bash
npm run build
```

预期:exit 0。该命令含 `openapi:generate`,会重新生成 `docs/openapi.json`(**勿手改**)。

验证产物:

```bash
grep -ci "coding-agents\|app-relay\|social-messages\|petdex\|/api/devices" docs/openapi.json
```

预期:0。

- [ ] **Step 6: 过闸门**

```bash
npx vite build
npm run harness:check
```

预期:均 exit 0。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "🌐 i18n(client): 移除已删能力的文案并清理构建链路"
```

---

## Task 11:测试收敛与终态验证

**Files:**
- Delete: 被测主体已消失的测试(见 Step 1)
- Modify: 断言幸存能力的测试(见 Step 2)
- Modify: `docs/PROVENANCE.md`(追加本次记录)
- Modify: `ARCHITECTURE.md`、`AGENTS.md`、`README.md`、`README_zh.md`
- Modify: `docs/harness/server-module-boundaries.md`
- Delete: `docs/app-relay.md`

**Interfaces:**
- Consumes: Task 1–10 全部产出
- Produces: `npx vitest run` 满足回归判据;全部闸门绿;文档与代码现状一致

- [ ] **Step 1: 删除主体已消失的测试**

```bash
git rm --quiet tests/client/agent-manager-page.test.ts \
  tests/client/agent-ai-help-run-payload.test.ts \
  tests/client/agent-manager-routing.test.ts \
  tests/client/agent-manager-locales.test.ts \
  tests/client/chat-view-tab-title.test.ts \
  tests/server/studio-mcp-autoinject.test.ts
```

再按 grep 补齐:

```bash
grep -rln "AgentManagerView\|agentManager\|codingAgent\|coding_agent\|app-relay\|social-message\|petdex\|lan-discovery\|app-connections\|devices-store" tests/ | sort
```

**删除理由必须在报告中逐个写明**:每个文件的被测对象是否已在 Task 2–9 删除。

> 若某文件中有断言**幸存能力**(如 app-relay 的用例标题被 `app-relay-*` 测试断言"independent of the MCU relay"这类),**不要连带删除** —— 把那些用例搬到对应的幸存测试文件并在报告中说明。

- [ ] **Step 2: 收敛幸存测试的断言**

| 文件 | 处理 |
|---|---|
| `tests/client/hermes-config-navigation.test.ts` | 断言 `HermesConfigSidebar` 指向 `hermes.agentManager` → 改断言指向 `hermes.chat` |
| `tests/client/style-system.test.ts:101-120` | agent-manager 样式断言 → 换成幸存页面 |
| `tests/server/server-module-boundaries.test.ts` | 模块从三个收成两个;样例路由换成幸存文件 |
| `tests/e2e/theme.spec.ts:195-196` | `goto('/#/studio/agents')` → 换页 |
| 工作流/群聊测试 | 断言 coding agent 节点/成员的用例 → 改为断言"只剩 Hermes" |
| `tests/client/device-connections-*.test.ts` | 若断言已删的 connections 页面 → 整删 |

- [ ] **Step 3: 跑全量测试**

```bash
npx vitest run --reporter=basic 2>&1 | tee /tmp/final-suite.log | tail -20
grep "FAIL " /tmp/final-suite.log | sed 's/ >.*//' | sort -u
```

**验收**:失败数 0,**或** ≤3 且全部是 `Error: Test timed out in 5000ms.` 且仅在 `hermes-cli-discovery` / `hermes-cli-selection-live` / `hermes-runtime-selection`。其余任何失败必须修。

- [ ] **Step 4: 终态残留扫描(必须带 `-a`)**

```bash
grep -rai "coding.agent\|app-relay\|social.message\|petdex\|apikey.fun\|hermes_studio_\|lan-discovery" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist . \
  | grep -v "docs/superpowers/" | grep -v "docs/PROVENANCE.md" | grep -v "docs/planning/"
```

> **`-a` 不可省** —— macOS/BSD 的 `grep -r` 默认跳过二进制文件;v1.0.0 时期正是因此漏掉了一个内含 phone-home URL 的预编译固件。

预期只剩 Global Constraints 列出的白名单项与读侧容错注释。

- [ ] **Step 5: 全量构建与闸门**

```bash
npx vue-tsc -b --noEmit
npx tsc --noEmit -p packages/server/tsconfig.json
npx vite build
npm run build
npm run harness:check
npm run verify:sharp-runtime
```

预期:全部 exit 0。

- [ ] **Step 6: 启动冒烟**

无 GUI 环境时**不要声称做了浏览器验证**。做能做的并如实记录:

```bash
npm start &
sleep 20
curl -s -o /dev/null -w "login page: %{http_code}\n" http://localhost:8648/
# 用默认 admin/123456 取 token 后,至少打两个认证接口
lsof -i -P | grep -i node | head -20
kill %1
```

**必须手工确认(或明确记录未能确认)的幸存能力**(spec §10 的 11 项):对话链路、**Hermes 运行时管理(新 tab)**、麦克风输入、实时语音台、消息/群聊朗读、语音设置页、文件、终端、看板、工作流(只剩 Hermes 节点)、群聊(只剩 Hermes 成员)、历史、用量、日志、技能、MCP 管理器页。

- [ ] **Step 7: 更新文档**

`ARCHITECTURE.md`:包边界表、服务端结构("三个模块" → 两个)、Client Structure、Validation Surface。

`AGENTS.md:42`:删除 "or `modules/coding-agents`"。

`README.md` / `README_zh.md`:删除设备互联、coding agent、宠物、MCP 服务器、版本预览的描述。

`docs/harness/server-module-boundaries.md`:模块清单与依赖矩阵重写。

`docs/app-relay.md`:整删。

`docs/PROVENANCE.md`:追加「第三次精简(2026-10-15)」一节,含实测的残留数字、测试结果与本次删除的六个族群。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "✅ test: 收敛测试并完成纯 Hermes UI 客户端终态验证"
```

---

## 附录:任务依赖关系

```
Task 1 (迁移 Hermes 运行时管理)  ←── 必须最先,否则中间态无法安装 Hermes
  └→ Task 2 (删 MCP 服务器)      ←── 自包含
       └→ Task 3 (契约层塌缩)     ←── 有意以 tsc 红灯结束
            └→ Task 4 (服务端整模块删除)  ←── 有意以 tsc 红灯结束
                 └→ Task 5 (注入式接口塌缩)  ←── 最大风险点
                      └→ Task 6 (服务端收敛)  ←── server tsc 变绿
                           └→ Task 7 (客户端删页 + contentMode 塌缩)  ←── vite build 变绿
                                └→ Task 8 (客户端 coding agent 入口收敛)
                                     └→ Task 9 (设备互联/饲料/宠物/版本预览清理)
                                          └→ Task 10 (i18n + 构建链路)
                                               └→ Task 11 (测试收敛 + 终态验证 + 文档)
```

Task 1 与 Task 2 之间无依赖,可并行;Task 3 之后严格串行。
