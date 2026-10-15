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
  `git add -A` 就会把新编译的二进制重新提交进来。
  **（历史记录）** 当时需要固件时先 `pio run -d packages/esp32-c3/v1`
  （或 `v2`）再 `npm run build`，构建会自动拾取 `.pio` 产物；找不到固件时构建只打印 warning
  并跳过，不会失败。以上仅记录当时状态——该链路已于 2026-10-15 随 ESP32 固件工程整体删除
  （见下文「移除硬件固件与 Global Agent」），`packages/esp32-c3/`、`package.json` 的 `mcu:*`
  脚本与 `.gitignore` 的 `packages/esp32-c3/release/` 条目如今都不存在
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

**（历史记录）** 当时的 `npm run build` 在本地没有 ESP32 固件时只打印
`ESP32-C3 v1/v2 firmware not found, skipped dist/mcu/.../firmware.bin` 警告并继续，
不影响 exit code。该固件兜底逻辑已随 ESP32 固件工程一并删除（见下文「移除硬件固件与
Global Agent」），**当前构建中不存在这段代码，也不会再打印该字符串**。

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

## 移除硬件固件与 Global Agent（2026-10-15）

移除三块内容：**（1）ESP32 固件工程**（`esp32/` 工程、`assets/mcu-prompts/*.pcm` 提示音、
`services/voice/mcu/adpcm.ts` 编解码）、**（2）Global Agent**（`public/global-agent.ts`、
`sockets/global-agent.ts`、`services/global-agent/**`、全部 `/api/studio/mcu/*` 与
`/api/auth/mcu-login` 路由、`mcu_devices` 表）、**（3）实例间远程中继**
（`services/global-agent/outbound-relay-client.ts`）。分句器
（`mcu-speech-segmenter.ts`）在删除前已迁出为共享模块，网页语音对话
（实时语音对话台）不受影响。`app-relay`（手机 App 连接）是独立能力，**未动**。

### 实测数字

| 项 | 改动前 | 改动后 |
| --- | --- | --- |
| 测试文件 | 20 failed / 522 passed / 2 skipped（544） | 0 failed / 533 passed / 2 skipped（535） |
| 测试用例 | 31 failed / 4300 passed / 6 skipped（4337） | 0 failed / 4312 passed / 6 skipped（4318） |
| 删除测试文件 | — | 9 个 / 3759 行（7 个 `mcu-*` 共 720 行，`global-agent-server.test.ts` 1889 行，`outbound-relay-client.test.ts` 1150 行） |

改动前的 31 个失败中，2 个是 `tests/server/hermes-cli-discovery.test.ts` 与
`tests/server/hermes-cli-selection-live.test.ts` 的 `Error: Test timed out in 5000ms.`
（既有环境性超时，非本次回归），其余 29 个是悬空 import / 悬空断言。

改动后共跑三次：

- 第一次 **exit 0 全绿**（上表数字）。
- 第二、三次各 `1 failed | 4311 passed | 6 skipped`，唯一失败都是
  `tests/server/hermes-cli-selection-live.test.ts` 的 `Error: Test timed out in 5000ms.`
  ——正是上文基线已列明的同款 CLI 子进程超时抖动（同一文件、同一 5000ms）。
  该文件单独跑 3/3 全部通过，且自上游快照导入后未被修改过。

按基线回归判据（失败数为 0，或 ≤3 且**全部**是白名单 3 个文件的 5000ms 超时），
三次运行均判定**无回归**；上表记录的是全绿那次。

### 终态残留扫描

任务书给定的模式是

```
grep -rai "mcu\|esp32\|global-agent\|globalAgent\|global_agent" .
```

**该模式不能直接照抄**，两个方向都会出错：

- 它会**多报**——`-i` 之下的裸 `mcu` 会命中 `cloneFromCurrent`、
  `createAgentPresetFromCurrent` 里的 `mCu` 子串（4 处已知假阳性），
  `package-lock.json` 的 integrity 哈希同理；需要左侧边界断言压掉。
- 它更会**漏报**——`global-agent|globalAgent|global_agent` 三个分支里没有以空格分隔的
  变体，`Global Agent` 这类写法匹配不到；而若把 `mcu` 收窄成 `\bmcu[A-Z]`（要求 `mcu` 后
  跟大写字母），`mcu-voice`、`mcu/audio` 这类连字符 / 斜杠路径又会被漏掉。若照抄该模式并以
  「只剩白名单」收工，会漏掉真实残留。

可复现的等价写法是

```
grep -rn -a -i -E "(^|[^A-Za-z0-9_])mcu|esp32|global[-_ ]?agent" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist .
```

即：`-i` 覆盖 `MCU` / `Global Agent` 等大小写变体；`global[-_ ]?agent` 同时覆盖连字符、
下划线与空格三种分隔符；`mcu` 后不限定字符（否则 `mcu-voice` 之类的路径会漏）；左侧用
`(^|[^A-Za-z0-9_])` 排除 `mCu` 类假阳性。

因此本次改用**逐字节遍历 + JS 正则**的等价扫描：`(?<![A-Za-z0-9_])mcu` 前瞻断言
取代 `\b`，二进制文件按 `-a` 语义一并纳入（共扫描 1585 个文件，其中 38 个含 NUL 字节）。
`-a` 不可省：macOS/BSD 的 `grep -r` 默认跳过二进制文件，v1.0.0 时期正是因此漏掉了
一个内含 phone-home URL 的预编译固件。该等价扫描当场查出两处照抄模式**查不到**的
真实残留（`stt-transcribe-controller.test.ts` 的悬空 `vi.doUnmock(.../public/mcu-voice)`、
`docs/planning/tool-boundary-queue-insertion.md` 仍在描述 Global Agent 对话面），
两处均已修复。

**注意：残留扫描可以被「改名」满足，干净不等于不存在。** 本次扫描干净的一部分原因，是同一
提交里做了重命名与注释改写，而不是证明了字符串确实不存在——`packages/client/src/api/studio/chat.ts:559`
把 `globalAgentEventHandler` 改名为 `globalSocketAgentEventHandler`（该文件中 `global-` 前缀在
别处表示「模块级 handler」，新名字反而更容易误读），`packages/client/src/api/studio/speech-segmenter.ts:1-3`
的头部注释也删去了指明其来源 `mcu-interaction.ts` 的半句。真实 provenance 至此只保留在 git
历史里，因此残留扫描不能单独作为「已删除实现不存在」的证据，判据必须回到契约与代码路径本身。

**实测命中 148 行**（`mcu` 模式 33 行、`global-agent` 模式 115 行、`esp32` **0 行**），
全部为**保留契约**、**同名巧合**或**二进制误报**，无一处指向已删除的实现：

| 类别 | 行数 | 说明 |
| --- | ---: | --- |
| `packages/server/src` 保留契约 | 40 | 见下 |
| `tests/` 保留契约与残留断言 | 88 | 见下 |
| `scripts/` + `bin/` openapi/MCP schema | 6 | `global_agent` 作为已接受取值的 enum 与描述 |
| `docs/` | 5 | `openapi.json` 4 行 + `server-module-boundaries.md` 1 行 |
| 二进制资材误报 | 4 | 见下 |
| `packages/desktop/package-lock.json` | 3 | 见下 |
| 本地未跟踪数据库 | 2 | 见下 |

**服务端 40 行** = 38 行命中 `global[-_ ]?agent` + 2 行 `audio-convert.ts` 错误文案
（后者已改写，见下）。

那 38 行里 **36 行含引号 `'global_agent'`**（共 41 处，部分行含多处）、1 行含引号
`'global-agent'`（`contracts/runs/surface.ts` 的 `RUN_SURFACES`）、1 行是
`controllers/sessions.ts:1412` 的 `'Global agent sessions cannot be archived'` 错误串。
全部是**契约字面量**：类型联合成员
（`contracts/runs/session.ts`、`sockets/chat-run.ts`、`coding-agents/services/*`）、
`sessions.ts` 的 DB 读取过滤、`sockets/chat-run.ts` 与 `services/webhooks` 的
**外部输入接受集**、以及 `RUN_SURFACES`（`contracts/runs/surface.ts`）的
`'global-agent'` 成员。控制器裁定**保留**：它们能编译，服务的是存量数据与已发布
客户端的输入契约。判据是**契约**，不是"DB 里已存有 Global Agent 会话行"——
规范记录归属方从未产生过 Global Agent 数据（本次实测两个本地库的 `mcu_devices`
表均为 **0 行**），若以"存量数据"为由保留，后续读者会误以为这批成员可以删除。

另含 `services/voice/stt/audio-convert.ts:188,200` 两行——仅在**错误文案**中出现
`MCU PCM`；该服务本身存活，原做法是按同一字面量逐字保留。

> **同日后续修复（整支 review 的 Fix 4）**：这两处文案**用户可见**——经
> `local-model-manager.ts` → `controllers/stt.ts` 以 502 `{ error }` 返回给客户端，
> 因此已改写为 device PCM 措辞（该 PCM 由设备上传的音频解码而来），不再含 `MCU`；
> `tests/server/audio-convert.test.ts` 的三处引用（用例标题与断言）同步更新。
> 按同一等价扫描复核：`packages/server/src` 由 40 降为 **38**、`tests/` 由 88 降为
> **85**，其余类别不变，合计 148 → **143**。上表与下文分述记录的都是改动前的当日实测值。

**测试 88 行**分三类：
1. `'global_agent'` 作为**存量数据输入**驱动幸存的回退逻辑：
   `session-list-item.test.ts:188,210`（Hermes 头像 / 空态回退）、
   `message-list-scroll-position.test.ts:166,174`（同样的头像回退）、
   `global-pending-actions.test.ts:113,477`（历史会话通知跳转）。
   这些是**合法的历史数据守卫**，不是残留，删掉会真实减少覆盖面。
2. `'global_agent'` 作为**契约取值**的断言：`sessions-controller`、
   `chat-run-bridge-readiness`、`chat-run-api-controller`、`session-store-search`、
   `run-chat-bridge-resume`、`run-chat-queued-item`、`run-chat-bridge-final-context`、
   `handle-coding-agent-run`、`studio-agent-contracts`、`api-docs-controller`。
3. **防回归断言与白名单文案**：`legacy-app-api.test.ts` 断言 MCU 别名不再被重写、
   `hermes-schemas.test.ts` 断言 `mcu_devices` 表不再创建、
   `stt-settings-controller` / `tts-synthesize-controller` 断言受保护路由表内不含
   `/mcu/` 路径、`doubao-stt-provider.test.ts` 的夹具文件名（`'mcu-wav'`、
   `queue_id: 'mcu-test-run'`）、`app-relay-*` 的用例标题（"independent of the MCU relay"）；
   `audio-convert.test.ts` 的用例标题/断言原属此类，已随上文「同日后续修复」改写、不再命中。

**二进制误报 4 行**——`icon.icns:184,523`、`icon.png:560`、
`fonts/ZenMaruGothic-Bold.ttf:39775`。`strings -n 4` 过滤后三者**可打印字符串中的
MCU 命中均为 0**，是原始字节恰好拼出 `mcu`/`McU`；三者自上游快照导入
（`33559e7`）后未改动。

**`packages/desktop/package-lock.json` 3 行**——第三方 npm 包 `global-agent@3.0.0`
（`app-builder-lib` → `@electron/get` 的 dev/optional 传递依赖，提供 HTTP 代理支持），
与本次移除的功能**同名但无关**。

**本地未跟踪数据库 2 行**——`packages/server/data/hermes-web-ui.db` 与
`packages/server/data/test-runtime/hermes-web-ui.db`（`.gitignore:24` 已忽略）中仍有
历史运行留下的 `mcu_devices` 表定义，**均 0 行**。属本地开发产物，不在交付物内，
未删除（避免破坏本地数据）。

### 冒烟结论

生产构建（`dist/server/index.js`，隔离 `HERMES_WEB_UI_HOME`）实测：首页 200、
`/health` 200、`admin/123456` 登录 200、`GET /api/studio/sessions` 200、
`GET /api/studio/stt/profile-status/missing-audio` 返回 **200 `{"url": null}`**
（新的契约形态，不再 302 跳转到已删除的提示音）、`GET /api/devices/link-info` 与
`/api/devices/peer-connections` 200；`/api/studio/mcu/*` 与 `/api/hermes/mcu/*`
全部 404；Socket.IO `/global-agent` 命名空间返回 `Invalid namespace`，`/chat-run`
返回 `Authentication failed`（命名空间存在）。`lsof -a -p <pid> -i` 显示该进程**只有**
`TCP *:8648 (LISTEN)` 与两个 UDP 套接字（LAN 发现广播），**无任何出站 TCP 连接**。

**未做的检查（如实记录）**：无 GUI 环境，**未做浏览器验证**。因此以下依赖真实
麦克风 / 浏览器 / 手机的能力**未获确认**：输入框麦克风输入、实时语音对话台、
消息与群聊朗读、语音设置页、手机 App 连接、局域网设备发现。
