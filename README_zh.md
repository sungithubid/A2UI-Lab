# A2UI Lab

[English](README.md) | [简体中文](README_zh.md)

本地优先的流式 Agent UI 工程实验室：执行确定性场景，查看语义事件和 A2UI 协议，操作动态生成界面，并从 SQLite 事件日志中确定性重放整个运行过程。无需账号，无需 LLM 密钥。

---

## 核心特性

- **零依赖与开箱即用**：纯 Go 单二进制文件，内嵌 React 前端静态资产与 Goose 数据库迁移，本地无外部依赖即可完整运行。
- **混合多轮聊天与 Trace**：右侧用户气泡、左侧 Agent 输出；Markdown 增量文本与 A2UI 组件交错展示。后端保存会话历史，Trace 展示上下文构建、实际 Mock 请求、工具与交互过程。
- **可开关的深度思考**：每轮可启用流式 Mock 规划摘要，支持显示/隐藏、展开/折叠、记录耗时、独立 Trace 和回放；思考摘要不进入后续聊天上下文。
- **渐进式场景阶梯**：内置 9 个场景，涵盖流式文本、部分输出失败、工具调用观测、富媒体展示以及人机交互协同（HITL）。
- **交互教学基线**：Learning lab 提供事件检查点、SSE 断开/重连与相同 Action 重试练习；Stop run 停止执行并保存部分输出。
- **端到端协议可观测性**：集成 Protocol Inspector 和 Timeline，实时查看原始协议 JSON、序号、时间戳、组件树结构与数据模型状态。
- **事件溯源确定性重放**：界面任意时刻状态皆由已持久化的历史事件前缀解释。提供 Reset / Step / Play 逐步重放机制，重放过程完全离线计算，绝不重新调用外部 Agent 或 LLM。
- **安全沙箱与人机交互**：前端受控注册表映射渲染，绝不动态执行传入代码；支持工单表单与高危操作审批，在 `waiting_input` 状态下实现跨进程持久化等待。

---

## 快速开始

### 1. 本地启动开发环境

```sh
make install
make dev
# 浏览器打开 http://localhost:5173
```

### 2. 基础操作流程

![A2UI Lab 控制台全景](docs/images/hybrid-chat.png)

1. **选择场景**：在顶部下拉菜单中选择演示场景（例如 **Server health**）。
2. **发起运行**：输入提示词并点击 **New run**。Mock Agent 逐步输出流式文本、工具调用与执行进度，Presentation 层生成绑定的状态卡片。
3. **交互与动作**：点击卡片中的 **View errors**，将标准意图动作（Action）提交至服务端受控路由处理。
4. **协议检查与重放**：
   - 在 **Protocol Inspector** 中查看原始协议消息（`updateComponents` / `updateDataModel`）、组件层级与数据校验结果。
   - 在 **Timeline** 中查看事件全生命周期。
   - 使用 **Reset** / **Step** / **Play** 按需回放历史界面构建过程，点击 **Live** 返回实时最新状态。
5. **记录管理与布局微调**：
   - **Delete run**：删除选中的非运行中记录。
   - **Delete all runs**：二次确认后终止正在运行的后台任务，清空全部运行及事件记录。
   - 拖动 Protocol Inspector 中间的水平分割线调整视窗高度（支持上下键微调、Home/End 移至边界、双击恢复默认）。

---

## 多轮聊天与请求 Trace

**New run** 创建新会话。当前轮结束后，在聊天底部选择 **Next scenario**、输入追问并点击 **Send message**，继续同一会话。表单与审批必须先处理完成。历史轮次保留 Markdown、组件和提交结果；**Inspect turn** / **Trace turn** 切换检查对象，**Return to latest** 返回最新轮，历史交互与回放中的提交按钮只读。

左侧 **Trace** 展示上下文构建、Agent 请求、工具调用、Action 和 A2UI 输出的耗时与 JSON。选择请求节点默认显示 OpenAI Chat Completions 兼容的 `messages` 预览，每条消息只包含 `role` 和 `content`，UI 语义事实附加在对应历史 assistant 消息内。展开 **Mock runtime / original snapshot** 可查看实际记录的完整请求，包括 `prompt`、`scenarioId`、`uiContext`、来源 run ID 和文本缓冲设置。预览不是 HTTP 请求，不填入未配置的模型与采样参数。当前没有调用外部 LLM；没有虚构供应商 HTTP 参数、token 用量或费用。Mock 追问使用确定性模板展示收到的历史上下文。

前端仅提交新 prompt、场景、`conversationId` 和 `parentRunId`。后端从已持久化事件构建最近最多 8 轮完整历史，整个请求不超过 32,000 个 UTF-8 序列化字节；超限按完整轮次省略，并在 Trace 中明确记录。每个会话最多 100 轮。UI 通过语义事实进入上下文，不回传整棵组件树。

普通 prompt 与本地表单事件会保存在数据库中；已提交的联系表单字段不进入后续模型上下文。删除单轮不会改写后续轮已经保存的请求快照；清空全部历史请使用 **Delete all runs**。

---

## 交互教学基线（P0）

从 [逐步学习指南](docs/learning_zh.md) 开始，按场景追踪前端请求、持久化事件、
Agent 上下文、渲染及 Action 处理，并对照代码入口完成异常练习。
展开 Run 的 **Learning lab** 可以点击实际事件检查点。
**Disconnect SSE** 仅断开实时交付，后端继续执行；**Reconnect SSE** 从连续事件前缀补齐。
**Retry last Action** 重发原始已保存信封，用不变的事件序号观察幂等效果。
**Stop run** 取消正在运行的任务并保存已收到的文本。
历史轮次和回放中的操作/练习控件只读。

## 可开关的思考输出

在 New run 旁或追问输入区打开 **Deep thinking**，每次请求独立保存该选项。
思考摘要在正文前使用独立面板流式展示，完成后自动折叠，手动展开/折叠优先。
每轮 **Show thinking** 控制显示与隐藏，不删除事件。停止/失败保留部分摘要；
Trace 记录独立 Thinking 阶段，刷新及回放恢复原有输出。
当前使用固定 Mock 摘要，provider_summary 为后续模型适配入口，
不宣称获取了模型私有思维链或真实 token 用量。
详见 [思考输出与适配指南](docs/thinking_zh.md)。

## 内置场景

项目内置 8 个核心场景与 1 个部分输出失败练习（详见 [场景演进阶梯](docs/scenarios.md)）：

- **流式文本 (`streaming-text`)**：Mock 文本分片经轻量缓冲输出 Markdown，包含列表、表格与代码块；纯文本不创建 A2UI Surface。
- **服务器健康 (`server-health`)**：工具调用执行、进度轮询、状态卡片数据绑定与事后交互 Action。
- **工具失败 (`tool-error`)**：显式捕获工具调用异常，渲染告警卡片并安全归档。
- **部分输出失败 (`stream-error`)**：不完整 Markdown 后出现模拟上游错误；文本和告警在刷新及回放后保持一致。
- **可跳转图片卡片 (`image-card`)**：受控渲染内嵌静态插画，并在新标签页安全打开官方文档链接。
- **左图右文资源列表 (`image-list`)**：基于数据模型驱动的多条目列表排版与动态树追加。
- **支持工单表单 (`support-form`)**：字段格式前端校验，在 `waiting_input` 状态挂起并在提交后回填持久化。
- **方案决策 (`plan-decision`)**：展示分析、推荐与备选方案，点击方案即确认；方案3内直接填写方案或想法（最多 500 字符），然后确认；新运行的场景文案统一为英文，已保存的历史文案保留原样。待决策状态跨重启恢复，确认后只读，结果进入后续对话上下文。
- **部署确认 (`deployment-approval`)**：高危动作双向审批（批准/拒绝），批准后触发模拟执行，决策具备幂等性保护。

> **说明**：当前切片聚焦于确定性 Presentation 呈现；Eino、真实大模型接入、Agent 中断/恢复和原始 JSON 编辑器为后续阶段规划。

---

## 架构与数据流

系统遵循严格的单向管道设计：

```text
Backend conversation history → bounded agent.Request → Mock Agent
   ↓ semantic events + exact request/response trace
Presentation
   ├─ text-delta → Markdown chat blocks
   └─ structured UI → A2UI messages → controlled Surface renderer
   ↓ persisted together in SQLite (conversation / run / event sequence)
SSE → Conversation + Trace + Protocol Inspector → event-prefix replay
   ↓ intent actions
Action Router → server allowlist / validation → persisted results
```

### 核心机制

- **标准协议子集**：遵循 [A2UI v0.9.1 规范](https://a2ui.org/specification/v0.9.1-a2ui/) 的明确子集和独立 Lab catalog，隔离规范演进影响。
- **离线回放能力**：SQLite 顺序持久化事件流，前端重放仅消费本地历史事件，不依赖网络与外部推理。
- **本地安全基线**：服务默认绑定 Loopback IP (`127.0.0.1:8080`)，严格校验 Host 与 Origin；远程访问需经由带鉴权的反向代理。
- **数据迁移兼容**：迁移 00003 新增 runs/events；00004 新增会话及有序轮次，每条旧 run 保留为一个独立会话。旧 Monoseed 迁移与数据保留，升级前可创建热备份，需要迁移旧库时显式指定 `APP_DATA_DIR`。

---

## 构建与运维

### 环境要求
- **构建/开发**：Go 1.27.1+，Node 24
- **生产运行**：编译产物为单个 Go 可执行文件（内嵌静态资产与 Goose 迁移）

### 常用运维命令

```sh
# 编译生产二进制文件
make build

# 启动服务
./bin/a2ui-lab serve

# 查看当前生效配置（脱敏显示，无副作用）
./bin/a2ui-lab config show

# 环境与数据库健康检查
./bin/a2ui-lab doctor

# 创建热备份快照（基于 SQLite VACUUM INTO）
./bin/a2ui-lab backup create --output /absolute/path/backup.db
```

### 配置与存储说明
- 复制 `.env.example` 为 `.env` 可自定义配置；优先级为 **进程环境变量 > `.env` 文件 > 默认值**。
- 设置 `APP_ENV_FILE=-` 可彻底禁用读取配置文件。
- 默认数据存储于系统用户配置目录下的 `a2ui-lab`（开发时使用 `.data`）。备份请务必使用 CLI 工具，禁止直接拷贝运行中的 WAL 文件。

---

## 质量验证

执行自动化检查保证代码质量与规范：

```sh
make fmt      # 代码格式化 (Go fmt & Prettier)
make test     # 单元测试 (Go test & Vitest)
make verify   # 全量门禁校验
```

`make verify` 包含：代码生成漂移检测 (sqlc/OpenAPI)、Go vet 与 race 竞态检测、TypeScript 类型检查、ESLint、Vitest、生产构建、二进制 smoke 烟测以及 Playwright E2E 测试。

---

## 相关文档

- [系统架构文档 (Architecture)](docs/architecture.md)
- [场景演进阶梯 (Scenarios & Evolution Ladder)](docs/scenarios.md)
- [P0 交互教学指南](docs/learning_zh.md)
- [思考输出与模型适配契约](docs/thinking_zh.md)
- [协议子集定义 (Protocol Subset)](docs/protocol.md)
- [本地实验室架构决策 (ADR 0007)](docs/decisions/0007-local-event-lab.md)
- [持久化交互架构决策 (ADR 0008)](docs/decisions/0008-persisted-human-interaction.md)
- [混合聊天、上下文与 Trace 决策 (ADR 0009)](docs/decisions/0009-hybrid-conversations-and-traces.md)
- [Chat Completions 请求预览决策 (ADR 0010)](docs/decisions/0010-chat-request-preview.md)
- [方案决策交互 (ADR 0011)](docs/decisions/0011-persisted-plan-decisions.md)
- [交互教学基线 (ADR 0012)](docs/decisions/0012-interaction-teaching-baseline.md)
- [可选思考摘要 (ADR 0013)](docs/decisions/0013-optional-thinking-summaries.md)
- [开发指南 (Development)](docs/development.md)
- [验证规范 (Verification)](docs/verification.md)
