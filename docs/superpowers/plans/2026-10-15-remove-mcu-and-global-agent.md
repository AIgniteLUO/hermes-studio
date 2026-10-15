# 移除硬件固件与 Global Agent（Path B）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 `hermes-studio` v1.0.0 移除 MCU/ESP32 硬件固件、Global Agent 命名空间与实例间远程中继，保留语音、手机 App 连接与局域网发现。

**Architecture:** 先把被 MCU 文件名"伪装"的共享分句器搬出（唯一陷阱，顺序不可调换），再整文件删除服务端三块（固件工程 / `sockets/global-agent.ts` / `services/global-agent/`）并解耦 bootstrap，然后收敛服务端局部引用、客户端类型塌缩、i18n 与构建链路，最后测试收敛与终态验证。

**Tech Stack:** TypeScript 5 / Vue 3 (`<script setup>`) / Pinia / Vite / Koa / Socket.IO / SQLite (better-sqlite3) / Vitest / PlatformIO（仅被删除的固件工程使用）

**Spec:** `docs/superpowers/specs/2026-10-15-remove-mcu-and-global-agent-design.md`

## Global Constraints

- **目标仓库**：`/Users/aigniteluo/Workspace/FullStackProjects/hermes-studio`，分支 `main`，起点 `v1.0.0`
- **不得修改** `LICENSE`、`packages/skills/*/SKILL.md`（`author: Ekko` 是真实作者署名）、`docs/PROVENANCE.md`、`docs/superpowers/**`
- **不得移除**：`services/app-relay/`（手机 App，零耦合）、`services/network/lan-discovery.ts`（局域网发现）、STT/TTS 的非 MCU 路由（30 条里只有 2 条是 MCU 专属）、`services/voice/stt/audio-convert.ts`
- **grep 假阳性，勿动**：`controllers/media.ts:151,172` 的 `apiKeyFro`**`mCu`**`stomProvider`；`MessageItem.vue:245,1298` 的 `forkFro`**`mCu`**`rrentTail`；`GroupChatPanel.vue:1395,2907` 的 `createAgentPresetFro`**`mCu`**`rrent`；`ProfileCreateModal.vue:97` 与 `zh.ts:2049` 的 `cloneFro`**`mCu`**`rrent`
- **不得用 `as any` / `@ts-expect-error` / 非空断言**掩盖类型错误
- **不得弱化测试**：断言已删能力的测试可整删（主体已消失），断言幸存能力的必须改写而非删除，不得放松为 `expect.anything()`
- **禁止运行任何全局格式化工具**（`prettier` / `eslint --fix` / `npm run batch:prettier`）
- **提交信息**：中文，格式 `<emoji> <type>(scope): summary`，emoji 遵循 gitmoji.dev
- **测试必须在仓库根目录运行**，禁止 `cd /tmp`（会让 `studio-mcp-autoinject.test.ts` 产生 13 个假红）
- **client 侧的真正闸门是 `npx vite build`**，不是 `npx vue-tsc -b --noEmit` —— `vite/client` 的 `declare module '*.vue'` 通配声明让任何 `.vue` 路径都能通过类型检查，包括已删除的文件
- **基线（v1.0.0 实测）**：`npx vitest run` exit 0，`4396 passed | 6 skipped (4402)`，零失败
- **回归判据**：失败数 0，或 ≤3 且全部是 `Error: Test timed out in 5000ms.` 且仅出现在 `tests/server/hermes-cli-discovery.test.ts`、`hermes-cli-selection-live.test.ts`、`hermes-runtime-selection.test.ts`
- **不在代码中加 `DROP TABLE mcu_devices`** —— 删除建表代码即不再创建，旧库残留空表由 Boss 手工处理

---

## Task 1: 搬迁共享分句器（陷阱，必须最先做）

`packages/client/src/api/studio/mcu-interaction.ts` 文件名带 `mcu`，但其分句器正在为网页端「实时语音对话台」供能。**先搬迁，否则后续删除会让网页语音对话失效。**

**利好**：要搬的三段**不依赖该文件的任何 import**（`startRunViaSocket` / `transcribeSpeech` / `StoredSttProvider` / `synthesizeSpeech` 全是 `startMcuVoiceInteraction` 的依赖），故搬迁自包含。

**Files:**
- Create: `packages/client/src/api/studio/speech-segmenter.ts`
- Modify: `packages/client/src/components/hermes/chat/RealtimeVoiceStage.vue:4,135`
- Create: `tests/client/speech-segmenter.test.ts`
- Modify: `tests/client/mcu-interaction.test.ts`（拆分，见 Step 5）

**Interfaces:**
- Consumes: 无
- Produces: 新模块 `@/api/studio/speech-segmenter` 导出
  ```ts
  export interface SpeechSegmenter {
    pushDelta: (delta: string) => string[]
    flush: () => string | null
    reset: () => void
  }
  export interface SpeechSegmenterOptions {
    maxChars?: number
    emitOnSentenceEnd?: boolean
  }
  export function createSpeechSegmenter(options?: SpeechSegmenterOptions): SpeechSegmenter
  export function normalizeSpeechText(text: string): string
  ```
  **注意命名**：去掉 `Mcu` 前缀 —— `McuSpeechSegmenter` → `SpeechSegmenter`，`McuSpeechSegmenterOptions` → `SpeechSegmenterOptions`，`createMcuSpeechSegmenter` → `createSpeechSegmenter`。后续任务按此名引用。

- [ ] **Step 1: 创建新模块并逐字搬迁实现**

从 `packages/client/src/api/studio/mcu-interaction.ts` **逐字复制**以下三段到新文件 `packages/client/src/api/studio/speech-segmenter.ts`：

| 源行号 | 内容 |
|---|---|
| `:86-98` | 13 个正则常量（`PARAGRAPH_END_RE`、`HIDDEN_REASONING_BLOCK_RE`、`UNCLOSED_HIDDEN_REASONING_BLOCK_RE`、`FENCED_CODE_BLOCK_RE`、`UNCLOSED_FENCED_CODE_BLOCK_RE`、`INLINE_CODE_RE`、`HTML_COMMENT_RE`、`HTML_DECLARATION_RE`、`HTML_TAG_RE`、`KEYCAP_EMOJI_RE`、`EMOJI_RE`、`SYMBOL_RE`、`CONTROL_RE`） |
| `:112-171` | 5 个函数：`isMarkdownTableLine`、`normalizeSpeechText`、`paragraphEndsNormally`、`sentenceBoundary`、`findReadyParagraphBoundary` |
| `:48-57` | 两个 interface（**改名**：`McuSpeechSegmenter` → `SpeechSegmenter`，`McuSpeechSegmenterOptions` → `SpeechSegmenterOptions`） |
| `:250-289` | 工厂函数（**改名**：`createMcuSpeechSegmenter` → `createSpeechSegmenter`，参数类型同步改名） |

**要求**：
- **不要新增 import** —— 这三段无外部依赖
- **不要改动任何实现逻辑**，只改 4 个符号名（两个 interface + 工厂函数 + 工厂函数的参数类型注解）
- `normalizeSpeechText` 由 `function` 改为 **`export function`**（新测试要直接测它）
- 其余 4 个辅助函数保持模块私有（不 export）

文件头部加一行说明：

```ts
// 流式文本分句器：把 LLM 的增量输出切成适合 TTS 朗读的句段，
// 并剥离 Markdown、代码块、HTML、emoji 等不适合朗读的内容。
// 供网页端实时语音对话台使用（原先位于 mcu-interaction.ts，随硬件能力移除而迁出）。
```

- [ ] **Step 2: 写新模块的测试**

创建 `tests/client/speech-segmenter.test.ts`。**先从 `tests/client/mcu-interaction.test.ts` 把现有的 `createMcuSpeechSegmenter` 用例逐字搬过来**（改导入与符号名），再补两条锚定「不适合朗读内容被剥离」的用例：

```ts
import { describe, expect, it } from 'vitest'
import { createSpeechSegmenter, normalizeSpeechText } from '@/api/studio/speech-segmenter'

describe('speech segmenter', () => {
  // …此处放从 mcu-interaction.test.ts 搬来的既有用例（改名后）…

  it('剥离代码块与 HTML 标签后再朗读', () => {
    expect(normalizeSpeechText('看这个 `foo()` 和 <b>加粗</b>')).toBe('看这个 和 加粗')
  })

  it('句末标点触发分段', () => {
    const seg = createSpeechSegmenter({ emitOnSentenceEnd: true })
    expect(seg.pushDelta('第一句。')).toEqual(['第一句。'])
  })
})
```

> 若搬来的既有用例与上面两条重复，保留既有的、删掉重复的新增条 —— **不要为了凑数留重复断言**。两条新增用例的期望值**必须用实际运行结果校准**（`normalizeSpeechText` 的空格合并行为以实现为准），不要照抄本计划的字面值就提交。

- [ ] **Step 3: 跑新测试确认通过**

```bash
npx vitest run tests/client/speech-segmenter.test.ts
```

预期：PASS。若 `normalizeSpeechText` 的实际输出与断言不符，**改断言去匹配实现**（这是搬迁，不是改行为）。

- [ ] **Step 4: 改消费方**

`packages/client/src/components/hermes/chat/RealtimeVoiceStage.vue`：
- `:4` `import { createMcuSpeechSegmenter } from '@/api/studio/mcu-interaction'` → `import { createSpeechSegmenter } from '@/api/studio/speech-segmenter'`
- `:135` `createMcuSpeechSegmenter({ emitOnSentenceEnd: true })` → `createSpeechSegmenter({ emitOnSentenceEnd: true })`

确认无其他消费方：

```bash
grep -rn "createMcuSpeechSegmenter" packages/client/src tests/
```

预期：只剩 `mcu-interaction.ts`（原文件，Task 4 删除）与 `tests/client/mcu-interaction.test.ts`（下一步处理）。

- [ ] **Step 5: 从旧测试里移除已搬迁的用例**

`tests/client/mcu-interaction.test.ts`：删除已搬到新文件的 `createMcuSpeechSegmenter` 用例（避免重复覆盖），**保留** `mcuEventsFromRunEvent`（`:76,95`）与 `startMcuVoiceInteraction`（`:128`）的用例 —— 它们随 Task 4 删除原文件时一并删除。

- [ ] **Step 6: 过闸门**

```bash
npx vite build
npx vitest run tests/client/speech-segmenter.test.ts tests/client/mcu-interaction.test.ts
```

预期：`vite build` exit 0 且无 `UNLOADABLE_DEPENDENCY`；两个测试文件均 PASS。

- [ ] **Step 7: 提交**

```bash
git add packages/client/src/api/studio/speech-segmenter.ts \
        packages/client/src/components/hermes/chat/RealtimeVoiceStage.vue \
        tests/client/speech-segmenter.test.ts tests/client/mcu-interaction.test.ts
git commit -m "♻️ refactor(client): 分句器迁出 mcu-interaction 为独立共享模块"
```

---

## Task 2: 整文件删除服务端三块并解耦 bootstrap

**Files:**
- Delete: `packages/esp32-c3/`（10 文件，v1/v2 各 6645/6661 行 C++）
- Delete: `packages/server/src/modules/studio/sockets/global-agent.ts`（2302 行）
- Delete: `packages/server/src/modules/studio/services/global-agent/`（4 文件：`outbound-relay-client.ts` 2298 行、`mcu-agent-runtime.ts` 17、`mcu-speech-segmenter.ts` 148、`mcu-voice-instructions.ts` 8）
- Delete: `packages/server/src/modules/studio/public/global-agent.ts`（13 行）
- Delete: `packages/server/src/modules/studio/public/mcu-voice.ts`（32 行）
- Delete: `packages/server/src/bootstrap/mcu-voice-adapter.ts`（11 行）
- Delete: `packages/server/src/modules/studio/controllers/mcu-devices.ts`（238 行）
- Delete: `packages/server/src/modules/studio/controllers/mcu-firmware.ts`（156 行）
- Delete: `packages/server/src/modules/studio/routes/mcu-devices.ts`（11 行）
- Delete: `packages/server/src/modules/studio/routes/mcu-firmware.ts`（9 行）
- Delete: `packages/server/src/modules/studio/repositories/mcu-devices-store.ts`（124 行）
- Delete: `packages/server/src/modules/studio/services/devices/mcu-devices.ts`（1 行 re-export shim）
- Delete: `packages/server/src/modules/studio/services/voice/mcu/`（`adpcm.ts` 137 行、`prompts.ts` 84 行）
- Delete: `packages/server/src/assets/mcu-prompts/`（5 个 `.pcm`，约 980 KB）
- Modify: `packages/server/src/bootstrap/http.ts:38,590`
- Modify: `packages/server/src/bootstrap/routes.ts:4,26,53,94,132`
- Modify: `packages/server/src/bootstrap/lifecycle.ts`（停机清理 outbound relay 的那一步）

**Interfaces:**
- Consumes: Task 1 搬迁后的分句器（本任务不碰 client）
- Produces: 服务端不再有 `/global-agent` 命名空间、`GlobalAgentServer`、`OutboundRelayClient`、MCU 任何入口

- [ ] **Step 1: 删除目录与文件**

```bash
cd /Users/aigniteluo/Workspace/FullStackProjects/hermes-studio
git rm -r --quiet packages/esp32-c3
git rm -r --quiet packages/server/src/modules/studio/services/global-agent
git rm -r --quiet packages/server/src/modules/studio/services/voice/mcu
git rm -r --quiet packages/server/src/assets/mcu-prompts
git rm --quiet packages/server/src/modules/studio/sockets/global-agent.ts \
  packages/server/src/modules/studio/public/global-agent.ts \
  packages/server/src/modules/studio/public/mcu-voice.ts \
  packages/server/src/bootstrap/mcu-voice-adapter.ts \
  packages/server/src/modules/studio/controllers/mcu-devices.ts \
  packages/server/src/modules/studio/controllers/mcu-firmware.ts \
  packages/server/src/modules/studio/routes/mcu-devices.ts \
  packages/server/src/modules/studio/routes/mcu-firmware.ts \
  packages/server/src/modules/studio/repositories/mcu-devices-store.ts \
  packages/server/src/modules/studio/services/devices/mcu-devices.ts
```

- [ ] **Step 2: 解耦 bootstrap**

`packages/server/src/bootstrap/routes.ts`：删除 5 处 —— `:4` `import './mcu-voice-adapter'`、`:26` `import { mcuDeviceRoutes }`、`:53` `import { mcuFirmwareRoutes }`、`:94` `app.use(mcuDeviceRoutes.routes())`、`:132` `app.use(mcuFirmwareRoutes.routes())`。

`packages/server/src/bootstrap/http.ts`：删除 `:38` `import { startGlobalAgentServer } from '../modules/studio/public/global-agent'` 与 `:590` 的 `startGlobalAgentServer(activeGroupChatServer.getIO(), { localBaseUrl: loopbackBaseUrl })` 调用。

`packages/server/src/bootstrap/lifecycle.ts`：删除 `:6` 的 `import { stopOutboundRelayClient } from '../modules/studio/public/global-agent'` 与 `:162` 的 `await runShutdownStep('Outbound relay clients', () => stopOutboundRelayClient())`。

- [ ] **Step 3: 用编译器找出剩余引用**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 | grep "error TS" | cut -d'(' -f1 | sort | uniq -c | sort -rn
```

把输出当作 Task 3 的工作清单记进报告。**本步骤不修**。

- [ ] **Step 4: 提交（此时 tsc 仍红，属预期中间态）**

```bash
git add -A
git commit -m "🔥 feat(mcu): 删除 ESP32 固件工程、Global Agent 与实例间远程中继"
```

> **本任务有意以 `tsc` 红灯结束** —— 删除整文件后必然留下悬空引用，由 Task 3 修到绿。**不要在本任务里修它们**，也不要跑 `npx vitest run`。

---

## Task 3: 服务端局部收敛至 tsc 全绿

**Files:**
- Modify: `packages/server/src/modules/studio/controllers/stt.ts:25-27,41,96,293-...,353,357,761-961`
- Modify: `packages/server/src/modules/studio/routes/stt.ts:13`
- Modify: `packages/server/src/modules/studio/controllers/tts.ts:8,699-710`
- Modify: `packages/server/src/modules/studio/routes/tts.ts:9`
- Modify: `packages/server/src/modules/studio/controllers/auth.ts:29,401-511`
- Modify: `packages/server/src/modules/studio/routes/auth.ts:10`
- Modify: `packages/server/src/modules/studio/controllers/devices.ts:312`
- Modify: `packages/server/src/modules/studio/infrastructure/database/schemas.ts:541-557,1582-1585`
- Modify: `packages/server/src/modules/studio/middleware/legacy-app-api.ts:7,25`
- Modify: `scripts/server-module-boundaries.mjs:37`

**Interfaces:**
- Consumes: Task 2 的删除结果
- Produces: `npx tsc --noEmit -p packages/server/tsconfig.json` **exit 0**

- [ ] **Step 1: 收敛 STT**

`controllers/stt.ts`：
- `:25-27` 删除三行 import（`emitMcuVoiceEvent`/`startMcuVoiceChatTurn`、`normalizeMcuAgentRuntime`、`MCU_TTS_SAMPLE_RATE`/`mcuPromptText`/`mcuPromptUrl`）
- `:41` 与 `:293` 附近的 `saveMcuSttDebugAudio`（落盘 `debug/mcu-stt`）整段删除
- `:761-961` 的 `mcuVoiceTurn` 控制器整段删除
- `:96` 的 `'browser_stt_not_available_for_mcu'` 改为 `'browser_stt_not_available'`（纯文案）
- `:353,357` 的 `profileStatus` / `missingProfileAudio` 返回 `mcuPromptUrl('missing-stt')` —— 见 Step 2

`routes/stt.ts:13`：删除 `/api/studio/mcu/voice-turn` 路由。**其余 16 条路由全部保留。**

- [ ] **Step 2: 处置 profileStatus / missingProfileAudio（决策点）**

这两个端点（`routes/stt.ts:11-12`，路径 `/api/studio/stt/profile-status*`）返回 MCU 提示音 URL，但路径本身不含 `mcu`。先确认有无客户端调用方：

```bash
grep -rn "profile-status\|profileStatus\|missingProfileAudio" packages/client/src packages/desktop/src
```

- **若无调用方**（预期）→ 两个端点与其路由一并删除。它们的唯一产出是已删除的 `mcu-prompts` 音频。
- **若有调用方** → 保留端点，但把返回值里的 `mcuPromptUrl(...)` 改为 `null`，并确认调用方能处理 `null`。

**把你的判断与证据写进报告。**

- [ ] **Step 3: 收敛 TTS**

`controllers/tts.ts`：`:8` 删除 `isValidMcuAudioFileName`/`resolveMcuAudioPath` 的 import，`:699-710` 删除 `mcuAudio` 控制器。
`routes/tts.ts:9`：删除 `/api/studio/mcu/audio/:file`。**其余 12 条路由全部保留。**

- [ ] **Step 3b: 处置 `mcuPlayback`（⚠️ 情况比预想复杂，按此处理）**

实测结论：**有幸存代码读它，但删除后已无任何调用方会设置它**。

| 位置 | 性质 |
|---|---|
| `services/voice/tts/providers/types.ts:86` | `mcuPlayback?: boolean` 选项定义 |
| `services/voice/tts/providers/doubao.ts:48` | `opts.mcuPlayback ? 'pcm' : DEFAULT_FORMAT` —— **幸存的 provider 在读它** |
| `services/voice/tts/providers/doubao.ts:57` | `if ((raw === undefined \|\| raw === null) && opts.mcuPlayback) return DEFAULT_SAMPLE_RATE` |
| `sockets/global-agent.ts:55`、`services/global-agent/outbound-relay-client.ts:102` | 唯一两个设 `true` 的地方 —— **均已于 Task 2 删除** |

即删除后 `mcuPlayback` 永远是 `undefined`，两个分支恒走 else。**处置：删除该选项并把两处分支收敛到非 MCU 路径**：

- `types.ts:86` 删除 `mcuPlayback?: boolean`
- `doubao.ts:48` 改为 `const format = trimOptional(opts.format)?.toLowerCase().replace('-', '_') || DEFAULT_FORMAT`
- `doubao.ts:57` 删除该条件分支（保留其余 sample-rate 逻辑）

**同步改测试**：`tests/server/doubao-tts-provider.test.ts:64,91,101` 有断言 `mcuPlayback` 行为的用例。**它们断言的是已消失的能力 → 删除这些用例**，但该文件其余用例（format / sample-rate 的非 MCU 路径）必须保留且仍通过。

跑一次确认：

```bash
npx vitest run tests/server/doubao-tts-provider.test.ts tests/server/tts-synthesize-controller.test.ts
```

预期：PASS。**若删除 `mcuPlayback` 导致非 MCU 的 format/sample-rate 行为改变，说明你改错了分支** —— 回去核对 else 路径。

- [ ] **Step 4: 删除 MCU 登录与中继启停**

`controllers/auth.ts`：`:401-511` 的 `microcontrollerLogin` 整函数删除（**唯一调用方是已删除的 ESP32 固件**），`:29` 的 `startOutboundRelayClient`/`stopOutboundRelayClient` import 删除。
`routes/auth.ts:10`：删除 `/api/auth/mcu-login` 路由。

`controllers/devices.ts:312` 的 `relay_url: config.remoteRelay.url` —— `config.remoteRelay` 在 v1.0.0 已默认空串。保留该字段（设备配对信息的一部分），**不要删**；若它因 import 链断裂而报错，只修 import 不改语义。

- [ ] **Step 5: 删除 DB 表定义**

`infrastructure/database/schemas.ts`：删除 `:541-557` 的 `mcu_devices` 表与索引定义，以及 `:1582-1585` 在 `syncTable` 中的建表调用。

**不要加 `DROP TABLE`。**

- [ ] **Step 6: 同步兼容映射与边界脚本（两处必须同时改）**

`middleware/legacy-app-api.ts`：删除 `:25` 的 `['/api/hermes/mcu', '/api/studio/mcu']`，并改 `:7-9` 的注释（去掉 MCU firmware 提及）。**其余 16 条映射保留。**

`scripts/server-module-boundaries.mjs:37`：删除 `'/api/hermes/mcu'`。

> ⚠️ 这两处**必须同一次提交**，否则 `tests/server/server-module-boundaries.test.ts` 会失败。

- [ ] **Step 7: 让 tsc 变绿**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json
```

预期：**exit 0，无输出**。若仍报错，继续按报错清单收敛；**不得用 `as any` / `@ts-expect-error` 掩盖**。

- [ ] **Step 8: 确认残留**

```bash
grep -rn -i "mcu\|global-agent\|globalAgent\|global_agent" packages/server/src
```

预期：只剩 Global Constraints 列出的 4 处假阳性（`apiKeyFromCustomProvider` 等）。其余任何命中都要处理或在报告中说明理由。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "♻️ refactor(server): 收敛 MCU 与 Global Agent 的残余引用至 tsc 全绿"
```

---

## Task 4: 客户端收敛（ChatRuntimeMode 塌缩）

**Files:**
- Delete: `packages/client/src/api/studio/mcu-interaction.ts`（454 行，分句器已于 Task 1 迁出）
- Delete: `packages/client/src/api/studio/mcu-devices.ts`（54 行）
- Delete: `packages/client/src/api/studio/global-agent.ts`（132 行）
- Delete: `packages/client/src/components/hermes/connections/McuDevicesPanel.vue`（388 行）
- Delete: `tests/client/mcu-interaction.test.ts`（剩余用例的主体已删除）
- Modify: `packages/client/src/stores/hermes/chat.ts:1149,1166,1258,1400-1404,1413-1420,1834,1844,1886,2065,2116,2127,2919,2927,3230,3247,3520`
- Modify: `packages/client/src/api/studio/chat.ts`（`transport === 'global-agent'` 分支与 `ChatRunTransport` 类型）
- Modify: `packages/client/src/components/hermes/connections/ConnectionsPanel.vue:7,11,27,90-91`
- Modify: `packages/client/src/router/index.ts`（`/hermes/global-agent` 两条路由）
- Modify: `packages/client/src/components/layout/GlobalPendingActions.vue:310,338-339`
- Modify: `packages/client/src/App.vue`、`packages/client/src/shared/session-display.ts`、`packages/client/src/components/hermes/chat/{ChatPanel,ChatInput,MessageList,SessionListItem,SessionSearchModal}.vue`（`global_agent` 分支）

**Interfaces:**
- Consumes: Task 1 的 `@/api/studio/speech-segmenter`；Task 3 收敛后的服务端（已无 `/global-agent` 命名空间）
- Produces: `npx vite build` exit 0 且无 `UNLOADABLE_DEPENDENCY`；`ChatRuntimeMode` 塌缩为单值或被删除

- [ ] **Step 1: 删除文件**

```bash
git rm --quiet packages/client/src/api/studio/mcu-interaction.ts \
  packages/client/src/api/studio/mcu-devices.ts \
  packages/client/src/api/studio/global-agent.ts \
  packages/client/src/components/hermes/connections/McuDevicesPanel.vue \
  tests/client/mcu-interaction.test.ts
```

- [ ] **Step 2: 塌缩 ChatRuntimeMode**

`stores/hermes/chat.ts`。`:1149` 原为：

```ts
type ChatRuntimeMode = 'default' | 'global_agent'
```

删除 `'global_agent'` 后它只剩一个值。**优先选择整体删除该类型与 `runtimeMode` ref**，让相关分支直接取默认路径：

| 行号 | 现状 | 改法 |
|---|---|---|
| `:1166` | 存储键前缀按 `runtimeMode` 分叉 | 恒用 `STORAGE_KEY_PREFIX` |
| `:1258` | `const runtimeMode = ref<ChatRuntimeMode>(activeRuntimeMode)` | 删除（若仍被模板引用，先清引用） |
| `:1400-1404` | `if (runtimeMode.value === 'global_agent') return fetchSessions('global_agent', ...)` 与并行 fetch | 只保留非 global_agent 的那条路径 |
| `:1413-1415` | `runtimeTransport()` 返回 `'global-agent'` 或 `'chat-run'` | 恒返回 `'chat-run'`；若所有调用点都只传这个值，考虑删除该函数并在调用点直接用 `'chat-run'` |
| `:1418-1420` | `setRuntimeMode` | 删除（连同其导出与调用点） |
| `:1834`、`:2116` | `source?: ... \| 'global_agent' \| ...` 联合类型 | 删除 `'global_agent'` |
| `:1844`、`:1886`、`:2127` | `runtimeMode.value === 'global_agent' ? 'global_agent' : ...` | 取 else 分支 |
| `:3520` | `storedSource === 'global_agent'` 判断 | 删除该分支 |
| `:2065`、`:2919`、`:2927`、`:3230`、`:3247` | 传 `runtimeTransport()` 的调用点 | 随 `runtimeTransport` 的处置同步 |

**历史数据容错**：若某处读到 `source: 'global_agent'` 的旧会话记录，必须落到默认路径而**不抛错**。塌缩后天然如此 —— 但**不要额外加抛错**。

- [ ] **Step 3: 收敛 api/studio/chat.ts**

删除 `ChatRunTransport` 的 `'global-agent'` 取值与 `transport === 'global-agent' ? '/global-agent' : '/chat-run'` 的三元（恒取 `'/chat-run'`）。先定位：

```bash
grep -n "global-agent\|ChatRunTransport" packages/client/src/api/studio/chat.ts
```

- [ ] **Step 4: 删除路由与 UI 入口**

`router/index.ts`：删除 `/hermes/global-agent` 与 `/hermes/global-agent/session/:sessionId` 两条路由（含 `meta`）。

`ConnectionsPanel.vue`：`:7` 删除 `McuDevicesPanel` import，`:11` 的 `ConnectionTab` 类型去掉 `'mcu'`（改为 `'app' | 'devices'`），`:27` 的 `normalizeTab` 去掉 `'mcu'` 分支（未知值回落 `'app'`），`:90-91` 删除 `<NTabPane name="mcu">`。

`GlobalPendingActions.vue:310,338-339` 与其余组件（`App.vue`、`shared/session-display.ts`、`ChatPanel.vue`、`ChatInput.vue`、`MessageList.vue`、`SessionListItem.vue`、`SessionSearchModal.vue`）：删除 `global_agent` / `global-agent` 分支。用 grep 逐一定位：

```bash
grep -rn "global-agent\|globalAgent\|global_agent" packages/client/src
```

- [ ] **Step 5: 过真正的闸门**

```bash
npx vue-tsc -b --noEmit     # 必须 exit 0（但查不到缺失的 .vue）
npx vite build              # ← 真正判据，必须 exit 0 且无 UNLOADABLE_DEPENDENCY
```

> `vue-tsc` 看不见指向已删 `.vue` 的 import —— **只有 `vite build` 能证明 client 已收敛**。

- [ ] **Step 6: 确认残留**

```bash
grep -rn -i "mcu\|global-agent\|globalAgent\|global_agent" packages/client/src | grep -v "i18n/locales"
```

预期：只剩 Global Constraints 列出的假阳性（`forkFromCurrentTail`、`createAgentPresetFromCurrent`、`cloneFromCurrent`）。i18n 归 Task 5。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "♻️ refactor(client): 删除 MCU 设备面板与 Global Agent 入口并塌缩运行时模式"
```

---

## Task 5: i18n 与构建链路

**Files:**
- Modify: `packages/client/src/i18n/locales/{ar,de,en,es,fr,ja,ko,pt,ru,zh-TW,zh}.ts`（11 文件）
- Modify: `scripts/build-server.mjs:59-88`
- Modify: `package.json:53-55`
- Modify: `scripts/generate-openapi.mjs:91-92`
- Modify: `docs/openapi.json`（重新生成，勿手改）
- Modify: `.gitignore:32-35`

**Interfaces:**
- Consumes: Task 4 的 client 收敛结果
- Produces: `npm run build` exit 0；`dist/` 不再产出 `mcu/`；`grep -ril ekko-or-mcu packages/client/src/i18n/` 清零

- [ ] **Step 1: 删除 i18n 条目（11 个 locale 同步）**

每个 locale 文件删除：
- `mcuDevices` **整块**（`zh.ts` 为 `:383-425`，共 41 键）
- `connections.tabs.mcu`（`zh.ts:429`）
- Global Agent 相关键（先 grep 定位：`grep -n "globalAgent\|global_agent" packages/client/src/i18n/locales/en.ts`）

**11 个文件必须做同样的结构改动** —— 任何 locale 的顶层键集与 `en.ts` 不一致都是错误。

changelog 里提及 MCU/小方盒的历史条目（如 `zh.ts:3413`）：**删除提及已移除能力的条目**，保留其余（与 v1.0.0 处理 Ekko changelog 的口径一致）。

> 已实测：`packages/client/src/data/changelog.ts` **当前不引用任何 MCU / Global Agent 的 changelog 键**（`grep -i "mcu\|小方盒\|global_agent\|globalAgent"` 零命中），故无需改它。但若你删除的 changelog 键恰好被它引用，**必须同步删除该引用**，否则 UI 会渲染裸键 —— 删键后用 `grep -rn "<被删的键名>" packages/client/src` 逐一确认。

Global Agent 的 i18n 键已实测为 `en.ts:223` 的 `globalAgent: 'Global Agent'`（11 个 locale 各一处）；用 grep 确认各 locale 的实际行号后删除，并清理引用它的组件文案。

- [ ] **Step 2: 校验 locale 键集未漂移**

**先记录改动前的基线**（这是关键 —— 本仓库有 7 个 locale 在基线就缺顶层键，脚本输出 `FAIL` 属正常）：

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
node /tmp/locale-check.mjs > /tmp/locale-after.txt
diff /tmp/locale-before.txt /tmp/locale-after.txt && echo "键集未漂移 ✓"
```

预期：`diff` 无输出。**验收标准是「改动前后逐字节相同」，不是「输出为空」。**

- [ ] **Step 3: 清理构建链路**

`scripts/build-server.mjs`：删除 `:59-88` 整段 —— `const firmwareOutDir = resolve(rootDir, 'dist/mcu')` 起、含 `for (const firmwareVersion of ['v1','v2'])` 循环与回拷 `packages/esp32-c3/release/` 的逻辑。**保留 `:51-57` 的 `packages/skills` → `dist/skills` 拷贝。**

`package.json:53-55`：删除 `mcu:v1:flash:clean`、`mcu:v2:flash:clean`、`mcu:flash:clean` 三个 script（它们调外部 `pio` CLI）。

`.gitignore:32-35`：删除 `:34-35` 的 `packages/esp32-c3/release/`；`:32-33` 的 `packages/*/.pio/` / `packages/*/*/.pio/` 若无其他嵌入式工程也删（先 `ls packages/` 确认）。

`scripts/generate-openapi.mjs:91-92`：删除 `'modules/studio/routes/mcu-devices.ts'` 与 `'mcu-firmware.ts'` 两条 tag 映射。

- [ ] **Step 4: 重新生成 openapi 并构建**

```bash
npm run build
```

预期：exit 0。该命令含 `openapi:generate`，会重新生成 `docs/openapi.json`（**勿手改**）。

验证产物：

```bash
ls dist/ | grep -i mcu && echo "FAIL: 仍产出 mcu" || echo "OK: dist 无 mcu ✓"
ls dist/          # 应含 client/ server/ skills/，不含 mcu/
grep -ci "mcu\|global-agent" docs/openapi.json
```

`docs/openapi.json` 中 MCU/Global Agent 端点应已消失（原在 `:872` `/api/auth/mcu-login`、`:8902`/`:8979`/`:9062`/`:9098` `/api/mcu-devices*`、`:13369` `/api/studio/mcu/audio/{file}`、`:13405` firmware）。

- [ ] **Step 5: 过闸门**

```bash
npx vite build
npm run harness:check
```

预期：均 exit 0。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "🌐 i18n(client): 移除小方盒与 Global Agent 文案并清理固件构建链路"
```

---

## Task 6: 测试收敛与终态验证

**Files:**
- Delete: `tests/server/mcu-adpcm.test.ts`、`mcu-prompts.test.ts`、`mcu-speech-segmenter.test.ts`、`mcu-devices-store.test.ts`、`mcu-firmware-controller.test.ts`、`mcu-firmware-source.test.ts`、`mcu-login-controller.test.ts`（7 文件 720 行）
- Delete: `tests/server/global-agent-server.test.ts`（1889 行）、`tests/server/outbound-relay-client.test.ts`（1150 行）
- Modify: `tests/server/stt-transcribe-controller.test.ts:524,582,638`、`stt-settings-controller.test.ts:377,394,413`、`tts-synthesize-controller.test.ts:889,896,916`、`schema-sync.test.ts:122-123,203-216`、`hermes-schemas.test.ts:24,43,100-105`、`legacy-app-api.test.ts:22-30`、`lan-discovery.test.ts:237,257`、`server-module-boundaries.test.ts:103-104`
- Modify: `tests/client/device-connections-permissions.test.ts:10,22`、`device-connections-locales.test.ts:32,68-69`
- Modify: `docs/PROVENANCE.md`（追加本次移除的记录）
- Modify: `ARCHITECTURE.md:49`、`docs/app-relay.md:4`、`docs/harness/server-module-boundaries.md:8,79,90,114,358`、`README.md`、`README_zh.md`（提及 MCU/ESP32/Global Agent 处）

**Interfaces:**
- Consumes: Task 1–5 全部产出
- Produces: `npx vitest run` 满足回归判据；全部闸门绿；文档与代码现状一致

- [ ] **Step 1: 删除主体已消失的测试**

```bash
git rm --quiet tests/server/mcu-adpcm.test.ts tests/server/mcu-prompts.test.ts \
  tests/server/mcu-speech-segmenter.test.ts tests/server/mcu-devices-store.test.ts \
  tests/server/mcu-firmware-controller.test.ts tests/server/mcu-firmware-source.test.ts \
  tests/server/mcu-login-controller.test.ts \
  tests/server/global-agent-server.test.ts tests/server/outbound-relay-client.test.ts
```

**删除理由必须在报告中逐个写明**：每个文件的被测对象（`adpcm` 编解码、MCU 提示音、服务端分句器、`mcu_devices` 表、OTA 控制器、固件源码断言、`/api/auth/mcu-login`、`GlobalAgentServer`、`OutboundRelayClient`）均已在 Task 2 删除。

> `global-agent-server.test.ts` 与 `outbound-relay-client.test.ts` 整删的依据是**被测类已不存在**。若你发现其中有断言**幸存能力**（如 app-relay 行为）的用例，**不要连带删除** —— 把那些用例搬到对应的幸存测试文件（如 `tests/server/app-relay-client.test.ts`）并在报告中说明。

- [ ] **Step 2: 收敛幸存测试的断言**

逐个处理（改断言而非删断言）：

| 文件 | 处理 |
|---|---|
| `stt-transcribe-controller.test.ts:524,582,638` | 删除 `x-hermes-mcu-interaction-id` 头断言与 `mcuVoiceTurn` 用例 |
| `stt-settings-controller.test.ts:377,394,413` | 路由表快照去掉 `/api/studio/mcu/voice-turn` |
| `tts-synthesize-controller.test.ts:889,896,916` | 路由表快照去掉 `/api/studio/mcu/audio/:file` |
| `schema-sync.test.ts:122-123,203-216` | 删除 `MCU_DEVICES` 断言 |
| `hermes-schemas.test.ts:24,43,100-105` | 删除 `MCU_DEVICES_TABLE` 断言 |
| `legacy-app-api.test.ts:22-30` | 删除 "keeps released MCU firmware…" 整个 `it` |
| `lan-discovery.test.ts:237,257` | 删除读 `routes/mcu-devices.ts` 源码的 `requireSuperAdmin` 断言 |
| `server-module-boundaries.test.ts:103-104` | 把样例从 `mcu-firmware.ts` 换成**另一个幸存的路由文件** |
| `tests/client/device-connections-permissions.test.ts:10,22` | 同 `lan-discovery` 处理 |
| `tests/client/device-connections-locales.test.ts:32,68-69` | 从 `requiredPaths` 删除 `connections.tabs.mcu`、`mcuDevices.subtitle`、`mcuDevices.refresh` |

**仅文案/变量名含 `mcu`、不要改的**：`app-relay-client.test.ts:57,517`、`app-relay-controller.test.ts:81`、`run-chat-queued-item.test.ts:772`、`run-chat-bridge-final-context.test.ts:242,267,271`、`audio-convert.test.ts:30,40,43`、`doubao-stt-provider.test.ts:182-198`。

> ⚠️ `tests/server/doubao-tts-provider.test.ts:64,91,101` **不在**此白名单内 —— 它断言 `mcuPlayback` 行为，已由 **Task 3 Step 3b** 处理。若 Task 3 已正确处理，此处无需再动。

- [ ] **Step 3: 跑全量测试**

```bash
npx vitest run --reporter=basic 2>&1 | tee /tmp/final-suite.log | tail -20
grep "FAIL " /tmp/final-suite.log | sed 's/ >.*//' | sort -u
```

**验收**：失败数 0，**或** ≤3 且全部是 `Error: Test timed out in 5000ms.` 且仅在 `hermes-cli-discovery` / `hermes-cli-selection-live` / `hermes-runtime-selection`。其余任何失败必须修。

- [ ] **Step 4: 终态残留扫描（必须带 `-a`）**

```bash
grep -rai "mcu\|esp32\|global-agent\|globalAgent\|global_agent" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist . \
  | grep -v "docs/superpowers/" | grep -v "docs/PROVENANCE.md"
```

> **`-a` 不可省** —— macOS/BSD 的 `grep -r` 默认跳过二进制文件；v1.0.0 时期正是因此漏掉了一个内含 phone-home URL 的预编译固件。

预期只剩：
- Global Constraints 列出的 4 处假阳性（`apiKeyFromCustomProvider`、`forkFromCurrentTail`、`createAgentPresetFromCurrent`、`cloneFromCurrent`）
- `tests/` 中仅文案含 `mcu` 的项（Step 2 末尾列出的白名单）
- 文档中记述历史的部分（`docs/PROVENANCE.md`、`docs/superpowers/**`，已由上面的 `grep -v` 排除）

- [ ] **Step 5: 全量构建与闸门**

```bash
npx vue-tsc -b --noEmit
npx tsc --noEmit -p packages/server/tsconfig.json
npx vite build
npm run build
npm run harness:check
npm run verify:sharp-runtime
```

预期：全部 exit 0。

- [ ] **Step 6: 启动冒烟（能做到的部分）**

无 GUI 环境时**不要声称做了浏览器验证**。做能做的并如实记录：

```bash
npm start &
sleep 20
curl -s -o /dev/null -w "login page: %{http_code}\n" http://localhost:8648/
# 用默认 admin/123456 取 token 后，至少打两个认证接口
# 确认进程只有 LISTEN、无指向外部主机的 ESTABLISHED：
lsof -i -P | grep -i node | head -20
kill %1
```

**必须手工确认（或明确记录未能确认）的幸存能力**：输入框麦克风输入、**实时语音对话台**（依赖 Task 1 搬迁的分句器）、消息/群聊朗读、语音设置页、手机 App 连接、局域网设备发现。

- [ ] **Step 7: 更新文档**

`ARCHITECTURE.md:49`、`docs/app-relay.md:4`、`docs/harness/server-module-boundaries.md:8,79,90,114,358`、`README.md`、`README_zh.md`：删除 MCU / ESP32 / 小方盒 / Global Agent 的描述与架构图节点。

`docs/PROVENANCE.md`：追加一节「移除硬件固件与 Global Agent（2026-10-15）」，含实测的残留数字、测试结果与本次删除的三块内容。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "✅ test: 收敛 MCU 与 Global Agent 测试并完成终态验证"
```

---

## 附录：任务依赖关系

```
Task 1 (搬迁分句器) ←── 必须最先，否则网页语音对话失效
  └→ Task 2 (服务端整文件删除)  ←── 有意以 tsc 红灯结束
       └→ Task 3 (服务端局部收敛)  ←── server tsc 变绿
            └→ Task 4 (客户端收敛)  ←── vite build 变绿
                 └→ Task 5 (i18n + 构建链路)
                      └→ Task 6 (测试收敛 + 终态验证 + 文档)
```
