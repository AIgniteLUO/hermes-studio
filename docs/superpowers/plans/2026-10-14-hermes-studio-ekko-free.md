# hermes-studio（Ekko-free fork）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于上游 `EKKOLearnAI/ekko-studio` 标签 `v0.7.15` 建立一份纯自用的 `hermes-studio` fork，物理删除 Ekko Agent 一族能力、断开上游云服务、替换 Ekko 品牌标识，并保持 FPK 集成契约可用。

**Architecture:** 按依赖方向自下而上分五层切除（L0 契约 → L1 模块 → L2 服务 → L3 客户端 → L4 构建发布 → L5 外部依赖）。利用 TypeScript 联合类型做"遗漏检查器"驱动收敛，每层结束必须通过对应的类型检查与测试。

**Tech Stack:** TypeScript 5 / Vue 3 (`<script setup>`) / Pinia / Vite / Koa / Socket.IO / SQLite (better-sqlite3) / Vitest / Playwright / Electron (desktop) / npm (无 workspaces)

**Spec:** `docs/superpowers/specs/2026-10-14-hermes-studio-ekko-free-design.md`

## Global Constraints

- **目标目录**：`/Users/aigniteluo/Workspace/FullStackProjects/hermes-studio`
- **目标远端**：`https://github.com/AIgniteLUO/hermes-studio.git`（已存在，当前为空仓库）
- **上游快照**：`/tmp/ekko-0715`（`EKKOLearnAI/ekko-studio` @ `v0.7.15`，浅克隆）
- **版本号**：`1.0.0`（新基线，不继承上游 `0.7.x` 序列）
- **npm 包名**：保持 `hermes-web-ui`，**不得更改**
- **`bin/` 入口名**：保持 `hermes-web-ui` / `hermes-studio-mcp` / `hermes-web-ui-mcp`，**不得更改**
- **`LICENSE` 文本与 Licensor 署名**：**不得修改**（BSL 1.1，改版权主体属虚假署名）
- **FPK 契约**：发布产物必须为 `hermes-web-ui-1.0.0.tar.gz`，解包后顶层为 `webui/`，内含 `package.json package-lock.json bin/ dist/ node_modules/`
- **Node 版本**：`>=23.0.0`（本机 24.x）
- **提交信息**：中文，格式 `<emoji> <type>(scope): summary`，emoji 遵循 gitmoji.dev
- **禁止**：不得运行 `prettier` / `eslint --fix` 等全局格式化命令
- **测试必须在仓库真实路径下运行，禁止在 `/tmp` 下跑** —— `studio-autoinject.ts:127` 用 `join(process.cwd(), 'bin/hermes-studio-mcp.mjs')` 定位脚本，`isTransientPath()`（`:69-74`）判定是否位于 `tmpdir()`/`/tmp`/`/private/tmp` 之下（先 `realpathSync`），命中即跳过 MCP 自动注入，导致 `tests/server/studio-mcp-autoinject.test.ts` 出现 **13 个假红**。这是测量环境问题，不是上游缺陷。
- **基线状态（Task 1 实测修正，2026-10-14）**：`npm ci --ignore-scripts && npm rebuild node-pty` exit 0；`npm run build` exit 0；`npx vitest run` 连跑 4 次中 1 次全绿（`578 passed | 2 skipped`）。**基线本身存在超时抖动**。
- **回归判据（所有任务的验收标准）**：失败数为 **0**，**或**失败数 ≤ 3 且**全部**是下列 3 个文件的 `Error: Test timed out in 5000ms.`（vitest 默认 `testTimeout` 未上调，这三个文件会拉起真实 CLI 子进程，随机器负载波动）。**其余任何失败一律按新增回归处理。**
  - `tests/server/hermes-cli-discovery.test.ts`
  - `tests/server/hermes-cli-selection-live.test.ts`
  - `tests/server/hermes-runtime-selection.test.ts`
- **每层验证命令**（下称「三层检查」）：
  ```bash
  npx vue-tsc -b --noEmit
  npx tsc --noEmit -p packages/server/tsconfig.json
  npx vitest run
  ```

---

## Task 1: 建立仓库基线

导入上游快照、建立全新 git 历史、确立可复现的绿色基线。

**Files:**
- Create: 整个仓库（从 `/tmp/ekko-0715` 导入，排除 `.git`）
- Modify: `package.json`（version / repository.url / homepage）
- Modify: `package-lock.json`（version 同步）
- Create: `docs/PROVENANCE.md`

**Interfaces:**
- Consumes: 无
- Produces: 一个 `npm ci` / `npm run build` / `npx vitest run` 全绿的工作树，供后续所有 Task 使用

- [ ] **Step 1: 导入快照到目标目录**

```bash
SRC=/tmp/ekko-0715
DST=/Users/aigniteluo/Workspace/FullStackProjects/hermes-studio
rsync -a --exclude='.git' --exclude='node_modules' "$SRC/" "$DST/"
cd "$DST"
```

注意：`--exclude='node_modules'` 必须加 —— `/tmp/ekko-0715/node_modules` 是 `npm ci --ignore-scripts` 装的，含平台相关产物，不复用。

- [ ] **Step 2: 记录上游 provenance**

```bash
cd /tmp/ekko-0715
git rev-parse HEAD          # 记下这个 hash
git describe --tags          # 应为 v0.7.15
```

```bash
cd /Users/aigniteluo/Workspace/FullStackProjects/hermes-studio
```

创建 `docs/PROVENANCE.md`，把上一步的两个值填入：

```markdown
# Provenance

本仓库是上游项目的精简 fork，**纯自用、非商业**。

- 上游仓库：`EKKOLearnAI/ekko-studio`（原名 `EKKOLearnAI/hermes-studio`，GitHub 重定向）
- 上游标签：`v0.7.15`
- 上游 commit：`<填入 git rev-parse HEAD 的结果>`
- Fork 基线版本：`1.0.0`
- Fork 日期：2026-10-14

## 改动摘要

- 物理移除 Ekko Agent 一族能力（`packages/ekko-agent`、`modules/ekko`、`client/*/ekko` 等）
- 断开上游云服务（App Relay 中继、App Entitlement、版本清单、桌面更新 feed）
- 替换 Ekko 品牌标识与域名

## 许可证

上游采用 **Business Source License 1.1**（BSL 1.1）。Additional Use Grant 允许个人、
教育、研究等非商业用途；商用需单独授权；Change Date 2029-05-10 后转 Apache 2.0。

本 fork 为个人非商业使用，落在许可范围内。`LICENSE` 文件保持原样，**未修改**
Licensor 署名与许可条款。

## 上游跟踪

**不跟踪**。本 fork 无 rebase / cherry-pick 上游的计划。
```

- [ ] **Step 3: 建立全新 git 历史并提交快照**

```bash
cd /Users/aigniteluo/Workspace/FullStackProjects/hermes-studio
git init -b main
git add -A
git commit -m "🎉 chore: 导入 ekko-studio v0.7.15 上游快照作为 fork 基线"
```

预期：单个 commit，无上游历史（`git log --oneline | wc -l` 输出 `1`）。

- [ ] **Step 4: 改版本号与仓库元数据**

```bash
cd /Users/aigniteluo/Workspace/FullStackProjects/hermes-studio
node -e '
const fs=require("fs");
for (const f of ["package.json","package-lock.json"]) {
  const j=JSON.parse(fs.readFileSync(f,"utf8"));
  j.version="1.0.0";
  if (j.packages && j.packages[""]) j.packages[""].version="1.0.0";
  if (f==="package.json") {
    j.repository.url="https://github.com/AIgniteLUO/hermes-studio.git";
    j.homepage="https://github.com/AIgniteLUO/hermes-studio";
  }
  fs.writeFileSync(f, JSON.stringify(j,null,2)+"\n");
}
console.log("ok");
'
```

- [ ] **Step 5: 安装依赖并重建原生模块**

```bash
cd /Users/aigniteluo/Workspace/FullStackProjects/hermes-studio
npm ci --ignore-scripts && npm rebuild node-pty
```

预期：exit 0。`node-pty` 需要 Xcode Command Line Tools，若失败先 `xcode-select --install`。

- [ ] **Step 6: 跑基线构建**

```bash
npm run build
```

预期：exit 0。此步骤包含 `openapi:generate` → `vue-tsc -b` → `vite build` → `tsc --noEmit -p packages/server/tsconfig.json` → `node scripts/build-server.mjs`。

- [ ] **Step 7: 跑基线测试并记录结果**

```bash
npx vitest run --reporter=basic > /tmp/hermes-studio-baseline-test.log 2>&1
echo "exit=$?"
tail -30 /tmp/hermes-studio-baseline-test.log
```

> ⚠️ **本步骤的原始预期已被 Task 1 实测推翻，以下为修正后内容。**
> 原预期是「exit 1，`tests/server/studio-mcp-autoinject.test.ts` 13 个失败」。实测在该文件
> 于仓库真实路径下**全部通过**（18/18）。原失败是**控制器在 `/tmp` 下测基线**造成的假红：
> 该用例用 `mkdtempSync(join(process.cwd(), ...))` 造 fixture，而 `studio-autoinject.ts:127`
> 同样以 `process.cwd()` 定位 MCP 脚本，`isTransientPath()`（`:69-74`）对 `/tmp`、`/private/tmp`
> 命中后直接跳过自动注入，`targets` 停在 `[]`。
> **结论：不是上游缺陷，无需修复；但测试必须在仓库真实路径下运行。**

预期：连跑 ≥2 次，至少一次为 **exit 0 全绿**：

```
 Test Files  578 passed | 2 skipped (580)
      Tests  4761 passed | 6 skipped (4767)
```

若未全绿，失败必须是 `Error: Test timed out in 5000ms.`，且**只**出现在下列 3 个文件
（vitest 默认 `testTimeout` 未上调，这三者会拉起真实 CLI 子进程，随机器负载波动）：

- `tests/server/hermes-cli-discovery.test.ts`
- `tests/server/hermes-cli-selection-live.test.ts`
- `tests/server/hermes-runtime-selection.test.ts`

**把实际结果写进 `docs/PROVENANCE.md`**，作为后续一切"是否引入回归"的判据：

```markdown
## 基线状态（2026-10-14）

- `npm ci --ignore-scripts && npm rebuild node-pty` → exit 0
- `npm run build` → exit 0
- `npx vitest run` → 连跑 4 次中 1 次全绿（578 passed | 2 skipped；4761 tests passed）
  - 另外 3 次仅 1~3 个 `Test timed out in 5000ms`，且全部落在上述 3 个 CLI 子进程文件
  - `tests/server/studio-mcp-autoinject.test.ts` 单独跑 18/18，从未失败

**回归判据**：失败数为 0，或失败数 ≤ 3 且全部是上述 3 个文件的 5000ms 超时。
其余任何失败均按新增回归处理。

**必须在仓库真实路径下运行测试**：在 `/tmp` 下运行会让 `studio-mcp-autoinject` 出现 13 个假红
（`isTransientPath` 命中 `/private/tmp` 后跳过 MCP 注入）。
```

- [ ] **Step 8: 基线假红排查（已由 Task 1 完成，无需执行）**

原始任务书要求 triage「13 个上游自带失败」。**Task 1 已查明其非上游缺陷且非真实失败**，根因见上方说明，**未改动任何上游测试与源码**。本步骤保留为记录，不再执行。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "🔧 chore(release): 版本号设为 1.0.0 并切换仓库元数据到 AIgniteLUO"
```

- [ ] **Step 10: 关联远端并推送**

```bash
git remote add origin https://github.com/AIgniteLUO/hermes-studio.git
git push -u origin main
```

预期：推送成功，`AIgniteLUO/hermes-studio` 的 `main` 分支出现 2 个 commit。

---

## Task 2: 整块删除 Ekko 专属代码

删除所有"只属于 Ekko"的文件 —— 这些不需要类型收敛即可安全移除（悬空引用在 Task 3–7 修复）。

**Files:**
- Delete: `packages/ekko-agent/`（整包，163 文件）
- Delete: `packages/server/src/modules/ekko/`（整目录，19 文件）
- Delete: `packages/server/src/bootstrap/ekko.ts`
- Delete: `packages/server/src/modules/studio/services/chat-run/handle-ekko-agent-run.ts`
- Delete: `packages/client/src/views/ekko/`（4 个 .vue）
- Delete: `packages/client/src/api/ekko/`（4 个 .ts）
- Delete: `packages/client/src/utils/ekko/`（1 个 .ts）
- Delete: `packages/client/src/components/layout/EkkoConfigSidebar.vue`
- Delete: `packages/client/public/coding-agents/ekko-agent.png`
- Delete: `tests/ekko-agent/`（23 文件）
- Delete: `tests/server/ekko-agent-approvals.test.ts`
- Delete: `tests/server/ekko-agent-auth-providers.test.ts`
- Delete: `tests/server/ekko-agent-clarifications.test.ts`
- Delete: `tests/server/ekko-agent-manager.test.ts`
- Delete: `tests/server/ekko-agent-mcp.test.ts`
- Delete: `tests/server/ekko-agent-provider-runtime.test.ts`
- Delete: `tests/server/ekko-configuration-services.test.ts`
- Delete: `tests/server/run-chat-ekko-context.test.ts`

**Interfaces:**
- Consumes: Task 1 建立的绿色基线
- Produces: 一个"Ekko 专属代码已不存在，但存在悬空引用导致类型检查失败"的中间态

- [ ] **Step 1: 删除 Ekko 专属目录与文件**

```bash
cd /Users/aigniteluo/Workspace/FullStackProjects/hermes-studio
rm -rf packages/ekko-agent
rm -rf packages/server/src/modules/ekko
rm -f  packages/server/src/bootstrap/ekko.ts
rm -f  packages/server/src/modules/studio/services/chat-run/handle-ekko-agent-run.ts
rm -rf packages/client/src/views/ekko
rm -rf packages/client/src/api/ekko
rm -rf packages/client/src/utils/ekko
rm -f  packages/client/src/components/layout/EkkoConfigSidebar.vue
rm -f  packages/client/public/coding-agents/ekko-agent.png
rm -rf tests/ekko-agent
rm -f  tests/server/ekko-agent-approvals.test.ts
rm -f  tests/server/ekko-agent-auth-providers.test.ts
rm -f  tests/server/ekko-agent-clarifications.test.ts
rm -f  tests/server/ekko-agent-manager.test.ts
rm -f  tests/server/ekko-agent-mcp.test.ts
rm -f  tests/server/ekko-agent-provider-runtime.test.ts
rm -f  tests/server/ekko-configuration-services.test.ts
rm -f  tests/server/run-chat-ekko-context.test.ts
```

- [ ] **Step 2: 验证删除干净**

```bash
# 这些路径应全部不存在
for p in packages/ekko-agent packages/server/src/modules/ekko \
         packages/client/src/views/ekko packages/client/src/api/ekko \
         packages/client/src/utils/ekko tests/ekko-agent; do
  [ -e "$p" ] && echo "FAIL: $p 仍存在" || echo "OK: $p 已删除"
done
```

预期：全部 `OK`。

- [ ] **Step 3: 记录删除前的 Ekko 密度（用于终态对比）**

```bash
grep -ri "ekko" --exclude-dir=.git --exclude-dir=node_modules -l . | wc -l
grep -ri "ekko" --exclude-dir=.git --exclude-dir=node_modules . | wc -l
```

把两个数字记下来（基线约 `303` 文件 / `5128` 行）。Task 13 的终态检查会对比。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "🔥 feat(ekko): 物理删除 Ekko 专属包、服务模块、客户端页面与专测"
```

注意：此 commit **类型检查必然失败**（悬空引用），这是预期的中间态。不要在此处尝试修复。

---

## Task 3: server 契约层收敛（L0）

从共享枚举/联合类型中移除 Ekko —— 这是所有下游报错的源头，也是"遗漏检查器"的开关。

**Files:**
- Modify: `packages/server/src/modules/studio/contracts/agents/family.ts:1`
- Modify: `packages/server/src/modules/studio/contracts/agents/runtime.ts:3,12`
- Modify: `packages/server/src/modules/studio/contracts/agents/logs.ts:45`
- Modify: `packages/server/src/modules/studio/contracts/runs/session.ts:5-11,30,159,207`
- Modify: `packages/server/src/modules/studio/public/agent-status-registry.ts:1,49,64-75`
- Modify: `packages/server/src/modules/studio/public/agent-logs.ts:41-44`
- Modify: `packages/server/src/modules/studio/public/chat-agent-runtime.ts:29-44,84-99`
- Modify: `packages/server/src/modules/studio/public/group-chat-agent-runtime.ts:8-15,32-39`
- Modify: `packages/server/src/modules/studio/public/mcu-voice.ts:3`
- Modify: `packages/server/src/modules/studio/services/agent-availability.ts:8-9,18`

**Interfaces:**
- Consumes: Task 2 的删除结果
- Produces: 收敛后的契约类型，精确形态如下（后续 Task 必须与之一致）
  - `AgentFamily = 'hermes' | 'coding'`
  - `AgentRuntime` 不含 `'ekko'`
  - `AgentStatusId` 不含 `'ekko-agent'`
  - `McuAgentRuntime = 'hermes'`
  - `ChatCodingAgentId` 不含 `'ekko-agent'`
  - `BackgroundContinuationContext` 只保留 `HermesBackgroundContinuationContext` 分支
  - `ChatAgentRuntimeDependencies` / `GroupChatAgentRuntimeDependencies` 删除全部 24 个 `*Ekko*` 成员

- [ ] **Step 1: 收敛 agent family 与 runtime 枚举**

`contracts/agents/family.ts:1` —— 把 `['hermes','ekko','coding']` 改为：

```ts
export const AGENT_FAMILIES = ['hermes', 'coding'] as const
```

`contracts/agents/runtime.ts` —— 从 `AGENT_RUNTIMES`（`:3`）移除 `'ekko'`；删除 `RUNTIME_FAMILIES` 中的 `ekko: 'ekko'` 项（`:12`）。

- [ ] **Step 2: 收敛 runs/session 契约**

`contracts/runs/session.ts`：
- 删除 `EkkoBackgroundContinuationContext` 接口（`:5-11`）
- `BackgroundContinuationContext`（`:30`）的联合中删除 `runtime: 'ekko'` 分支，只保留 `HermesBackgroundContinuationContext`
- `:159` 的 `webhookAgent` 联合删除 `'ekko'`
- `:207` 的 `ChatCodingAgentId` 删除 `'ekko-agent'`

- [ ] **Step 3: 收敛 agent status registry 与 availability**

`public/agent-status-registry.ts`：
- `:1` `AgentStatusId` 删除 `'ekko-agent'`
- `:49` `AGENT_ORDER` 删除 `'ekko-agent'`
- `:64-75` 删除整个 `'ekko-agent'` 的 `DEFAULTS` 条目

`services/agent-availability.ts`：
- `:8-9` `AGENT_ALIASES` 删除 `ekko` 与 `ekko-agent` 两项
- `:18` 删除 `'ekko-agent': 'Ekko'` 映射

- [ ] **Step 4: 收敛 runtime 依赖注入接口**

`public/chat-agent-runtime.ts` —— 用编辑器打开，删除接口定义（`:29-44`）中的 16 个 `*Ekko*` 成员，以及对应的 16 个导出函数（`:84-99`）。
`public/group-chat-agent-runtime.ts` —— 同样删除 8 个 `*Ekko*` 成员（`:8-15`）与导出（`:32-39`）。
`public/agent-logs.ts` —— 删除 `getEkkoLogSource` 导出（`:41-44`）。
`contracts/agents/logs.ts:45` —— 从 `StudioAgentLogDependencies` 删除 `getEkkoLogSource` 成员。

**注意**：成员名以实际文件为准，逐个删除。删完后这两个接口剩下的成员**不得**再引用任何 Ekko 符号。

- [ ] **Step 5: 收窄 MCU 类型**

`public/mcu-voice.ts:3`：

```ts
export type McuAgentRuntime = 'hermes'
```

- [ ] **Step 6: 提交（此步类型检查仍会失败）**

```bash
git add -A
git commit -m "♻️ refactor(contracts): 从 agent family/runtime/status 契约中移除 Ekko"
```

- [ ] **Step 7: 记录编译器给出的工作清单**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 | tee /tmp/server-type-errors.txt | head -60
grep -c "error TS" /tmp/server-type-errors.txt
```

预期：出现大量 `error TS`（数百条）。**这个列表就是 Task 4–6 的工作清单**，把错误按文件聚合一遍：

```bash
grep "error TS" /tmp/server-type-errors.txt | cut -d'(' -f1 | sort | uniq -c | sort -rn
```

---

## Task 4: server 服务层与 sockets 收敛（L1/L2）

按 Task 3 产生的编译错误清单，逐文件清除 Ekko 分支，直到 `tsc` 变绿。

**Files:**
- Modify: `packages/server/src/bootstrap/http.ts:45,46,387,450-467`
- Modify: `packages/server/src/bootstrap/routes.ts:64-67,110-113`
- Modify: `packages/server/src/bootstrap/lifecycle.ts:8,186`
- Modify: `packages/server/src/bootstrap/chat-agent-runtime-adapter.ts:12-22,31,42-57`
- Modify: `packages/server/src/bootstrap/group-chat-agent-runtime-adapter.ts:4-15,19-26`
- Modify: `packages/server/src/bootstrap/agent-log-adapter.ts:3-7,18-31`
- Delete: `packages/server/src/bootstrap/authorized-provider-adapter.ts`（**先确认无 Hermes 依赖**，见 Step 2）
- Modify: `packages/server/src/modules/studio/sockets/chat-run.ts`（约 20 处）
- Modify: `packages/server/src/modules/studio/sockets/group-chat.ts`（约 8 处）
- Modify: `packages/server/src/modules/studio/sockets/global-agent.ts:1642`
- Modify: `packages/server/src/modules/studio/services/chat-run/abort.ts:10-11,59-66,203-206`
- Modify: `packages/server/src/modules/studio/services/chat-run/load-state.ts:18,73-74`
- Modify: `packages/server/src/modules/studio/services/chat-run/session-command.ts:1267`
- Modify: `packages/server/src/modules/studio/services/chat-run/handle-coding-agent-run.ts:46`
- Modify: `packages/server/src/modules/studio/services/group-chat/agent-clients.ts`（约 10 处）
- Modify: `packages/server/src/modules/studio/services/group-chat/agent-relay.ts`（约 4 处）
- Modify: `packages/server/src/modules/studio/services/group-chat/agent-relay-store.ts:8,19`
- Modify: `packages/server/src/modules/studio/services/group-chat/agent-presets.ts:25`
- Modify: `packages/server/src/modules/studio/services/group-chat/remote-workspace-auth.ts:9`
- Modify: `packages/server/src/modules/studio/services/social-messages/session-push.ts:26,48-49`
- Modify: `packages/server/src/modules/studio/services/usage/usage-recorder.ts:15-16`
- Modify: `packages/server/src/modules/studio/services/webhooks/envelope.ts:8`
- Modify: `packages/server/src/modules/studio/services/workflow/manager.ts`（约 8 处）
- Modify: `packages/server/src/modules/studio/services/workflow/import-capabilities.ts:34-37`
- Modify: `packages/server/src/modules/studio/controllers/logs.ts:5,68-83,105-110,122-146`
- Modify: `packages/server/src/modules/studio/controllers/group-chat.ts:107,134,350`
- Modify: `packages/server/src/modules/studio/repositories/group-agent-preset-store.ts:5`

**Interfaces:**
- Consumes: Task 3 收敛后的契约类型
- Produces: `npx tsc --noEmit -p packages/server/tsconfig.json` exit 0

- [ ] **Step 1: 拆解 bootstrap 的 Ekko 装配**

`bootstrap/http.ts`：
- 删 `:45` `import { setupGlobalEkkoAgent } from './ekko'`
- 删 `:46` `import { injectManagedEkkoMcpServers } from '../modules/ekko/services/mcp'`
- 删 `:387` `updateAgentStatus('ekko-agent', { version: APP_VERSION })`
- 删 `:450-467` 的 `setupGlobalEkkoAgent()` + `injectManagedEkkoMcpServers()` 整段 try/catch

`bootstrap/routes.ts`：删 `:64-67` 的 4 个 `ekkoXxxRoutes` import，与 `:110-113` 的 4 行 `app.use(...)`。

`bootstrap/lifecycle.ts`：删 `:8` import 与 `:186` 的 `runShutdownStep('Global Ekko agent', ...)`。

- [ ] **Step 2: 处理 authorized-provider-adapter 的归属（决策点）**

```bash
grep -rn "configureAuthorizedProviderRuntime\|authorized-provider-runtime" \
  packages/server/src --include=*.ts | grep -v "/ekko/"
```

若结果**只剩** `bootstrap/ekko.ts`（已删）与 adapter 自身 → 连同 `packages/server/src/modules/studio/public/authorized-provider-runtime.ts` 一起删除。
若发现 Hermes 或 Coding Agents 路径也依赖它 → **保留 adapter**，把 `configureAuthorizedProviderRuntime` 的调用改挂到 `bootstrap/chat-agent-runtime-adapter.ts` 或 `bootstrap/http.ts` 的初始化流程中。

无论走哪条路，把结论写进 `docs/PROVENANCE.md` 的「改动摘要」。

- [ ] **Step 3: 拆解三个 runtime adapter**

`bootstrap/chat-agent-runtime-adapter.ts`：删 `:12-22` 的 `modules/ekko/services/*` imports、`:31` 的 `from '../../../ekko-agent/src'`、`:42-57` 的 16 个 `*Ekko*` 字段。
`bootstrap/group-chat-agent-runtime-adapter.ts`：删 `:4-15` imports 与 `:19-26` 的 ekko 字段。
`bootstrap/agent-log-adapter.ts`：删 `:3-7` 的 `EKKO_LOG_FILE_NAME / EkkoDirectoryManager / EkkoFileLogReader` imports、`:18-31` 的 `getEkkoLogSource` 实现，以及 `configureAgentLogs` 中对应的 key。

- [ ] **Step 4: 收敛 sockets 层**

`sockets/chat-run.ts`（重灾区）：逐条删除 `:21,26-27,31,84,154,158,214-220,386-391,678-693,748-760,841-846,981-1008,1233,1477-1478,1547,1578-1580,1742-1747,1982,2133` 的 Ekko import / 分支 / 字段。
其中 `:981-1008` 整块 `if (isEkkoAgentExecution(data)) { ...handleEkkoAgentRun }` 删除后，保留 `handleCodingAgentRun` 与 `handleBridgeRun` 两条路径。

`sockets/group-chat.ts`：删 `:20-21` imports、`:231,259` 联合分支、`:4879-4903` 中断处理、`:5168-5180` 审批分支、`:5206-5250` 两个方法、`:5366-5371` clarify 分支。

`sockets/global-agent.ts:1642`：把 `this.mcuSessionId(..., 'ekko')` 的硬编码改为 `'hermes'`（与 Task 6 的变更 B 呼应）。

- [ ] **Step 5: 收敛 services 层**

按 Task 3 Step 7 的错误清单逐文件处理。典型改法：

`services/chat-run/abort.ts:59-66` —— 删掉 `hasEkkoBackgroundTasks` 参与项，改为只看 `hasCodingAgentRun`。
`services/chat-run/load-state.ts:18` —— 删除 `payload.runtime === 'ekko'` 过滤条件；`:73-74` 删除 `'ekko_agent'` 分支。
`services/group-chat/agent-clients.ts:1170-1171` —— 删除 `this.agent === 'ekko' ? 'ekko-agent' : ...` 三元，保留原有 fallback 链。
`services/workflow/manager.ts:235-241` —— 删除 `resolveWorkflowNodeRunTarget` 的 ekko 分支，落到 hermes / coding 分支。
`services/workflow/import-capabilities.ts:34-37` —— 删除 `ekkoAgent` 分支，条件只留 `scopedExternalCodingAgent`。
`services/usage/usage-recorder.ts:15-16` —— 从 `source` / `agent` 联合中删除 `ekko_agent`。

- [ ] **Step 6: 收敛 controllers 与 repositories**

`controllers/logs.ts` —— 删 `:5` import、`:68-83` 的 `ekkoLogEntry()`、`:105-110` 列表项、`:122-146` 的 `if (logName === 'ekko-agent')` 分支。
`controllers/group-chat.ts:107,134,350` 与 `repositories/group-agent-preset-store.ts:5` —— 从 agent 联合类型中删除 `'ekko'`。

- [ ] **Step 7: 让 server 类型检查变绿**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json
```

预期：exit 0，无输出。
若仍有报错，回到 Step 4/5/6 继续收敛，**不要用 `as any` / `@ts-expect-error` 掩盖** —— 那会让 Task 13 的终态检查失去意义。

- [ ] **Step 8: 加历史数据读侧容错（spec §5）**

DB 无 migration，`agent` 列是自由 `TEXT`，历史库里可能已有 `agent='ekko'` 的行（`gc_room_agents`、`gc_agent_presets`）。删除枚举后必须保证**读到这些行不抛错**。

先写失败测试 —— 在 `tests/server/group-chat-routes-baseline.test.ts` 中新增：

```ts
it('读取历史遗留的 ekko 群聊成员时不抛错，并归一到 hermes', async () => {
  // 直接往 storage fake 里塞一条 agent='ekko' 的房间成员记录
  seedRoomAgent(storage, { roomId: 'r1', agent: 'ekko', /* ...其余必要字段... */ })

  const room = await service.loadRoom('r1')     // 沿用本文件既有调用方式

  expect(room).toBeDefined()
  expect(room.agents.map((a) => a.agent)).toEqual(['hermes'])
})
```

> 若该文件没有 `seedRoomAgent` helper，用它现有用例里往 storage 写成员的实际代码，只把 `agent` 值换成 `'ekko'`。

- [ ] **Step 9: 运行测试确认失败**

```bash
npx vitest run tests/server/group-chat-routes-baseline.test.ts -t "读取历史遗留的 ekko 群聊成员"
```

预期：FAIL —— 未知 agent 值当前会落到未处理分支。

- [ ] **Step 10: 在 agent 读取路径加归一化**

**先分清两条路径**（这很关键，弄反了会让测试白写）：

- **入参校验路径**（`controllers/group-chat.ts:301,734,838` 用 `GROUP_AGENT_TYPES.has(...)`）：这是客户端提交的 agent 类型，**应当拒绝 `'ekko'`**。Task 4 Step 6 已从 `:134` 的 `new Set(['hermes','ekko','codex','claude','pi'])` 中删掉 `'ekko'`，这条路径**不需要再改**。
- **读库路径**（从 storage 读出 `gc_room_agents` / `gc_agent_presets` 的 `agent` 列）：历史行可能是 `'ekko'`，**必须容忍**。这条路径才是本步骤要处理的。

在 `services/group-chat/agent-clients.ts` 的 agent 分派处（它按 agent 类型实例化对应的 client）加归一化：

```ts
/**
 * 历史库中可能残留已删除的 agent 值（例如 'ekko'）。
 * 读侧统一归一到 'hermes'，不写回 DB。
 */
function normalizeStoredGroupAgent(value: unknown): GroupAgentType {
  return typeof value === 'string' && GROUP_AGENT_TYPES.has(value)
    ? (value as GroupAgentType)
    : 'hermes'
}
```

在**从 storage 读出成员/预设**并驱动 client 实例化的位置调用它。`GROUP_AGENT_TYPES` 在 `controllers/` 下是私有常量 —— 若跨模块引用不便，就在 `services/group-chat/` 下就近定义等价的合法集合，**不要**把 controller 的常量提升为公共导出（那会破坏模块边界测试）。

**注意**：
- 只做**读侧**归一，**不写回** DB（避免自用场景下的误写风险）。
- usage / skill_usage 侧不需要改代码 —— `AgentBreakdown.vue:14` 的映射表已把未知 agent 归入 `'unknown'` 桶，删掉 `ekko_agent` 条目后历史行自然走该降级路径。
- 运行事件（`task.runtime`）侧同理：Task 4 Step 4/5 删除 ekko 分支后，未知值天然落到默认路径，**不要额外加抛错**。

- [ ] **Step 11: 运行测试确认通过**

```bash
npx vitest run tests/server/group-chat-routes-baseline.test.ts tests/server/group-chat-member-sync.test.ts
```

预期：PASS。

- [ ] **Step 12: 提交**

```bash
git add -A
git commit -m "♻️ refactor(server): 清除 bootstrap/sockets/services/controllers 中的 Ekko 分支"
```

---

## Task 5: 摘要引擎从 Ekko 切换为 Hermes（变更 A）

**这是本项目最大的功能回归风险点。** `context-compressor` 与群聊 `room-summary` 当前以 Ekko 运行时为默认摘要引擎。

**已确认的关键事实（取证）**：
- `GroupRoomSummaryService` 构造签名为 `(storage, onStatus?, summaryRunner?)`（`room-summary.ts:214-220`）。
- 生产代码 `sockets/group-chat.ts:3265` 构造时**只传两个参数，不注入 `summaryRunner`** → 因此 `this.summaryRunner || this.runBareEkkoSummary.bind(this)`（`:494`）的**兜底分支就是生产路径**。替换它不是可选优化，是强制项。
- `GROUP_SUMMARY_SYSTEM_PROMPT`（`:91`）文案本身已经是通用的 Hermes Studio 措辞，**不需要改**。
- `callHermesSummarizer`（`context-compressor/index.ts:660`）通过 `createPrimaryAgentBridge`（来自 `public/chat-agent-runtime`）发起 Hermes bridge 请求 —— 这正是 Task 3 中清理掉 Ekko 成员后剩下的那个模块。

**Files:**
- Modify: `packages/server/src/modules/studio/services/context-compressor/index.ts:22-27,89,98,546-568,570-656`
- Modify: `packages/server/src/modules/studio/services/group-chat/room-summary.ts:3-7,494,570-630`
- Test: `tests/server/group-chat-history-window.test.ts`（新增用例；该文件已有 storage fake）
- Test: `tests/server/context-compressor.test.ts`

**Interfaces:**
- Consumes: Task 3 已清理的 `public/chat-agent-runtime`（Ekko 成员已删，`createPrimaryAgentBridge` 保留）
- Produces: `GroupSummaryRunner` 类型与构造函数第三参数**签名不变**（`(input: { profile, provider, model, apiMode, previousSummary, messages, roomId }) => Promise<string>`）；兜底实现由 `runBareEkkoSummary` 换成 `runBareHermesSummary`

- [ ] **Step 1: 先写失败测试 —— 群聊摘要在不注入 runner 时必须走 Hermes**

在 `tests/server/group-chat-history-window.test.ts` 顶部加入 bridge mock（**照抄 `tests/server/context-compressor.test.ts:50-52` 的写法**，保持 bridge 返回结构一致）：

```ts
const bridgeRequestMock = vi.fn()
const bridgeDestroyMock = vi.fn()

vi.mock('../../packages/server/src/modules/studio/public/chat-agent-runtime', () => ({
  createPrimaryAgentBridge: vi.fn(() => ({
    request: bridgeRequestMock,
    destroy: bridgeDestroyMock,
  })),
}))
```

然后在 describe 内新增用例。**关键点：构造时不传第三个参数**（复现生产形态），复用本文件已有的 storage fake 与消息播种方式：

```ts
it('未注入 summaryRunner 时，群聊摘要兜底走 Hermes bridge 而非 Ekko', async () => {
  const storage = createStorageFake()          // 复用本文件既有 fake 工厂
  seedRoomWithMessages(storage, /* ...沿用本文件既有播种方式... */)

  // 不传第三个参数 —— 这正是 sockets/group-chat.ts:3265 的生产形态
  const service = new GroupRoomSummaryService(storage, undefined)

  await service.summarizeRoom(/* ...沿用本文件既有调用方式... */)

  expect(bridgeRequestMock).toHaveBeenCalled()
  const serialized = JSON.stringify(bridgeRequestMock.mock.calls)
  expect(serialized).toContain('hermes')       // 走的是 Hermes bridge
  expect(serialized).not.toContain('ekko')     // 且完全不碰 Ekko
})
```

> 若本文件没有 `createStorageFake` / `seedRoomWithMessages` 这两个具名 helper，**用该文件 `:842` 处用例的实际 fixture 构造代码替代** —— 不要新造一套，也不要把 `runner` 传进去。

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/server/group-chat-history-window.test.ts -t "未注入 summaryRunner 时"
```

预期：FAIL —— 当前兜底是 `runBareEkkoSummary`，它会调用 `resolveGroupEkkoProviderRuntimeConfig`，而该模块随 Task 2 已删除，因此测试会以模块解析失败或 `bridgeRequestMock` 未被调用而失败。

- [ ] **Step 3: 改写 room-summary 的兜底实现**

`services/group-chat/room-summary.ts`：
- 删 `:3-7` 的 5 个 `*GroupEkko*` imports
- `:494` 把 `this.summaryRunner || this.runBareEkkoSummary.bind(this)` 改为 `this.summaryRunner || this.runBareHermesSummary.bind(this)`
- `:570-630` 把 `runBareEkkoSummary` 重写为 `runBareHermesSummary`：

```ts
  private async runBareHermesSummary(input: {
    profile: string
    provider: string
    model: string
    apiMode: string
    previousSummary: string
    messages: CleanGroupMessage[]
    roomId: string
  }): Promise<string> {
    const bridge = createPrimaryAgentBridge({ timeoutMs: /* 沿用原 Ekko 版的超时值 */ })
    const sessionId = `roomsum_${Date.now().toString(36)}_${randomUUID().replace(/-/g, '').slice(0, 12)}`
    try {
      const result = await bridge.request({
        action: 'chat',
        session_id: sessionId,
        message: buildGroupSummaryUserPrompt({
          previousSummary: input.previousSummary,
          messages: input.messages,
        }),
        profile: input.profile,
        worker_key: `${input.profile}:room-summary:${input.roomId}`,
        source: 'api_server',
        wait: true,
        timeout: /* 秒，沿用原 Ekko 版 */,
        ...(input.model ? { model: input.model } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
        system_prompt: GROUP_SUMMARY_SYSTEM_PROMPT,
      }, { timeoutMs: /* 沿用原 Ekko 版 + 15_000 */ })
      if (result.status === 'error') {
        throw new Error(result.error || 'Room summary bridge run failed')
      }
      return result.content ?? ''
    } finally {
      await bridge.destroy?.()
    }
  }
```

**实现要点**：
- `buildGroupSummaryUserPrompt` 已存在于本文件（`:169`），直接复用，不要另写 prompt 拼装。
- `GROUP_SUMMARY_SYSTEM_PROMPT`（`:91`）已定义，直接复用。
- 输入/输出契约必须与 `GroupSummaryRunner` 完全一致（`Promise<string>`），因为测试与生产都依赖它。
- `createPrimaryAgentBridge` 从 `public/chat-agent-runtime` 导入 —— 确认它是 Task 3 后该模块**保留**的导出之一。
- 原 Ekko 版的超时值是 `resolveGroupEkkoProviderRuntimeConfig` 附近的常量，重写时保留同样的数值，不要引入新的超时语义。

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/server/group-chat-history-window.test.ts
npx vitest run tests/server/group-chat-agent-workspace.test.ts
```

预期：PASS。

- [ ] **Step 5: 切换 1:1 上下文压缩到 Hermes**

`services/context-compressor/index.ts`：
- 删 `:22-27` 的 5 个 `*ChatEkko*` runtime imports（保留 bridge 相关 import）
- `:98` 的 `EKKO_SUMMARIZER_SYSTEM_PROMPT` 重命名为 `SUMMARIZER_SYSTEM_PROMPT`（文案去掉 Ekko 字样）
- `:546,557,562` 改为直接调用 `callHermesSummarizer`，并删除 `allowHermesFallback` 这个现已无意义的分支开关
- `:570-656` 删除 `callEkkoSummarizer` 整个函数

- [ ] **Step 6: 跑压缩相关测试**

```bash
npx vitest run tests/server/context-compressor.test.ts tests/server/run-chat-compression.test.ts
```

预期：PASS。若有断言依赖 Ekko 路径，改断言为 Hermes 路径，**不要删除断言**。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "♻️ refactor(summary): 上下文压缩与群聊滚动摘要改用 Hermes 引擎"
```

---

## Task 6: MCU 默认运行时改为 hermes（变更 B）

**Files:**
- Modify: `packages/server/src/modules/studio/services/global-agent/mcu-agent-runtime.ts:4,6,8-28`
- Modify: `packages/esp32-c3/v1/src/main.cpp:1129,2886-2890,3145`
- Test: `tests/server/global-agent-server.test.ts`
- Test: `tests/server/mcu-login-controller.test.ts`
- Test: `tests/server/mcu-firmware-source.test.ts`

**Interfaces:**
- Consumes: Task 3 收窄后的 `McuAgentRuntime = 'hermes'`
- Produces: `DEFAULT_MCU_AGENT_RUNTIME = 'hermes'`；`mcuChatRunFields()` 只返回 hermes 形态（`source: 'global_agent'`），不再返回 `coding_agent_id: 'ekko-agent'`

- [ ] **Step 1: 先写失败测试**

在 `tests/server/global-agent-server.test.ts` 中新增：

```ts
it('MCU 语音会话默认使用 hermes 运行时', () => {
  expect(DEFAULT_MCU_AGENT_RUNTIME).toBe('hermes')
  const fields = mcuChatRunFields('hermes')
  expect(fields).not.toHaveProperty('coding_agent_id')
  expect(fields.source).toBe('global_agent')
})
```

同时在 `tests/server/mcu-login-controller.test.ts` 中新增一条：断言 MCU 会话 id **不包含** `ekko` 字样。

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/server/global-agent-server.test.ts -t "MCU 语音会话默认使用 hermes"
npx vitest run tests/server/mcu-login-controller.test.ts
```

预期：FAIL —— `DEFAULT_MCU_AGENT_RUNTIME` 当前是 `'ekko'`。

- [ ] **Step 3: 改服务端默认值**

`services/global-agent/mcu-agent-runtime.ts`：
- `:4` 类型已由 Task 3 收窄
- `:6` `DEFAULT_MCU_AGENT_RUNTIME` 改为 `'hermes'`
- `:8-12` `normalizeMcuAgentRuntime` 简化为恒返回 `'hermes'`（或直接删除该函数及其调用点）
- `:14-28` `mcuChatRunFields` 删除 `coding_agent_id: 'ekko-agent'` 分支，只保留 hermes 返回

- [ ] **Step 4: 改固件默认值**

`packages/esp32-c3/v1/src/main.cpp`：`:1129`、`:2886-2890`、`:3145` 三处的 Ekko 默认字符串改为 `hermes`。

```bash
grep -n "ekko" packages/esp32-c3/v1/src/main.cpp
```

预期：改动后该命令无输出。

- [ ] **Step 5: 运行测试确认通过**

```bash
npx vitest run tests/server/global-agent-server.test.ts tests/server/mcu-login-controller.test.ts tests/server/mcu-firmware-source.test.ts
```

预期：PASS。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "♻️ refactor(mcu): MCU 语音默认运行时由 Ekko 改为 Hermes 并同步固件"
```

---

## Task 7: 客户端类型与共享映射表收敛（L3）

**Files:**
- Modify: `packages/client/src/api/agent-status.ts:3,37-38`
- Modify: `packages/client/src/api/coding-agents.ts:5`
- Modify: `packages/client/src/api/studio/chat.ts:29,30,85,136,189`
- Modify: `packages/client/src/api/studio/group-chat.ts:89,126`
- Modify: `packages/client/src/api/studio/group-chat-agent-link.ts:4`
- Modify: `packages/client/src/utils/chat-agent-avatar.ts:2,14,22`
- Modify: `packages/client/src/utils/group-agent-avatar.ts:4,6`
- Modify: `packages/client/src/utils/codingAgentProviders.ts:21,28`
- Modify: `packages/client/src/stores/hermes/chat.ts`（16 处）
- Modify: `packages/client/src/components/hermes/chat/ChatPanel.vue:924,945,1056,1248-1249,1775-1776`
- Modify: `packages/client/src/components/hermes/chat/MessageList.vue:298-301`
- Modify: `packages/client/src/components/hermes/chat/RealtimeVoiceStage.vue:158`
- Modify: `packages/client/src/components/hermes/usage/AgentBreakdown.vue:14`
- Modify: `packages/client/src/components/hermes/group-chat/GroupChatPanel.vue:233,235-241,281-282,370`
- Modify: `packages/client/src/components/hermes/group-chat/CreateRoomForm.vue:41`
- Modify: `packages/client/src/components/hermes/group-chat/GroupMessageList.vue:31`
- Modify: `packages/client/src/views/hermes/WorkflowView.vue:418`
- Modify: `packages/client/src/views/hermes/GroupChatLinkView.vue:101,127-128`
- Modify: `packages/client/src/views/hermes/LogsView.vue:18,76,90`
- Modify: `packages/client/src/router/index.ts:202-225`
- Modify: `packages/client/src/App.vue`（约 15 处）

**Interfaces:**
- Consumes: Task 2 的删除结果、Task 3 的 server 契约（wire 类型需与 server 一致）
- Produces: `npx vue-tsc -b --noEmit` exit 0

- [ ] **Step 1: 先收敛最底层的核心联合类型**

按此顺序改（每一步都会让编译器报出下一批错误）：

1. `api/coding-agents.ts:5` —— `ChatCodingAgentId` 删除 `| 'ekko-agent'`
2. `api/agent-status.ts:3` —— `AgentStatusId` 删除 `'ekko-agent'`；`:37-38` 删除 `ekko` / `ekko-agent` 两条 alias
3. `api/studio/group-chat.ts:89,126` 与 `api/studio/group-chat-agent-link.ts:4` —— agent 联合删除 `'ekko'`
4. `api/studio/chat.ts:136,189` —— `runtime` 联合删除 `'ekko'`；`:85` 改注释

- [ ] **Step 2: 收敛 store 与转换函数**

`stores/hermes/chat.ts`：
- `:30` `ChatAgentId` 删 `'ekko-agent'`
- `:36` `agentToCodingAgentId` 删 ekko 行
- `:44` `codingAgentIdToAgent` 删 ekko 行
- `:436` `QueueInsertionState.runtime` 删 `'ekko'`
- `:978` 删除 `handleToolCompleted` 的整个 ekko 分支块
- `:2270-2273` 删除 `isEkkoAgentSession` 函数，并清理 `:2407,2469,4086,4745` 四处调用
- `:2299` 删除 `|| payload.runtime === 'ekko'` 条件（保留 hermes 前置判定）
- `:2405-2408`、`:4085-4087`、`:4744-4746` 删除 `delegate_task` 跳过 clause
- `:2468-2474` 删除整块
- `:3000-3005` 删除 `'ekko'` 分支
- `:3425-3427` 删除 ekko 头像分支

**注意 `:2270` 的 `isEkkoAgentSession`**：它被 4 处调用，全部删除后确认这些位置原本的语义仍成立（Ekko 会话消失后应走默认路径，而非跳过处理）。

- [ ] **Step 3: 收敛头像与显示名映射表**

以下 6 张结构相同的"5 元素 agent 表"，每张都删除 `Ekko` 元素：

- `utils/chat-agent-avatar.ts:2`（`label` 字面量联合）、`:14`（`AGENT_AVATARS` 条目）、`:22`（`'ekko-agent' || 'ekko_agent' || 'ekko'` 判断）
- `utils/group-agent-avatar.ts:6`（`DEFAULT_AGENT_ICONS` 的 `ekko` 键）——**必须与 `api/studio/group-chat.ts:89` 的联合类型同一步改**，否则 `Record<RoomAgent['agent'], string>` 会报 property missing
- `components/hermes/chat/RealtimeVoiceStage.vue:158`
- `components/hermes/usage/AgentBreakdown.vue:14`（键名是 `ekko_agent`，下划线形式，容易漏）
- `components/hermes/group-chat/GroupMessageList.vue:31`
- `components/hermes/group-chat/GroupChatPanel.vue:235-241`

- [ ] **Step 4: 收敛 provider 鉴权判断**

`utils/codingAgentProviders.ts`：
- `:21` `canScopedCodingAgentUseProvider` 删除 Ekko 短路，改为 `return !isAuthModelProvider(provider)`
- `:28` `usesServerManagedProviderAuth` —— Ekko 是**唯一**"服务端托管鉴权"的 agent，删除后该函数恒 `false`。**整体删除该函数**，并清理调用点：`ChatPanel.vue:1056`（连带删除 `newChatUsesServerAuth` computed）、`:959`、`:1790`、`GroupChatPanel.vue:288,370`、`CreateRoomForm.vue:41`、`WorkflowAgentNode.vue:35`、`WorkflowView.vue:1032`、`GroupChatLinkView.vue:134`
- 重新推演 `newChatNeedsApiKey` / `newChatNeedsBaseUrl` 的逻辑：删除"服务端托管鉴权"分支后，新会话一律按需要 API Key 处理

`GroupChatPanel.vue:370` 与 `CreateRoomForm.vue:41` 的 `summaryModelGroups` 过滤器目前硬编码 `canScopedCodingAgentUseProvider('ekko-agent', group.provider)` —— 改用实际 summary agent，或直接以 `group.provider !== 'moa'` 判断。

- [ ] **Step 5: 收敛 ChatPanel 与 MessageList**

`ChatPanel.vue`：删 `:924` 的 `{ label:"Ekko", value:"ekko-agent" }` 选项；`:945` `effectiveNewChatMode` 简化为 `return requestedMode`；`:1248-1249`、`:1775-1776` 删除 ekko 三元分支。
`MessageList.vue:298-301` 删除 `if (agent === 'ekko-agent')` 分支。

- [ ] **Step 6: 收敛路由与 App 外壳**

`router/index.ts:202-225` —— 整块删除 4 条 `/ekko/*` 路由。
`App.vue` —— 删除：`:36-39` 的 `EkkoConfigSidebar` 异步 import、`:111-113` 的 `usesEkkoConfigSidebar` computed、`:120`/`:129`/`:173`/`:270`/`:299` 中对该 computed 的引用、`:293-295` 的组件节点、`:380-382`/`:393`/`:431`/`:557`/`:578` 的 SCSS 规则。

**保留** `src/styles/_agent-config-sidebar.scss` —— 它与 `HermesConfigSidebar.vue` 共用，mixin `layout($agent)` 已参数化，无硬编码 ekko。

- [ ] **Step 7: 收敛 views/hermes 中的孤立引用**

`WorkflowView.vue:418` 删除 Ekko 选项；`GroupChatLinkView.vue:101,127-128` 删除选项与三元分支；`LogsView.vue:18,76,90` 删除 `ekko-agent` 正则替换、查询条件与回退项。

- [ ] **Step 8: 让 client 类型检查变绿**

```bash
npx vue-tsc -b --noEmit
```

预期：exit 0。若报错，**不要用 `as any` 掩盖**，回到对应 Step 收敛。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "♻️ refactor(client): 收敛 Ekko 类型分支、映射表与路由"
```

---

## Task 8: AI 排障抽屉改指 Hermes（变更 C）

**Files:**
- Modify: `packages/client/src/views/hermes/AgentManagerView.vue:161-166,179-184,365-389`
- Modify: `packages/client/src/i18n/locales/*.ts`（`agentManager.aiHelp*` 3 个 key × 11 个 locale）

**Interfaces:**
- Consumes: Task 7 收敛后的 `ChatAgentId`
- Produces: AI 排障抽屉以 `agent: 'hermes'` 创建会话；`data-testid="agent-card-ekko"` 卡片消失

- [ ] **Step 1: 删除硬编码的 Ekko built-in agent 卡片**

`AgentManagerView.vue:365-389` —— 整段 `<section>` 删除（含 `data-testid="agent-card-ekko"`、logo、Studio 版本标签、设置按钮）。`:382` 的 `router.push({name:'ekko.settings'})` 随卡片一并消失。

- [ ] **Step 2: 把 AI 排障会话改指 Hermes**

`AgentManagerView.vue:161-166` —— `startAiHelpChat` 中的 `agent: 'ekko-agent', codingAgentId: 'ekko-agent'` 改为：

```ts
agent: 'hermes',
codingAgentId: undefined,
```

`:179-184` 的 `openGeneralAiHelpDrawer` 无需改动（它只调 `startAiHelpChat`）。

- [ ] **Step 3: 改写 i18n 文案**

11 个 locale 文件（`ar,de,en,es,fr,ja,ko,pt,ru,zh-TW,zh`）中 `agentManager` 下的 3 个 key：
- `ekkoDescription` → **删除**（Ekko 卡片已删）
- `aiHelpDialogQuestion` → 保留 key，改写文案去掉 Ekko 字样
- `aiHelpDrawerTitle` → 保留 key，改写文案去掉 Ekko 字样

各语言按语义翻译，不要留英文占位。

- [ ] **Step 4: 手工验证**

```bash
npm run dev
```

在浏览器打开，进入「Agent 管理」页：
- 确认**没有** Ekko agent 卡片
- 触发一次安装失败场景（或直接调用 AI 排障入口），确认抽屉打开且**能正常创建 Hermes 会话**

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "♻️ refactor(agent-manager): AI 排障抽屉改由 Hermes 驱动并移除 Ekko 卡片"
```

---

## Task 9: 构建脚本与 CI 收敛（L4）

**Files:**
- Modify: `package.json:43,44,45,46`
- Modify: `nodemon.json:2`
- Modify: `scripts/build-server.mjs:59-65`
- Modify: `scripts/generate-openapi.mjs:71-74`
- Modify: `scripts/server-module-boundaries.mjs:10-18,22`
- Modify: `docs/harness/server-module-boundaries.md:21-26,258,342,355-360`
- Modify: `docs/openapi.json`（重新生成）

**Interfaces:**
- Consumes: Task 2 的删除结果
- Produces: `npm run build` 与 `npm run harness:check` exit 0；`dist/` 不再产出 `ekko-skills/`

- [ ] **Step 1: 清理 npm scripts**

`package.json`：
- `:43` `harness:check` 删掉尾部 `&& npm --prefix packages/ekko-agent run api:docs:check`
- `:44` `harness:memory` —— 删除（其测试文件已随 Task 2 删除）
- `:45` `test:ekko-agent` —— 删除
- `:46` `build:ekko-agent` —— 删除

- [ ] **Step 2: 清理构建脚本**

`nodemon.json:2` —— 从 `watch` 数组移除 `packages/ekko-agent/src`。
`scripts/build-server.mjs:59-65` —— 删除把 `packages/ekko-agent/skills` 拷到 `dist/ekko-skills` 的整段逻辑。保留 `:51-57`（`packages/skills` → `dist/skills`）与 `:67-96`（esp32-c3 固件 → `dist/mcu/`）。
`scripts/generate-openapi.mjs:71-74` —— 删除 4 条指向 `modules/ekko/routes/*` 的 tagMappings。
`scripts/server-module-boundaries.mjs:13,18` —— 从 `TARGET_MODULES` 与 `AGENT_MODULE_SET` 删除 `'ekko'`；`:22` 注释同步。

- [ ] **Step 3: 同步边界文档**

`docs/harness/server-module-boundaries.md` —— 删除 `:21-26,258,342,355-360` 中 Ekko 作为 AgentFamily / AgentRuntime / 依赖矩阵条目与 `ekko/` 目录说明。

- [ ] **Step 4: 重新生成 OpenAPI 与构建**

```bash
npm run build
```

预期：exit 0。
验证产物：

```bash
ls dist/ | grep -i ekko    # 应无输出
ls dist/                    # 应含 skills/ 与 mcu/，不含 ekko-skills/
```

- [ ] **Step 5: 跑 harness 检查**

```bash
npm run harness:check
```

预期：exit 0。注意 `scripts/harness-check.mjs:407-408` 的 `download.ekkolearnai.com` 与 `EKKOLearnAI/hermes-studio` 是**品牌/下载源字符串**，由 Task 11 处理，本步不动。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "🔧 build(scripts): 移除 Ekko 构建目标、OpenAPI 映射与模块边界条目"
```

---

## Task 10: desktop 打包校验去 Ekko

**不做这一步，desktop 打包会在 `afterPack` 阶段直接失败。**

**Files:**
- Modify: `packages/desktop/scripts/verify-packaged-webui.mjs:5,30,140-146`
- Modify: `tests/desktop/packaged-webui.test.ts:36+`
- Modify: `packages/desktop/electron-builder.yml:47`（注释）

**Interfaces:**
- Consumes: Task 9 中 `dist/ekko-skills` 已不再产出
- Produces: desktop 打包校验不再要求 `dist/ekko-skills/**`，改为校验 `dist/skills/**`

- [ ] **Step 1: 先改测试**

`tests/desktop/packaged-webui.test.ts` —— 把断言中的 `ekko-skills` 改为 `skills`：

```bash
grep -n "ekko" tests/desktop/packaged-webui.test.ts
```

逐条改为对应的非 Ekko 路径。

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/desktop/packaged-webui.test.ts
```

预期：FAIL（实现仍要求 `ekko-skills`）。

- [ ] **Step 3: 改校验实现**

`packages/desktop/scripts/verify-packaged-webui.mjs` —— `:5` 与 `:30` 的 `ekko-skills` 常量改为 `skills`；`:140-146` 的校验分支同步。
`packages/desktop/electron-builder.yml:47` —— 注释中的 `dist/ekko-skills` 改为 `dist/skills`。

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/desktop/packaged-webui.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "🔧 build(desktop): 打包校验由 ekko-skills 改为 skills"
```

---

## Task 11: 断开上游云服务并替换品牌标识（L5）

**本 Task 的目标是让 fork 不再向作者服务器发送任何请求。**

**Files:**
- Modify: `packages/client/src/api/studio/versions.ts:1`
- Modify: `packages/server/src/modules/hermes/services/runtime/version-manager.ts:15,16`
- Modify: `packages/server/src/modules/studio/public/config.ts:81-84,86,89`
- Modify: `packages/server/src/modules/studio/services/app-relay/route.ts:8`
- Modify: `packages/desktop/src/main/updater.ts:16,17`
- Modify: `packages/desktop/src/main/runtime-manager.ts:47,48`
- Modify: `packages/client/src/components/hermes/connections/AppConnectionsPanel.vue:38,39`
- Modify: `packages/client/src/components/layout/AppSidebar.vue:383`
- Modify: `packages/desktop/package.json:5`
- Modify: `package.json`（homepage，Task 1 已改）
- Modify: `.github/ISSUE_TEMPLATE/config.yml:4,7`
- Modify: `README.md`、`README_zh.md`、`docs/docker.md`、`docs/app-relay.md`、`docs/planning/*.md`、`packages/desktop/README.md`
- Test: `tests/server/runtime-version-manager.test.ts:151,256,261`
- Test: `tests/server/local-stt-model-manager.test.ts:150,153`
- Test: `tests/server/update-controller.test.ts:27,242,281,288,331`
- Test: `tests/server/app-relay-route.test.ts:27,37`
- Test: `tests/server/mcu-login-controller.test.ts:191`
- Test: `tests/server/agent-bridge-manager.test.ts:192`
- Test: `tests/client/app-connections-panel.test.ts:43`
- Test: `tests/client/studio-version-manifest.test.ts:30`

**Interfaces:**
- Consumes: 无（可与 Task 9/10 并行）
- Produces: 全部上游云服务地址已改指自有仓库或断开；`grep -ri "ekkolearnai"` 与 `grep -ri "hermes-studio.ai"` 均无输出

- [ ] **Step 1: 断开 App Relay 中继**

`public/config.ts:86,89` —— 把两个默认 URL 从 `'https://api.hermes-studio.ai'` 改为空串：

```ts
const remoteRelay = {
  url: process.env.HERMES_REMOTE_RELAY_URL?.trim() || '',
}
const appRelay = {
  url: process.env.HERMES_APP_RELAY_URL?.trim() || '',
  entitlementRequired: isAppEntitlementRequired(),
}
```

`services/app-relay/route.ts:8` —— 删除 `CLOUDFLARE_APP_RELAY_URL` 常量，`appRelayUrlForRoute` 恒返回 `config.appRelay.url`（保持签名不变）。

**理由**：App Relay 是作者的云中转服务，自建不可行。留空后功能在未配置 `HERMES_APP_RELAY_URL` 时自然不可用，但代码路径与自建接入能力保留。

- [ ] **Step 2: 关闭 App Entitlement 强制**

`public/config.ts:81-84` —— `isAppEntitlementRequired` 默认值由 `true` 改为 `false`：

```ts
export function isAppEntitlementRequired(env: Record<string, string | undefined> = process.env): boolean {
  const value = String(env.HERMES_APP_ENTITLEMENT_REQUIRED || '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(value)
}
```

**理由**：entitlement token 由作者私钥签发，内置公钥只能验签，fork 永远无法通过校验；原默认值 `true` 会让 LAN 访问功能直接不可用。

- [ ] **Step 3: 版本清单改指自有仓库**

`packages/client/src/api/studio/versions.ts:1`：

```ts
export const STUDIO_VERSION_MANIFEST_URL = 'https://api.github.com/repos/AIgniteLUO/hermes-studio/releases'
```

`packages/server/src/modules/hermes/services/runtime/version-manager.ts:15,16`：

```ts
const DEFAULT_REMOTE_MANIFEST_URL = 'https://api.github.com/repos/AIgniteLUO/hermes-studio/releases'
```

`:16` 的 `FALLBACK_REMOTE_MANIFEST_URL`（`https://hermes-studio.ai/versions.json`）**整行删除**，并清理其调用点。

**注意**：GitHub Releases API 的响应结构与原 `/api/studio/versions` 不同。需检查 `versions.ts:46-49` 与 `version-manager.ts` 的解析逻辑，若结构不兼容，改为在 fork 的 release 流水线里**额外产出一个 `versions.json`**（Task 13 处理）并指向它。

- [ ] **Step 4: 桌面更新与运行时下载改指 GitHub**

`packages/desktop/src/main/updater.ts:16,17` —— 删除 `CLOUDFLARE_LATEST_FEED_URL`，`GITHUB_LATEST_FEED_URL` 改为：

```ts
const GITHUB_LATEST_FEED_URL = 'https://github.com/AIgniteLUO/hermes-studio/releases/latest/download'
```

`packages/desktop/src/main/runtime-manager.ts:47,48`：

```ts
const DEFAULT_RUNTIME_BASE_URL = 'https://github.com/AIgniteLUO/hermes-studio/releases/latest/download'
const DEFAULT_RUNTIME_GITHUB_REPO = 'AIgniteLUO/hermes-studio'
```

检查 `RuntimeDownloadSource` 的 `'cf' | 'github'` 分支：删除 `'cf'` 源，只保留 `'github'`。

- [ ] **Step 5: APK 下载与 OpenRouter referer 改指**

`packages/client/src/components/hermes/connections/AppConnectionsPanel.vue:38,39`：

```ts
githubUrl: 'https://github.com/AIgniteLUO/hermes-studio/releases/latest/download/HStudio.apk',
cloudflareUrl: 'https://github.com/AIgniteLUO/hermes-studio/releases/latest/download/HStudio.apk',
```

`packages/client/src/components/layout/AppSidebar.vue:383` —— 仓库链接改为 `https://github.com/AIgniteLUO/hermes-studio`。
`HERMES_OPENROUTER_APP_REFERER` 的默认值 `https://hermes-studio.ai` 改为 `https://github.com/AIgniteLUO/hermes-studio`（查找 `agent-bridge` 相关配置处）。

- [ ] **Step 6: 更新受影响的测试断言**

把上列 9 个测试文件中的旧 URL 断言改为新 URL。这些测试本来就断言"URL 是什么"，改断言是正确的，**不是**在掩盖问题：

```bash
npx vitest run tests/server/runtime-version-manager.test.ts \
  tests/server/local-stt-model-manager.test.ts \
  tests/server/update-controller.test.ts \
  tests/server/app-relay-route.test.ts \
  tests/server/agent-bridge-manager.test.ts \
  tests/client/app-connections-panel.test.ts \
  tests/client/studio-version-manifest.test.ts
```

预期：PASS。

- [ ] **Step 7: 替换文档与元数据中的品牌域名**

`README.md`、`README_zh.md`、`docs/docker.md`、`docs/app-relay.md`、`docs/planning/*.md`、`packages/desktop/README.md`、`packages/desktop/package.json:5`、`packages/desktop/electron-builder.yml:11`、`.github/ISSUE_TEMPLATE/config.yml:4,7`：

- `EKKOLearnAI/hermes-studio` → `AIgniteLUO/hermes-studio`
- `ekkoye8888/hermes-web-ui` → `ghcr.io/aigniteluo/hermes-web-ui`
- `https://hermes-studio.ai/#/docs/...` → `https://github.com/AIgniteLUO/hermes-studio#readme`
- `https://download.ekkolearnai.com` → `https://github.com/AIgniteLUO/hermes-studio/releases/latest/download`
- `packages/desktop/electron-builder.yml:11` 的 `publish.url` → 新仓库 Releases

**`LICENSE` 文件不动**（见 Global Constraints）。

- [ ] **Step 8: 验证断开彻底**

```bash
grep -ri "ekkolearnai\|ekkoye8888" --exclude-dir=.git --exclude-dir=node_modules . | grep -v "^./LICENSE"
grep -ri "hermes-studio\.ai" --exclude-dir=.git --exclude-dir=node_modules .
```

预期：两条命令均无输出（LICENSE 除外，已用 `grep -v` 排除）。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "🔒 fix(security): 断开上游云服务并替换 Ekko 品牌域名"
```

---

## Task 12: i18n 与静态资源收敛

**Files:**
- Modify: `packages/client/src/i18n/locales/{ar,de,en,es,fr,ja,ko,pt,ru,zh-TW,zh}.ts`

**Interfaces:**
- Consumes: Task 7/8 的 client 收敛结果
- Produces: 11 个 locale 文件中不再有 `ekkoConfig.*` 整块与 Ekko 专有 key

- [ ] **Step 1: 删除 `ekkoConfig` 整块**

每个 locale 文件中都有一个 `ekkoConfig` 对象（`en.ts:4-132`，含 127 个 key）。11 个文件全部删除该整块。

```bash
grep -c "ekkoConfig" packages/client/src/i18n/locales/*.ts
```

- [ ] **Step 2: 删除群聊与用量的 Ekko key**

- `groupChat.agentTypes.ekko`（`en.ts:3246` 对应位置）—— 删除
- `usage.agents.ekkoAgent`（`en.ts:3358` 对应位置）—— 删除
- `groupChat.summarySettingsDesc`（`en.ts:3300`）—— 改写文案去掉 Ekko 字样

- [ ] **Step 3: 处理 changelog 文案**

`en.ts:3477-3503` 等处的 `new_0_7_x_*` 发布说明中有约 11 条提及 Ekko。

**处置**：**删除提及 Ekko 的条目**（它们是上游的版本历史，对本 fork 无意义），保留其余条目。

- [ ] **Step 4: 验证无残留**

```bash
grep -ril "ekko" packages/client/src/i18n/
```

预期：无输出。若有残留，逐个确认是"需要删除"还是"需要改写"。

- [ ] **Step 5: 验证 i18n 结构一致**

```bash
node -e '
const fs=require("fs");
const dir="packages/client/src/i18n/locales";
const en=fs.readFileSync(dir+"/en.ts","utf8");
const keys=(s)=>new Set([...s.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*):/gm)].map(m=>m[1]));
const ek=keys(en);
let bad=0;
for (const f of fs.readdirSync(dir)) {
  if (f==="en.ts") continue;
  const k=keys(fs.readFileSync(dir+"/"+f,"utf8"));
  const missing=[...ek].filter(x=>!k.has(x));
  if (missing.length) { console.log(f, "缺少顶层 key:", missing); bad++; }
}
console.log(bad===0 ? "OK: 所有 locale 顶层 key 与 en.ts 一致" : "FAIL");
'
```

预期：`OK`。若其他 locale 有 en.ts 没有的 key，说明 Task 8 的文案改写有遗漏。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "🌐 i18n(client): 移除 Ekko 配置块与相关文案"
```

---

## Task 13: 测试全量收敛与终态验证

**Files:**
- Modify: `tests/server/*.test.ts`（约 30 个含 ekko 引用的文件）
- Create: `docs/PROVENANCE.md` 的终态章节

**Interfaces:**
- Consumes: Task 1–12 全部产出
- Produces: 全绿的三层检查 + 全量构建 + 冒烟验证

- [ ] **Step 1: 枚举所有仍需处理的测试**

```bash
grep -rln "ekko" tests/ --include=*.ts
```

逐个打开，判定每一处是：
- **(a) 断言 Ekko 行为** → 删除该断言或改为断言 hermes 行为
- **(b) 偶然字符串**（如 `/Users/ekko/Desktop/...` 是用户名）→ 保留

把判定结果记到 commit message 里。

- [ ] **Step 2: 处理模块边界测试**

`tests/server/server-module-boundaries.test.ts:36,39,44,48,51` —— 删除 `'ekko'` 相关断言（Task 9 已从脚本移除该模块）。

- [ ] **Step 3: 处理契约类测试**

`tests/server/agent-availability.test.ts:16,36`、`tests/server/agent-status-registry.test.ts:19,24,89`、`tests/server/studio-agent-contracts.test.ts:16,17,20,31` —— 删除 Ekko 枚举断言，把 agent 数量断言从 5 改为 4（或按实际改动调整）。

- [ ] **Step 4: 处理 workflow / 群聊 / chat 类测试**

`tests/server/workflow-import-capabilities.test.ts:34-47`、`tests/server/workflow-manager.test.ts`、`tests/server/group-chat-{approval,member-sync,agent-workspace,routes-baseline}.test.ts`、`tests/server/run-chat-{queued-item,abort-goal,clarify-respond,run-started-at}.test.ts`、`tests/server/session-push.test.ts`、`tests/server/usage-store-agent-stats-db.test.ts`、`tests/server/skill-usage-event-store.test.ts`、`tests/server/chat-run-bridge-readiness.test.ts`、`tests/server/handle-bridge-run-session-ended.test.ts`、`tests/server/chat-webhooks.test.ts` —— 删除 Ekko 分支断言，保留其余。

- [ ] **Step 5: 跑全量测试**

```bash
npx vitest run --reporter=basic 2>&1 | tee /tmp/hermes-studio-final-test.log | tail -30
```

**验收标准见 Global Constraints 的「回归判据」**（基线存在超时抖动，不是稳定全绿）：

- 失败数 **0** → 通过。
- 失败数 **≤ 3**，且**全部**是 `Error: Test timed out in 5000ms.` 且**只**出现在那 3 个 CLI 子进程文件 → 通过。
- **其余任何失败 → 视为新增回归，必须先修复再继续**，不得带着回归进入 Task 14。

用下面这条命令确认失败集合落在允许范围内（**必须在仓库根目录运行，不要 `cd /tmp`**）：

```bash
npx vitest run --reporter=basic 2>&1 | tee /tmp/hermes-studio-final-test.log | tail -30
grep "FAIL " /tmp/hermes-studio-final-test.log | sort -u
```

`tests/server/studio-mcp-autoinject.test.ts` **不得出现在失败列表里** —— 若出现，几乎一定是运行时 cwd 落到了 `/tmp`（见 Task 1 Step 7 说明），而非代码回归。

- [ ] **Step 6: 终态 Ekko 残留扫描**

```bash
grep -ri "ekko" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist .
```

预期：只剩**白名单**：
- `.github/ISSUE_TEMPLATE/config.yml` 中若仍有历史 issue 链接（可选保留）
- `docs/PROVENANCE.md` 中的上游来源说明
- 本 spec 与 plan 文档
- `tests/server/*` 中被判定为 (b) 偶然字符串的项（如 `/Users/ekko/Desktop/...`）

把与基线（Task 2 Step 3 记录的 `303` 文件 / `5128` 行）的对比写进 `docs/PROVENANCE.md`。

- [ ] **Step 7: 全量构建与检查**

```bash
npm run build && npm run harness:check && npm run verify:sharp-runtime
```

预期：全部 exit 0。

- [ ] **Step 8: 真实启动冒烟测试**

```bash
npm start
```

浏览器打开 `http://localhost:8648`，用默认账号 `admin` / `123456` 登录，然后：
1. 新建会话 → 发一条消息 → 确认流式回复正常
2. 确认工具调用轨迹正常渲染
3. 打开「Agent 管理」页 → 确认无 Ekko 卡片
4. 打开「群聊」→ 新建房间 → 确认 agent 类型下拉框只有 Hermes / Claude Code / Codex / Pi
5. **打开 DevTools Network 面板，确认无任何请求发往 `*.ekkolearnai.com` 或 `*.hermes-studio.ai`**

- [ ] **Step 9: 提交终态**

```bash
git add -A
git commit -m "✅ test: 收敛 Ekko 相关断言并完成终态验证"
```

---

## Task 14: 文档重写与发版

**Files:**
- Modify: `README.md`（31 处 Ekko 相关）
- Modify: `README_zh.md`（同上）
- Modify: `ARCHITECTURE.md:12,41`
- Modify: `AGENTS.md:34,43`
- Delete: `docs/planning/ekko-agent-configuration-pages.md`
- Delete: `docs/planning/ekko-background-callback-context.md`
- Modify: `docs/PROVENANCE.md`

**Interfaces:**
- Consumes: Task 13 的终态验证结果
- Produces: 文档与代码现状一致；`v1.0.0` tag 与 release

- [ ] **Step 1: 重写 README 的 Agent 能力表**

`README.md` / `README_zh.md`：
- 删除所有 Ekko 族条目（`:8,34,49,64,123,184,296,315,350,387,470,475` 对应位置）
- 架构图中的 `Ekko family` 删除
- 核心能力表里的"多 Agent 运行时"改为只列 Hermes / Claude Code / Codex / Pi
- Agent Family 表从三族改为两族（Hermes、Coding）
- 顶部 badges 与链接按 Task 11 的新地址更新
- **新增一节「本 fork 的改动」**，链接到 `docs/PROVENANCE.md`

- [ ] **Step 2: 更新架构与协作文档**

`ARCHITECTURE.md:12` —— 删除 `| Ekko Agent | packages/ekko-agent | ... |` 行；`:41` 的模块列表去掉 `modules/ekko`。
`AGENTS.md:34` —— 删除 `packages/ekko-agent` 描述行；`:43` 的代码放置规则去掉 `modules/ekko`。

- [ ] **Step 3: 删除 Ekko 专属规划文档**

```bash
rm -f docs/planning/ekko-agent-configuration-pages.md
rm -f docs/planning/ekko-background-callback-context.md
```

**保留** `docs/agent-runner.md`（是 Coding Agents 文档，非 Ekko 专属）与 `docs/app-relay.md`（App 中继文档，Task 11 已更新 URL）。

- [ ] **Step 4: 补全 PROVENANCE 终态章节**

在 `docs/PROVENANCE.md` 追加：

```markdown
## 终态（2026-10-14）

- Ekko 残留：<填入 Task 13 Step 6 的实际结果，对比基线 303 文件 / 5128 行>
- 三层检查：`vue-tsc` exit 0 / `tsc -p packages/server` exit 0 / `vitest run` <填入：exit 0，或「exit 1 且失败集合与基线完全一致」>
- 全量构建：`npm run build` / `npm run harness:check` / `npm run verify:sharp-runtime` 均 exit 0
- 上游云服务：已全部断开，冒烟测试确认无外发请求
- `authorized-provider-adapter` 处置：<填入 Task 4 Step 2 的结论>
```

- [ ] **Step 5: 提交文档**

```bash
git add -A
git commit -m "📝 docs: 重写 README 与架构文档，去除 Ekko 内容"
```

- [ ] **Step 6: 打 tag 并推送**

```bash
git push origin main
git tag -a v1.0.0 -m "hermes-studio v1.0.0 (Ekko-free fork, 基于上游 v0.7.15)"
git push origin v1.0.0
```

- [ ] **Step 7: 验证 release 产物符合 FPK 契约**

在 GitHub 上基于 `v1.0.0` 创建 release，`webui-release.yml` 应自动附加产物。然后验证：

```bash
VER=1.0.0
curl -fSL -o /tmp/asset.tar.gz \
  "https://github.com/AIgniteLUO/hermes-studio/releases/download/v${VER}/hermes-web-ui-${VER}.tar.gz"
tar -tzf /tmp/asset.tar.gz | head -5
```

预期：解包顶层为 `webui/`，且 `webui/` 下含 `package.json`、`package-lock.json`、`bin/`、`dist/`、`node_modules/`。

- [ ] **Step 8: 后续（不在本计划范围）**

`Fnos-Hermes-Studio` 需要做两处改动才能切到本 fork：
- `scripts/build-fpk.sh:255` —— 仓库地址改为 `AIgniteLUO/hermes-studio`
- `.github/workflows/auto-update.yml:36,52` —— API 地址改为 `api.github.com/repos/AIgniteLUO/hermes-studio/releases`
- `config/bootstrap/hermes-studio-version.env` —— `HERMES_STUDIO_VERSION=1.0.0`

把这三点记入 `Fnos-Hermes-Studio` 的待办，本计划不执行。

---

## 附录：任务依赖关系

```
Task 1 (基线)
  └→ Task 2 (整块删除)
       └→ Task 3 (契约层)  ←── 类型检查器开始报错
            └→ Task 4 (服务层)  ←── server tsc 变绿
                 ├→ Task 5 (摘要引擎)   ┐
                 └→ Task 6 (MCU)        ┘ 可并行
                      └→ Task 7 (client)  ←── vue-tsc 变绿
                           └→ Task 8 (AI 排障)
                                └→ Task 12 (i18n)
Task 9  (构建脚本)  ←── 依赖 Task 2
Task 10 (desktop)   ←── 依赖 Task 9
Task 11 (云服务)    ←── 依赖 Task 2，可与 Task 9/10 并行
Task 13 (测试收敛)  ←── 依赖全部
Task 14 (文档发版)  ←── 依赖 Task 13
```
