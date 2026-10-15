# 移除硬件固件与 Global Agent（Path B）设计文档

**日期**：2026-10-15
**状态**：Boss 已批准方向（Path B）
**仓库**：`/Users/aigniteluo/Workspace/FullStackProjects/hermes-studio` @ `v1.0.0`

---

## 1. 背景与目标

`hermes-studio` v1.0.0 已移除 Ekko Agent 一族。但上游作者还在其中内置了**自家的硬件产品线**：一个基于 ESP32-C3 的语音盒子（`HStudio ESP32-C3 hardware v2 with ES8311 audio and SSD1306-compatible OLED`，即带麦克风/喇叭/OLED 屏的小方盒），以及与之配套的 **Global Agent 命名空间**和**实例间远程中继**。

Boss 不拥有该硬件，也不使用实例间互联，目标仍是最初那句：**「我只需要一个纯粹的 Hermes Agent UI 客户端」**。

本项目移除三块：

1. **MCU / ESP32 硬件能力** —— 固件工程、设备管理、OTA 分发、MCU 语音链路、`/api/auth/mcu-login`
2. **Global Agent** —— `/global-agent` socket 命名空间、`GlobalAgentServer`、`/hermes/global-agent` 页面
3. **实例间远程中继** —— `OutboundRelayClient` 与 `McuSocketIoRelayClient`

### 非目标

- 不移除手机 App 连接（`app-relay`，与上述三块零耦合）
- 不移除语音能力（STT / TTS / 实时语音对话台 / 麦克风输入）
- 不移除局域网设备发现
- 不新增功能
- 不改 `LICENSE`、不改 `packages/skills/*/SKILL.md` 的 `author: Ekko`

---

## 2. 为什么选 Path B 而非「只删 MCU」

MCU 语音与 Global Agent 挤在同一个类里：`sockets/global-agent.ts` 共 2302 行，约 1300 行是 MCU，且交织（12 个实例成员、3 处嵌入点）；`outbound-relay-client.ts` 里还有 1509 行的 `McuSocketIoRelayClient`。

Global Agent 的 `agent` 角色接受两类客户端（`sockets/global-agent.ts:282`）：

```ts
return role === 'hermes-studio' || role === 'agent'
```

即除 MCU 盒子外，**另一个 Hermes Studio 实例**也能接入（实例间中继）。Boss 确认不使用该能力。

**结论**：连 Global Agent 一起删 → **整文件删除，不必在交织代码里动刀**。Path B 比「只删 MCU」风险更低、工作量更小。

---

## 3. ⚠️ 唯一的陷阱（必须先处理）

`packages/client/src/api/studio/mcu-interaction.ts`（454 行）**文件名带 `mcu`，但其分句器正在为网页端的「实时语音对话台」供能**：

- `RealtimeVoiceStage.vue:4` → `import { createMcuSpeechSegmenter } from '@/api/studio/mcu-interaction'`
- `RealtimeVoiceStage.vue:135` → `createMcuSpeechSegmenter({ emitOnSentenceEnd: true })`
- 入口：`ChatPanel.vue:46,3054`

**照文件名删除 ⇒ 失去网页语音对话。**

**利好**：需搬迁的三段（`:86-98` 正则、`:112-171` 五个纯函数、`:250-289` `createMcuSpeechSegmenter`）**不依赖该文件的任何 import** —— `startRunViaSocket` / `transcribeSpeech` / `StoredSttProvider` / `synthesizeSpeech` 全是 `startMcuVoiceInteraction` 的依赖。故搬迁自包含。

**处置**：先把分句器迁到 `packages/client/src/api/studio/speech-segmenter.ts`（去掉 `Mcu` 前缀），改好消费方，再删原文件其余部分。这是本项目的 **Task 1**，顺序不可调换。

---

## 4. 共享能力（必须保留）

| 能力 | 证据 | 非 MCU 消费方 |
|---|---|---|
| **STT 全链路** | `routes/stt.ts:7-23` 共 17 条路由，**仅 `:13` `/api/studio/mcu/voice-turn`** 是 MCU 专属 | 输入框麦克风（`useComposerVoiceInput.ts:15`）、实时语音台、语音设置页、本地 STT 模型下载 |
| **TTS 全链路** | `routes/tts.ts:7-20` 共 13 条路由，**仅 `:9` `/api/studio/mcu/audio/:file`** 是 MCU 专属 | 消息朗读（`MessageItem.vue:33`）、群聊朗读、实时语音台 |
| **app-relay（手机 App）** | `grep -i mcu services/app-relay/` → **0 命中**；测试显式断言 "independent of the MCU relay"（`app-relay-client.test.ts:57`）；controller 已核实零依赖 `global-agent` | 手机 App |
| **LAN 设备发现** | `services/network/lan-discovery.ts` `grep -i mcu` → **0 命中** | 设备页、`controllers/devices.ts:19-21,354`、`app-connections.ts:10`、`auth.ts:30` |
| **音频转码** | `services/voice/stt/audio-convert.ts` 的 `transcodeToWav` 被所有 STT provider 使用 | 全部 STT provider |
| **分句器** | 见 §3 | 实时语音台 |

### 假阳性（grep `-i mcu` 命中但无关，勿动）

`controllers/media.ts:151,172` 的 `apiKeyFro`**`mCu`**`stomProvider`；`MessageItem.vue:245,1298` 的 `forkFro`**`mCu`**`rrentTail`；`GroupChatPanel.vue:1395,2907` 的 `createAgentPresetFro`**`mCu`**`rrent`；`ProfileCreateModal.vue:97` 的 `cloneFro`**`mCu`**`rrent`。

---

## 5. 客户端的塌缩（非手术）

`stores/hermes/chat.ts:1149`：

```ts
type ChatRuntimeMode = 'default' | 'global_agent'
```

删掉 `global_agent` 后该类型塌缩为单值，一串分支自然消失：

- `:1166` 存储键前缀不再分叉
- `:1413-1415` `runtimeTransport()` 恒返回 `'chat-run'`
- `:1400-1404`、`:1844`、`:1886`、`:2127`、`:3520` 的 `runtimeMode` 判断全部可简化
- `:1418-1420` `setRuntimeMode` 失去意义

这是**收缩**，不是在交织代码里切割。

---

## 6. 数据兼容

`mcu_devices` 表定义在 `infrastructure/database/schemas.ts:541-557`，由 `:1582-1585` 的 `syncTable` 幂等创建。**本仓库无 migration 机制**（`find packages/server/src -ipath "*migration*"` 为空）。

**策略**：删除建表代码即不再创建。**不在代码里加 `DROP TABLE`**（有误删风险）。已存在的旧库会残留一张空表，由 Boss 决定是否手工清理。

会话 `source: 'global_agent'` 的历史行同理：读侧遇到未知 source 应落到默认路径而不抛错。Boss 从未使用过 Global Agent（它需要至少一个 agent 客户端接入），故实际无此类数据。

---

## 7. 验证策略

### 闸门（每个任务结束都要过）

```bash
npx vue-tsc -b --noEmit                            # 仅查 .ts，查不到缺失的 .vue
npx tsc --noEmit -p packages/server/tsconfig.json
npx vite build                                     # client 的真正闸门
npx vitest run
npm run build && npm run harness:check
```

> ⚠️ `vue-tsc` 对 `.vue` 路径有盲区（`vite/client` 的 `declare module '*.vue'` 通配声明让任何 `.vue` 路径都能解析，包括不存在的文件）。**client 侧必须以 `vite build` 为准。**

### 基线（v1.0.0 实测）

`npx vitest run` → **exit 0，`4396 passed | 6 skipped (4402)`，零失败**。

**回归判据**：失败数 0，或 ≤3 且全部是下列三文件的 `Error: Test timed out in 5000ms.`（会拉起真实 CLI 子进程，随负载抖动）：
`tests/server/hermes-cli-discovery.test.ts`、`hermes-cli-selection-live.test.ts`、`hermes-runtime-selection.test.ts`。

**测试必须在仓库根目录运行** —— `cd /tmp` 会让 `studio-mcp-autoinject.test.ts` 产生 13 个假红（`isTransientPath()` 命中 `/private/tmp` 后跳过 MCP 注入）。

### 必须手工确认仍可用的能力

1. 输入框麦克风语音输入
2. **实时语音对话台**（依赖搬迁后的分句器）
3. 消息/群聊朗读
4. 语音设置页（STT/TTS provider、本地模型下载）
5. 手机 App 连接
6. 局域网设备发现/配对

---

## 8. 风险

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 分句器被连带删除 → 网页语音对话失效 | Task 1 先搬迁，顺序不可调换；`vite build` + 语音测试双重把关 |
| R2 | 误删 STT/TTS 的非 MCU 路由 | 30 条路由里只有 2 条是 MCU 专属，逐条核对 |
| R3 | 误删 `app-relay` 或 LAN discovery | 已核实零耦合；两者都不在任何任务的 Files 清单内 |
| R4 | `grep -i mcu` 的假阳性被误删 | §4 已列出 4 处，写入 Global Constraints |
| R5 | `legacy-app-api.ts:25` 与 `server-module-boundaries.mjs:37` 不同步 → 边界测试失败 | 两处必须同一任务内同步改 |
| R6 | 旧库残留 `mcu_devices` 空表 | 接受（§6） |
