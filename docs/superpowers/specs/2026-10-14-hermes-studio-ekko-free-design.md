# hermes-studio（Ekko-free fork）设计文档

**日期**：2026-10-14
**状态**：待 Boss 复核
**目标仓库**：`/Users/aigniteluo/Workspace/FullStackProjects/hermes-studio` → `https://github.com/AIgniteLUO/hermes-studio.git`

---

## 1. 背景与目标

上游 `EKKOLearnAI/hermes-studio` 已重命名为 `EKKOLearnAI/ekko-studio`（git 重定向证实），产品重心从"Hermes Agent 的 Web 控制台"转向推广作者自研的 **Ekko Agent** 运行时，并叠加了一整套指向作者自有云服务的运行时依赖。

本项目基于上游标签 **`v0.7.15`** 建立一份**纯自用**的精简 fork：

1. **移除 Ekko Agent 这一族能力**（不是 feature flag 隐藏，是物理删除）。
2. **保留其余全部 Studio 能力** —— Hermes 模块、Coding Agents（Claude Code / Codex / Pi）、单聊、群聊、工作流、Kanban、文件、终端、设备、MCU、桌面宠物等。
3. **去除 Ekko 品牌与推广**，替换为自有仓库标识。
4. **断开上游云服务**，使 fork 不再向作者服务器发任何请求。

### 非目标

- 不跟踪上游后续版本（纯自用，无 rebase/cherry-pick 计划）。
- 不重命名 npm 包名 `hermes-web-ui`（FPK 构建契约、CLI 名、`HERMES_WEB_UI_HOME` 均依赖它）。
- 不改动上游 `LICENSE` 文本与版权署名（见 §9）。
- 不新增功能。

---

## 2. 关键前提

### 2.1 FPK 集成契约（硬约束）

`Fnos-Hermes-Studio` 通过固定路径消费本 fork 的产物，本 fork 必须持续满足：

```
GET https://github.com/AIgniteLUO/hermes-studio/releases/download/v${ver}/hermes-web-ui-${ver}.tar.gz
解包后顶层为 webui/，内含：package.json  package-lock.json  bin/  dist/  node_modules/
```

来源：`Fnos-Hermes-Studio/scripts/build-fpk.sh:255`、`.github/workflows/auto-update.yml:36,52`。
因此本 fork 必须自带 release 流水线，产出同名同构的 `hermes-web-ui-<ver>.tar.gz` 与 `.sha256`、`.json` 清单。

### 2.2 许可证

上游为 **BSL 1.1**（Business Source License），Additional Use Grant 允许个人/教育/研究等非商业用途，商用需单独授权，2029-05-10 后转 Apache 2.0。

本项目为**纯自用非商业**用途，落在许可范围内。**`LICENSE` 文本与 Licensor 署名保持原样** —— 修改他人许可证中的版权主体属于虚假署名，不在本次范围。仅仓库地址、域名等指向性标识做替换。

### 2.3 仓库形态

上游**不是** npm workspaces monorepo：根 `package.json` 无 `workspaces` 字段，`packages/{client,server,skills,esp32-c3}` 均无自己的 `package.json`，`packages/ekko-agent` 与 `packages/desktop` 各自独立（desktop 自带 lockfile）。`packages/ekko-agent` 被 server 通过**相对路径** `../../../ekko-agent/src` 引用，而非 workspace 依赖。

**影响**：删除过程中无需改动任何 lockfile 的 workspace 依赖，只需修正相对路径 import。

---

## 3. 架构：五层自下而上切除

代码库使用严格的 TypeScript 联合类型（`AgentFamily`、`AgentRuntime`、`ChatCodingAgentId`）与 `as const satisfies Record<...>` 约束，**类型检查器本身就是最可靠的"遗漏检查器"**。因此按依赖方向自下而上分层切除，每层完成后必须通过对应的类型检查。

| 层 | 范围 | 主要内容 |
|---|---|---|
| **L0 契约层** | `packages/server/src/modules/studio/contracts/**`、`public/**` | 从枚举/联合类型中移除 `'ekko'`、`'ekko-agent'`、`'ekko_agent'` —— 约 30 处扩散点的源头 |
| **L1 模块层** | `packages/ekko-agent/`、`modules/ekko/`、`bootstrap/*` | 整包整目录删除 + 7 个 bootstrap 适配器解耦 |
| **L2 服务层** | `sockets/`、`services/`、`controllers/`、`repositories/` | 删除 ekko 分支（`sockets/chat-run.ts` 是重灾区，约 20 处） |
| **L3 客户端层** | `packages/client/src/{views,api,utils}/ekko`、共享映射表、i18n | 独立可删，无外溢 |
| **L4 构建发布层** | 根 scripts、`nodemon.json`、`server-module-boundaries.mjs`、`generate-openapi.mjs`、CI、文档 | 让流水线重新变绿 |
| **L5 外部依赖层** | 上游云服务常量、品牌域名、desktop 打包校验 | 断开 phone-home，替换品牌标识 |

### 3.1 关键利好（取证确认）

`packages/client/src/{api,utils,views}/ekko` 与 `components/layout/EkkoConfigSidebar.vue`、`utils/ekko/memory-graph.ts` **只被自己人互相引用**，没有任何 hermes/studio 侧代码依赖它们 —— L3 大部分是纯粹的整目录删除，无外溢。

### 3.2 关键风险

`packages/server/src/bootstrap/chat-agent-runtime-adapter.ts` 与 `group-chat-agent-runtime-adapter.ts` 向公共服务注入 **24 个 Ekko 专用方法**（`public/chat-agent-runtime.ts:29-57,84-99`、`public/group-chat-agent-runtime.ts:8-15,32-39`），这些方法被 `context-compressor`、`group-chat/room-summary`、`sockets/*`、`chat-run/abort` 消费。这是**功能级耦合**，不是简单的 import 删除，必须为其中两个能力提供替代实现（见 §4）。

---

## 4. 三个模型变更

这三处删除后**行为会改变**，需要替代实现，是本项目的主要功能回归风险。

### 变更 A：摘要引擎从 Ekko 切换为 Hermes

- `services/context-compressor/index.ts`：1:1 对话上下文压缩**当前首选 Ekko 运行时**（`callEkkoSummarizer`，`:570-656`），Hermes 仅为 fallback（`allowHermesFallback`）。
- `services/group-chat/room-summary.ts`：群聊滚动摘要默认走 `runBareEkkoSummary`（`:565-630`），**且没有 Hermes 兜底**。

**处置**：1:1 压缩直接切到已有的 `callHermesSummarizer`；群聊 `room-summary` 需新写 Hermes 版实现，保持现有 `summaryRunner` 可注入接口不变。
**验证**：`tests/server/context-compressor.test.ts`、群聊摘要相关测试必须通过。
**风险**：摘要质量、超时、token 成本可能与 Ekko 路径不同，需实测观察。

### 变更 B：MCU 语音默认运行时从 `ekko` 改为 `hermes`

- `services/global-agent/mcu-agent-runtime.ts:6`：`DEFAULT_MCU_AGENT_RUNTIME = 'ekko'`
- `sockets/global-agent.ts:1642`：`this.mcuSessionId(..., 'ekko')` 硬编码
- `packages/esp32-c3/v1/src/main.cpp:1129,2886-2890,3145`：固件中 Ekko 为默认
- `public/mcu-voice.ts:3`：`McuAgentRuntime = Extract<AgentRuntime,'ekko'|'hermes'>`

**处置**：类型收窄为 `'hermes'`，默认值、硬编码、固件同步改。**保留 MCU/设备能力**（删除 MCU 超出"移除 Ekko 一族"范围）。
**影响**：会改变会话 id 与 `source` 语义（`coding_agent` → `global_agent`），需确认设备端不依赖 `'ekko'` 命名。

### 变更 C：AgentManagerView 的「AI 排障」抽屉改指 Hermes

- `views/hermes/AgentManagerView.vue:161-184`：Agent 安装/更新/卸载失败时的 AI 排障抽屉，通过创建 `agent:'ekko-agent'` 的会话工作，是全客户端唯一以 Ekko 为**功能驱动**（而非配置对象）的地方。

**处置**：改指 Hermes（`agent: 'hermes'`），保留排障功能与 i18n 文案（改写措辞，去掉 Ekko 字样）。

---

## 5. 数据兼容策略

DB **无 migration 目录**（`infrastructure/database/` 下只有 `schemas.ts / init.ts / index.ts`），`agent` 列全部是自由 `TEXT`，**无需改表**。

历史库中可能残留 `'ekko'` / `'ekko_agent'` / `'ekko-agent'` 的字段：
`sessions.agent`、`sessions.source`、`usage`、`skill_usage_events.agent`、`gc_room_agents.agent`、`gc_agent_presets.agent`、workflow run 的 node data、`RuntimeBackgroundTask.runtime`。

**策略：读侧容错，不做强制清库。**
- 群聊：未知 `agent` 值（含历史 `'ekko'`）归一到 `'hermes'`，复用既有降级路径（`utils/group-agent-avatar.ts:29,49` 已有图标 fallback）。
- usage：未知 agent 归入 `'unknown'` 桶（`AgentBreakdown.vue:14` 既有行为）。
- 运行事件：`runtime` 不匹配任何已知分支时走默认路径，不得抛错。
- 不提供 SQL 清理脚本（自用场景下无必要，且存在误删风险）。

---

## 6. L5：上游云服务处置

取证发现以下 **不是品牌字符串，而是作者的真实云服务**。逐项处置：

| 服务 | 位置 | 处置 |
|---|---|---|
| Studio 版本清单 `api.hermes-studio.ai/api/studio/versions` | `client/src/api/studio/versions.ts:1`、`modules/hermes/services/runtime/version-manager.ts:15` | **改指** `https://api.github.com/repos/AIgniteLUO/hermes-studio/releases` |
| 备用清单 `hermes-studio.ai/versions.json` | `version-manager.ts:16` | **删除**（无对应服务） |
| App Relay 中继（official / cloudflare） | `public/config.ts:86,89`、`services/app-relay/route.ts:8` | **断开** —— 远程访问中转为作者云服务，自建不可行。保留代码路径，默认值为空串，未配置时功能自然不可用 |
| App Entitlement（`lan_access`） | `services/auth/app-entitlement.ts:6,72`、`app-relay/server.ts:157`、`public/config.ts:81-84` | **默认关闭** —— token 由作者私钥签发，内置公钥只能验签，fork 永远无法通过。`isAppEntitlementRequired` 现默认 `true`，改为默认 `false` |
| 桌面自动更新 feed `download.ekkolearnai.com/latest` | `desktop/src/main/updater.ts:16` | **改指** `https://github.com/AIgniteLUO/hermes-studio/releases/latest/download` |
| 桌面 runtime 下载基址 `download.ekkolearnai.com` | `desktop/src/main/runtime-manager.ts:47-48` | **改指** GitHub Releases（`DEFAULT_RUNTIME_GITHUB_REPO` → `AIgniteLUO/hermes-studio`） |
| APK 下载 `download.ekkolearnai.com/v1.0.0/HStudio.apk` | `client/.../AppConnectionsPanel.vue:38-39` | **改指** 新仓库 Releases |
| OpenRouter referer `https://hermes-studio.ai` | `modules/hermes/services/agent-bridge/...`、根 README | **改指** `https://github.com/AIgniteLUO/hermes-studio` |
| Docker 镜像 `ekkoye8888/hermes-web-ui` | 根 `README*`、`docs/docker.md` | **改指** `ghcr.io/aigniteluo/hermes-web-ui` |
| 仓库/Issue/Star 链接 `EKKOLearnAI/hermes-studio` | README、`package.json:7,9`、`.github/ISSUE_TEMPLATE/config.yml`、`docs/planning/*` | **改指** `AIgniteLUO/hermes-studio` |

**保持不动**：`LICENSE` 全文与 Licensor 署名（见 §2.2）。

---

## 7. 品牌与元数据

| 项 | 处置 |
|---|---|
| npm 包名 `hermes-web-ui` | **保持不变**（FPK 契约、CLI 名、环境变量前缀均依赖） |
| `package.json` 的 `repository.url` / `homepage` | 改为新仓库地址；`homepage` 指向 `https://github.com/AIgniteLUO/hermes-studio` |
| `bin/` 三个入口（`hermes-web-ui`、`hermes-studio-mcp`、`hermes-web-ui-mcp`） | **保持不变**（取证确认与 Ekko 无关） |
| 产品显示名 `Hermes Studio` | **保持不变**（本 fork 仍是 Hermes Studio，只是去掉了 Ekko）|
| `hermes-studio.ai` 文档链接 | 改为指向新仓库 README |

---

## 8. 版本与发布策略

- **版本号**：`1.0.0`（新基线，不继承上游 `0.7.x` 序列）。tag `v1.0.0`。
- **provenance**：在 `README` 与 `docs/PROVENANCE.md` 记录来源 —— `EKKOLearnAI/ekko-studio`（原 `hermes-studio`）标签 `v0.7.15`，commit `f0e5cb1`（以实际 clone 结果为准）。
- **发布流水线**：保留上游 `.github/workflows/webui-release.yml` 的结构（Remove Ekko 产物），产出 `hermes-web-ui-1.0.0.tar.gz` + `.sha256` + `.json`。
- **FPK 侧后续**（不在本项目范围，属于 `Fnos-Hermes-Studio` 的改动）：把 `build-fpk.sh:255` 与 `auto-update.yml:36` 的仓库地址切到 `AIgniteLUO/hermes-studio`。

---

## 9. 验证策略

### 每层完成后的强制检查

```bash
npx vue-tsc -b --noEmit                                    # client 类型
npx tsc --noEmit -p packages/server/tsconfig.json          # server 类型
npx vitest run                                             # 单元/集成测试
```

### 终态全量验证

```bash
npm ci --ignore-scripts && npm rebuild node-pty
npm run build              # openapi:generate + vue-tsc + vite build + tsc + build-server
npm run harness:check
npx vitest run
npm run verify:sharp-runtime
```

外加一次真实启动冒烟：`npm start` 或 `hermes-web-ui start`，登录 → 建会话 → 发消息 → 确认流式回复与工具调用正常，且**确认无向 `*.ekkolearnai.com` / `*.hermes-studio.ai` 的请求**（浏览器 DevTools Network + `lsof -i` 双向确认）。

### 测试改动范围（取证）

- **整删**：`tests/ekko-agent/**`（23 个文件）、`tests/server/` 下 8 个 ekko 专测（`ekko-agent-{approvals,auth-providers,clarifications,manager,mcp,provider-runtime}.test.ts`、`ekko-configuration-services.test.ts`、`run-chat-ekko-context.test.ts`）。
- **改写**：约 30 个含 ekko 断言的既有测试（`agent-availability`、`agent-status-registry`、`studio-agent-contracts`、`server-module-boundaries`、`workflow-import-capabilities`、`workflow-manager`、`context-compressor`、`group-chat-*`、`global-agent-server`、`logs-controller`、`run-chat-*`、`session-push`、`usage-store-agent-stats-db`、`mcu-*`、`local-stt-model-manager`、`app-relay-*`、`app-entitlement`、`runtime-version-manager`、`update-controller` 等）。
- **新增**：群聊摘要 Hermes 实现的行为测试（变更 A）。

### 基线（Task 1 实测修正，2026-10-14）

| 命令 | 结果 |
|---|---|
| `npm ci --ignore-scripts && npm rebuild node-pty` | exit 0 |
| `npm run build` | exit 0 |
| `npx vitest run` | 连跑 4 次中 1 次全绿：`Test Files 578 passed \| 2 skipped (580)`；`Tests 4761 passed \| 6 skipped (4767)` |

**基线本身存在超时抖动**：另外 3 次各有 1~3 个 `Error: Test timed out in 5000ms.`（vitest 默认 `testTimeout` 未上调），且**只**出现在会拉起真实 CLI 子进程的三个文件：`hermes-cli-discovery.test.ts`、`hermes-cli-selection-live.test.ts`、`hermes-runtime-selection.test.ts`。

**回归判据**：失败数为 0，或失败数 ≤ 3 且全部是上述三文件的 5000ms 超时。其余任何失败一律按新增回归处理。

> **更正**：早先记录的「`tests/server/studio-mcp-autoinject.test.ts` 有 13 个上游自带失败」是**测量错误**。真实成因是运行目录 —— 该用例以 `process.cwd()` 造 fixture，而 `studio-autoinject.ts:127` 同样以 `process.cwd()` 定位 MCP 脚本，`isTransientPath()`（`:69-74`）对 `/tmp` 与 `/private/tmp`（macOS 上 `realpathSync` 会把前者解析为后者）命中后跳过自动注入，使 `targets` 停在 `[]`。在仓库真实路径下该文件 18/18 全通过。
> **推论：所有测试必须在仓库真实路径下运行，禁止 `cd /tmp` 后跑测试。**

---

## 10. 风险与未决

| # | 风险 | 严重度 | 缓解 |
|---|---|---|---|
| R1 | 摘要引擎切换后质量/超时退化 | 高 | 变更 A 完成后跑 context-compressor 与群聊摘要测试；保留 `summaryRunner` 注入接口便于回退 |
| R2 | `packages/desktop` 的 `verify-packaged-webui.mjs:5-61,140-146` 与 `tests/desktop/packaged-webui.test.ts` 硬依赖 `dist/ekko-skills`，不同步改会导致 desktop 打包在 afterPack 阶段**直接失败** | 高 | 纳入 L4，与 `scripts/build-server.mjs:59-65` 的删除同步提交 |
| R3 | 历史 DB 数据含 `'ekko'` 值 | 中 | 读侧容错（§5），不做强制清理 |
| R4 | MCU 会话 id 语义变化可能影响已配对设备 | 中 | 变更 B 后手工验证一次 MCU 语音链路；设备端若依赖 `'ekko'` 命名需另行处理 |
| R5 | 大规模删除引入的隐性遗漏（5128 处匹配 / 303 个文件） | 高 | 依赖 TS 编译器驱动收敛 + 终态 `grep -ri ekko` 必须只剩白名单（`.github/ISSUE_TEMPLATE` 历史链接可保留） |
| R6 | `bootstrap/authorized-provider-adapter.ts` 仅被 `bootstrap/ekko.ts` 导入，但底层 `authorized-provider-credentials` 位于 hermes 模块 | 中 | 删除前确认无 Hermes/Coding 路径依赖 `configureAuthorizedProviderRuntime`；若有则改挂到其他 bootstrap 入口 |
| R7 | 上游云服务断开后，若未来想要远程访问/更新检查，需自建替代 | 低 | 纯自用场景可接受；`HERMES_REMOTE_RELAY_URL` 等环境变量仍可手动指向自建服务 |

### 未决（实施中确认）

- `public/runs/prompt.ts:42-113` 的 `/Users/ekko/Desktop/...` 是示例路径中的**用户名**，与 Agent 无关 → **保留**。
- `tests/server/*` 中约 30 个文件的 ekko 引用需逐个人工判定是"断言 Ekko 行为"（改写）还是"偶然字符串"（保留）。
- 第 12 个 locale 是否存在（实测 `src/i18n/locales/` 只有 11 个：ar/de/en/es/fr/ja/ko/pt/ru/zh-TW/zh）。
