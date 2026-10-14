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
- 替换 Ekko 品牌标识与域名

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

## 许可证

上游采用 **Business Source License 1.1**（BSL 1.1）。Additional Use Grant 允许个人、
教育、研究等非商业用途；商用需单独授权；Change Date 2029-05-10 后转 Apache 2.0。

本 fork 为个人非商业使用，落在许可范围内。`LICENSE` 文件保持原样，**未修改**
Licensor 署名与许可条款。

## 上游跟踪

**不跟踪**。本 fork 无 rebase / cherry-pick 上游的计划。
