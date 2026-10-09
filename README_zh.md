# A2UI Lab

[English](README.md) | [简体中文](README_zh.md)

本地优先的流式 Agent UI 工程实验室：执行确定性场景，查看语义事件和 A2UI 协议，操作动态生成界面，并从 SQLite 事件日志中确定性重放整个运行过程。无需账号，无需 LLM 密钥。

---

## 核心特性

- **零依赖与开箱即用**：纯 Go 单二进制文件，内嵌 React 前端静态资产与 Goose 数据库迁移，本地无外部依赖即可完整运行。
- **渐进式场景阶梯**：内置 7 个递进复杂度场景，涵盖流式文本、工具调用观测、富媒体展示以及人机交互协同（HITL）。
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

## 内置场景

项目内置 7 个由浅入深的代表性场景（详见 [场景演进阶梯](docs/scenarios.md)）：

- **流式文本 (`streaming-text`)**：大模型 Token 级增量流式输出与自适应滚动。
- **服务器健康 (`server-health`)**：工具调用执行、进度轮询、状态卡片数据绑定与事后交互 Action。
- **工具失败 (`tool-error`)**：显式捕获工具调用异常，渲染告警卡片并安全归档。
- **可跳转图片卡片 (`image-card`)**：受控渲染内嵌静态插画，并在新标签页安全打开官方文档链接。
- **左图右文资源列表 (`image-list`)**：基于数据模型驱动的多条目列表排版与动态树追加。
- **支持工单表单 (`support-form`)**：字段格式前端校验，在 `waiting_input` 状态挂起并在提交后回填持久化。
- **部署确认 (`deployment-approval`)**：高危动作双向审批（批准/拒绝），批准后触发模拟执行，决策具备幂等性保护。

> **说明**：当前切片聚焦于确定性 Presentation 呈现；Eino、真实大模型接入、Agent 中断/恢复和原始 JSON 编辑器为后续阶段规划。

---

## 架构与数据流

系统遵循严格的单向管道设计：

```text
Agent (智能体 / Mock / LLM)
   ↓ 原始语义事件 (event.Message)
Presentation (应用展示语义层: internal/presentation)
   ↓ 自包含展示模型 (presentation.Model)
A2UI Protocol (协议映射层: internal/a2ui)
   ↓ 声明式组件树与数据 (a2ui.Message)
SQLite (事务持久化 & 单调递增 Seq 序号)
   ↓ SSE (事件流实时广播与断点续传)
Renderer (前端受控渲染引擎: web/src/features/renderer)
   ↓ 标准化意图信封 (action.Envelope)
Action Router (服务端受控路由与白名单校验: internal/action)
```

### 核心机制

- **标准协议子集**：遵循 [A2UI v0.9.1 规范](https://a2ui.org/specification/v0.9.1-a2ui/) 的明确子集和独立 Lab catalog，隔离规范演进影响。
- **离线回放能力**：SQLite 顺序持久化事件流，前端重放仅消费本地历史事件，不依赖网络与外部推理。
- **本地安全基线**：服务默认绑定 Loopback IP (`127.0.0.1:8080`)，严格校验 Host 与 Origin；远程访问需经由带鉴权的反向代理。
- **数据迁移兼容**：迁移 00003 新增 runs/events。旧 Monoseed 迁移与数据保留，升级前可创建热备份，需要迁移旧库时显式指定 `APP_DATA_DIR`。

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
- [协议子集定义 (Protocol Subset)](docs/protocol.md)
- [本地实验室架构决策 (ADR 0007)](docs/decisions/0007-local-event-lab.md)
- [持久化交互架构决策 (ADR 0008)](docs/decisions/0008-persisted-human-interaction.md)
- [开发指南 (Development)](docs/development.md)
- [验证规范 (Verification)](docs/verification.md)
