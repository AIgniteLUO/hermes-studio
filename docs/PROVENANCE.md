# Provenance

本仓库是上游项目的精简 fork，**纯自用、非商业**。

- 上游仓库：`EKKOLearnAI/ekko-studio`（原名 `EKKOLearnAI/hermes-studio`，GitHub 重定向）
- 上游标签：`v0.7.15`
- 上游 commit：`11dc1deff9c7b23f5867fed602fc8e41d8a716f5`
- Fork 基线版本：`1.0.0`
- Fork 日期：2026-10-14

## 改动摘要

- 物理移除 Ekko Agent 一族能力（`packages/ekko-agent`、`modules/ekko`、`client/*/ekko` 等）
- 断开上游云服务（App Relay 中继、App Entitlement、版本清单、桌面更新 feed）
- 删除已提交的 ESP32 预编译固件（其中包含指向原作者服务器的 phone-home URL），并把
  `packages/esp32-c3/release/` 加入 `.gitignore`。原因：`scripts/build-server.mjs` 会把
  本地 `pio run` 产物写回该目录，而 `.gitignore` 此前只忽略 `.pio/`，一次常规
  `git add -A` 就会把新编译的二进制重新提交进来。发布流程不再打包固件，需要固件时先
  `pio run -d packages/esp32-c3/v1`（或 `v2`）再 `npm run build`，构建会自动拾取
  `.pio` 产物；找不到固件时构建只会打印 warning 并跳过，不会失败
- 替换 Ekko 品牌标识与域名
- server 服务层与 sockets 收敛：清除 bootstrap / sockets / services / controllers / repositories 中的
  Ekko 分支，`npx tsc --noEmit -p packages/server/tsconfig.json` 由 53 个报错收敛到 exit 0
- 删除 Ekko 授权 provider 装配层（Task 4 Step 2 的决策点）：同时删除
  `packages/server/src/bootstrap/authorized-provider-adapter.ts` 与
  `packages/server/src/modules/studio/public/authorized-provider-runtime.ts`。
  **判据**：`configureAuthorizedProviderRuntime` / `authorized-provider-runtime` 在全仓库的引用只剩
  adapter 自身与桥接模块自身——adapter 此前仅由已删除的 `bootstrap/ekko.ts` 以副作用方式 import
  （`import './authorized-provider-adapter'`），无其他消费者；Hermes 侧
  （`modules/hermes/controllers/{anthropic,codex,minimax,nous,xai}-auth.ts`、
  `modules/hermes/services/providers/model-catalog-cache.ts`）与 Coding Agents 直接引用
  `modules/hermes/services/providers/authorized-provider-credentials`，不经该桥接层。故按
  「无 Hermes / Coding Agents 依赖 → 连同桥接模块一起删除」分支处理，未保留 adapter。
- 历史数据读侧容错：`gc_room_agents` / `gc_agent_presets` 的 `agent` 列为自由 TEXT 且无 migration，
  历史行可能仍是已删除的取值（如 `ekko`）。读侧统一经
  `modules/studio/services/group-chat/agent-clients.ts` 的 `normalizeStoredGroupAgent()` 归一到
  `hermes`，**不写回数据库**；客户端入参校验路径（`controllers/group-chat.ts` 的
  `GROUP_AGENT_TYPES`、`agent-availability.ts` 的 `resolveAgentStatusId`）仍然拒绝该取值。

## 基线状态（2026-10-14）

实测位置：`/Users/aigniteluo/Workspace/FullStackProjects/hermes-studio`（本仓库真实路径，
**不是** `/tmp/ekko-0715` —— 运行位置会改变结果，见下）。

| 命令 | 结果 |
| :--- | :--- |
| `npm ci --ignore-scripts && npm rebuild node-pty` | exit 0 |
| `npm run build` | exit 0 |
| `npx vitest run` | **exit 0**，见下 |

全量测试连跑 4 次：1 次 **exit 0 全绿**，3 次仅有超时抖动。全绿那次：

```
 Test Files  578 passed | 2 skipped (580)
      Tests  4761 passed | 6 skipped (4767)
```

问题不大：另外 3 次的失败**全部**是 `Error: Test timed out in 5000ms.`（vitest 默认
`testTimeout`，配置未上调），且只出现在以下 3 个会拉起真实 CLI 子进程的文件，随机器负载
波动（每次 1~3 个）：

- `tests/server/hermes-cli-discovery.test.ts`
- `tests/server/hermes-cli-selection-live.test.ts`
- `tests/server/hermes-runtime-selection.test.ts`

**后续回归判据**：失败数为 0，或失败数 ≤ 3 且**全部**是上述 3 个文件的 5000ms 超时 →
视为无回归；其余任何失败均按新增回归处理。

### 关于任务书预期的 13 个失败（未复现）

任务书 Step 7 预期 `tests/server/studio-mcp-autoinject.test.ts` 有 13 个失败
（`listProfileNamesFromDiskMock` 未生效，`targets` 返回 `[]`）。**该现象在本仓库路径下无法复现**：
该文件 18 个用例单独跑与全量跑**全部通过**。

真实原因不是 mock 失效，而是**运行目录**：

1. 该用例用 `mkdtempSync(join(process.cwd(), '.studio-mcp-autoinject-test-'))` 造 launcher fixture，
   并把路径塞进 `HERMES_WEB_UI_MCP_BIN`。
2. `shouldSkipTransientAutoinject()` 会调用 `isTransientPath(bundledScript)`，其判定集合为
   `[tmpdir(), '/tmp', '/private/tmp']`，且**先对候选路径做 `realpathSync`**（macOS 上 `/tmp`
   → `/private/tmp`）。
3. 若 vitest 的 cwd 在 `/tmp` 下（例如任务书 Step 2 里 `cd /tmp/ekko-0715`），fixture 的实际路径
   就落在 `/private/tmp` 内 → `isTransientPath` 为 true → 提前 return，`targets` 停在 `[]`
   → 13 条断言全挂。
4. 在本仓库真实路径下 fixture 不属于 transient，用例全绿。

**结论：不是上游 bug，无需修复**（未改动任何上游测试与源码）。在 `/tmp` 下跑测试会得到假红，
基线必须以本仓库路径为准。

### 其他

`npm run build` 会重新生成 `docs/openapi.json`，其中 `info.version` 取自 `package.json`；
版本号改为 `1.0.0` 后该文件随之从 `0.7.15` 更新为 `1.0.0`（已随本次提交）。

## 终态验收（2026-10-15）

### 三层检查与全量构建

| 命令 | 结果 |
| :--- | :--- |
| `npx vite build` | exit 0 |
| `npx tsc --noEmit -p packages/server/tsconfig.json` | exit 0 |
| `npm run build`（openapi → `vue-tsc -b` → vite build → server tsc → build-server.mjs） | exit 0 |
| `npm run harness:check` | exit 0 |
| `npm run verify:sharp-runtime` | exit 0（`verified Sharp 0.35.3 with libvips 8.18.3`） |
| `npx vitest run` | 见下 |

`npm run build` 在本地没有 ESP32 固件时只打印
`ESP32-C3 v1/v2 firmware not found, skipped dist/mcu/.../firmware.bin` 警告并继续，
不影响 exit code。

### 全量测试

```
 Test Files  542 passed | 2 skipped (544)
      Tests  4394 passed | 6 skipped (4400)
```

exit 0，全绿。相对基线（`578 passed | 2 skipped` / `4761 passed | 6 skipped (4767)`）
少 36 个测试文件 / 367 个测试，减少部分全部是随 Ekko Agent 一族一起删除的专测
（`tests/client/ekko-*`、`modules/ekko` 专测等），以及 2 个断言已删除机制（运行时侧
澄清等待器 / 中断时 `cancelClarify`）的用例。

> **关于一次非全绿运行（Task 13 review 指出）**：本文件早前在同一节记录过
> `1 failed | 4393 passed | 6 skipped (4400)`，唯一失败是
> `tests/server/hermes-cli-selection-live.test.ts` 的 `Error: Test timed out in 5000ms.`
> ——即上文基线已列明的 CLI 子进程超时抖动（该文件单独运行 1.5s 内通过）。Task 14 复跑
> 两次：第一次同样命中该抖动（同一文件、同一 5000ms 超时），第二次 **exit 0 全绿**
> （上表数字）。按基线回归判据（失败数为 0，或 ≤3 且**全部**是白名单 3 个文件的
> 5000ms 超时）两次运行均判定无回归；上表记录的是全绿那次。

### Ekko 残留扫描（`grep -rai "ekko"`，**必须带 `-a`**）

| | 基线（Task 2 记录） | Task 13 终态 | Task 14 终态 |
| :--- | :--- | :--- | :--- |
| 命中文件 | 303 | 37 | 28 |
| 命中行 | 5128 | 488 | 369 |

扫描范围为仓库根目录（本机 shell 的 `grep` 是 ugrep 包装，遵守 `.gitignore`，
不进入 `node_modules/`、`dist/`、`.pio/` 等忽略目录）。终态数字包含本文件自身命中的
行；单独扫描 `dist/` 的命中全部是白名单源文件的构建副本（6 个 `SKILL.md` 与
`prompt.ts` 的 macOS 用户名示例）。

Task 14 完成后的 28 个命中文件 = 17 个测试文件 + 6 个 `SKILL.md` + `prompt.ts` +
`LICENSE` + 本文件 + `docs/superpowers/{specs,plans}/` 两份，全部属于白名单：

- **本 fork 记录 / 署名 / 许可证**：`LICENSE`（Licensor）、`docs/PROVENANCE.md`、
  `docs/superpowers/{specs,plans}/`、`packages/skills/{apikey-image-gen,grok-image-to-video,hyperframes,markdown-viewer,minimax-image-to-video,remotion}/SKILL.md`
  的 `author: Ekko`（真实作者署名，Ruling #11 明确保留）
- **偶然字符串**：`packages/server/src/modules/studio/public/runs/prompt.ts` 的
  `/Users/ekko/Desktop/...`（示例 Markdown 里的 macOS 用户名）、`tests/client/markdown-rendering.test.ts`
  的同名用户名用例
- **删除行为的守护断言**：断言已删除运行时被拒绝/回退/写不进固件（`agent-availability`、
  `agent-status-availability`、`studio-agent-contracts`、`workflow-manager`、
  `workflow-import-capabilities`、`mcu-firmware-source`、`mcu-login-controller`、`client-agent-display-names`）
- **历史数据迁移用例的输入值**：`gc_room_agents` / `gc_agent_presets` / 会话行可能仍存有该取值，
  用例以它为**输入**断言归一为 `hermes` 或回退到 Hermes 头像（`group-chat-history-window`、
  `group-chat-routes-baseline`、`chat-webhooks`、`session-push`、`run-chat-abort-goal`、
  `chat-agent-avatar`、`message-list-scroll-position`、`session-list-item`）

`README.md`、`README_zh.md`、`ARCHITECTURE.md`、`AGENTS.md`、`docs/planning/*.md`
已由 Task 14 重写完毕，不再有命中。

### 上游云服务

已全部断开（Task 11），静态扫描（含 `dist/` 构建产物）确认无任何上游云服务地址：

- 版本清单改指 `https://api.github.com/repos/AIgniteLUO/hermes-studio/releases`，
  备用清单常量整行删除；App Relay / App Entitlement / 桌面更新 feed 的上游地址
  一并删除或改指自有仓库
- `grep -rai "ekkolearnai\|ekkoye8888\|hermes-studio\.ai"` 与 `grep -rl "EKKOLearnAI"`
  的命中**只剩** `LICENSE`、`docs/PROVENANCE.md` 与 `docs/superpowers/{specs,plans}/`

### `authorized-provider-adapter` 处置

结论已记于上文「改动摘要」（Task 4 Step 2 的决策点）：**未保留 adapter**，
`packages/server/src/bootstrap/authorized-provider-adapter.ts` 与
`packages/server/src/modules/studio/public/authorized-provider-runtime.ts` 已连同
`bootstrap/ekko.ts` 一起删除。全仓库引用只剩 adapter 自身与桥接模块自身——Hermes 侧
（`modules/hermes/controllers/*-auth.ts`、`model-catalog-cache.ts`）与 Coding Agents
直接引用 `modules/hermes/services/providers/authorized-provider-credentials`，不经桥接层。

## 许可证

上游采用 **Business Source License 1.1**（BSL 1.1）。Additional Use Grant 允许个人、
教育、研究等非商业用途；商用需单独授权；Change Date 2029-05-10 后转 Apache 2.0。

本 fork 为个人非商业使用，落在许可范围内。`LICENSE` 文件保持原样，**未修改**
Licensor 署名与许可条款。

## 上游跟踪

**不跟踪**。本 fork 无 rebase / cherry-pick 上游的计划。
