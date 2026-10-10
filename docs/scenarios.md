# A2UI Lab 场景能力与架构演进阶梯 (Evolution Ladder)

本文档系统性说明 A2UI Lab 中内置的 **8 个核心场景** 所演示的能力、底层架构机制，以及从简单流式到复杂双向人机协同的 **设计哲学与演进阶梯（Evolution Ladder）**。

---

## 一、架构设计哲学与核心不变量 (Core Invariants)

A2UI Lab 的核心定位是探索面向生成式 AI 交互界面的 **标准化声明式协议工程实践**。全链路遵循严格的分层管道：

```text
后端会话历史 → 有界 messages / uiContext → Mock Agent
   ↓ 语义事件与请求 Trace
Presentation
   ├─ text-delta → Markdown 对话块
   └─ 结构化内容 → A2UI 协议 → 受控 Surface 组件
   ↓ SQLite 持久化 conversations / runs / events（run 内单调 Seq）
SSE → 聊天 / Trace / Protocol Inspector → 事件前缀重放
   ↓ 意图 Action
服务端白名单校验 → 持久化交互结果
```

### 系统的三大设计基石：
1. **事件溯源与前缀自解释（Event Prefix Replayability）**：
   - 界面上**任何一帧 UI 状态，都能完全由已持久化的历史事件前缀解释**。
   - 无论前端执行 Play、Step（单步）还是 Reset（重置），重放逻辑基于已记录的文本增量、`a2ui.message` 和 Trace 事件计算，**绝不重新调用大模型、Agent 或外部 API**。
2. **绝对安全沙箱与零动态执行（Never Execute Incoming Code）**：
   - Agent 输出的永远是纯结构化数据（Data），前端渲染引擎（Renderer）绝不执行任何传入的 HTML 字符串、动态 JS 脚本或未受控组件。
   - 所有链接、图片地址均经受控的安全前置校验（如 `safeLink`、`safeImage`），组件完全由前端受控注册表映射渲染。
3. **分层解耦与职责单一**：
   - `Agent` 关注模型推理与工具调用（无 UI 概念）；
   - `Presentation` 负责状态缓冲、数据聚合与应用意图梳理（无 A2UI 概念）；
   - `A2UI` 负责生成标准协议树，隔离版本演进风险；
   - `Action Router` 在服务端掌控白名单权限，客户端无权越权执行任意命令。

---

## 二、八大场景的演进阶梯 (The Evolution Ladder)

项目内置的 8 个场景绝非零散用例，而是沿着 Agent UI 复杂度梯次递进的 **演进阶梯**：

```mermaid
flowchart TD
    subgraph L4 ["Level 4: 人机协同与双向闭环 (HITL & Interactive Loop)"]
        S6["support-form (动态模式表单与数据回填)"]
        S8["plan-decision (推荐方案、备选与手动输入确认)"]
        S7["deployment-approval (高危动作审批、打断/恢复与多 Surface)"]
    end

    subgraph L3 ["Level 3: 生成式富媒体与渐进式流 (Generative UI & Progressive Stream)"]
        S4["image-card (图文卡片与动态树生长)"]
        S5["image-list (流式渐进追加与布局变体复用)"]
    end

    subgraph L2 ["Level 2: 工具可观测性与异常自愈 (Observability & Resilience)"]
        S2["server-health (工具执行、进度监控、卡片数据绑定与事后 Action)"]
        S3["tool-error (显式工具失败的可视化告警与状态归档)"]
    end

    subgraph L1 ["Level 1: 文本流式与展示解耦 (Streaming Text)"]
        S1["streaming-text (Markdown 增量缓冲与混合展示)"]
    end

    L1 --> L2 --> L3 --> L4
```

---

### Level 1：文本流式与展示解耦 (Streaming Text)

#### 1. `streaming-text`（流式 Markdown 文本）
- **Prompt 示例**：`Show a streaming answer`
- **演示的核心能力**：Markdown 标题、列表、表格、代码块增量显示，与 A2UI 组件共用同一事件序列。
- **架构机制**：
  - Mock 以约 12 个字符分片模拟流式输出，不等同于真实模型 token 边界。
  - 服务层首片立即发送，后续以 50ms / 128 字符阈值合并；非文本事件和结束时先刷新缓冲，保留输出顺序。
  - `presentation.event` 记录 `text-delta`，前端按消息顺序累加 Markdown；不重复持久化整段累计文本。
  - 纯文本不产生 A2UI 消息。只有工具、指标、卡片、表单等结构化输出才创建 Surface。
  - Markdown 禁用原始 HTML 与远程图片，链接经过协议校验；旧版已保存的 A2UI 文本仍可重放。
- **多轮验证**：完成任意场景后发送追问，Mock 会以固定模板引用实际收到的历史 prompt 和 UI 语义事实；Trace 可检查完整请求参数。它不执行自然语言推理，也不调用外部模型。

---

### Level 2：工具可观测性与异常自愈 (Observability & Resilience)

#### 2. `server-health`（服务器健康指标诊断）
- **Prompt 示例**：`Check server health`
- **演示的核心能力**：
  - Agent 工具调用生命周期（`tool.started` $\to$ `tool.completed`）的完整可观测性。
  - 进度指示器（`LabProgress`）的实时百分比推进。
  - **组件与数据分离（Data Model Binding）**：`Card` 组件内的子文本通过 JSON Pointer 绑定到数据模型的路径（`text: { path: "/summary" }`）。
  - **事后动作（Post-run Action）**：卡片内包含 `View errors` 按钮，任务完成后用户仍可点击查询详细错误。
- **架构机制**：
  - 后端下发 `updateDataModel`（`path: "/", value: {"summary": "..."}`），协议引擎实现数据与组件解耦。
  - 用户点击 `View errors` 时，触发 `action.received`，Action Router 在服务端校验通过后下发错误明细，生成独立的 Surface。
- **设计哲学**：
  - Agent 不只是聊天机器人，它具备“调用外部工具、感知执行耗时、上报结构化状态”的全生命周期可观测性。

#### 3. `tool-error`（工具执行显式失败）
- **Prompt 示例**：`Diagnose server error`
- **演示的核心能力**：
  - 工具调用发生异常时的显式处理与优雅降级。
  - 系统的鲁棒性：底层工具失败不会导致服务崩溃或前端白屏。
- **架构机制**：
  - Agent 输出 `error.occurred` 语义事件，状态机捕获并标记 Run 状态为 `failed`。
  - 展示层将其映射为标准告警模型，A2UI 生成 `LabAlert`（带有无障碍辅助属性 `role="alert"`）。
  - 错误原因和参数全程持久化记录，支持后续完整审查与复盘。
- **设计哲学**：
  - 真实业务中工具失败是常态。Agent UI 必须将“失败”作为第一类公民对待，确保错误可解释、可审计、不破坏系统一致性。

---

### Level 3：生成式富媒体与渐进式流 (Generative UI & Progressive Stream)

#### 4. `image-card`（图文资源发现卡片）
- **Prompt 示例**：`Recommend an Agent UI resource`
- **演示的核心能力**：
  - 从纯对话文本平滑过渡到富媒体卡片生成（Generative Rich UI）。
  - **组件树动态生长**：叙述文本留在 Markdown 对话块，首个结构化结果创建 Surface 并挂载 `recommendation`。
- **架构机制**：
  - Agent 吐出领域语义事件 `resource.recommended`（包含图片路径、标题、外链）。
  - A2UI 采用扁平**邻接表（Adjacency List）**更新树拓扑，动态挂载 `LabImageCard` 组件。
  - 前端执行图片懒加载、安全协议校验（`safeLink`、`safeImage`）与加载失败兜底（`onError`）。
- **设计哲学**：
  - 叙述内容使用受控 Markdown 渲染，交互卡片使用经过验证的结构化协议，分别承担文本与交互职责。

#### 5. `image-list`（渐进式左图右文资源列表）
- **Prompt 示例**：`Find resources for building a local Agent UI lab`
- **演示的核心能力**：
  - **多结果渐进式到达（Progressive Arrival）**：检索结果逐一到达并即时渲染，消除长时间等待白屏。
  - **组件复用与布局变体**：同一组件通过属性差异（`layout: "row"`）实现形态切换。
- **架构机制**：
  - Agent 依次发送 `index: 0`、`index: 1`、`index: 2` 的资源。
  - 根容器 `Column` 随资源到达依次追加 `resource-0`、`resource-1`、`resource-2`；具体耗时可在当前轮 Trace 中查看。
  - 复用 `LabImageCard` 组件，但在 value 中注入 `"layout": "row"`，前端自动以“左图右文”横向排版展现。
- **设计哲学**：
  - 契合人类认知直觉：用户可以在后续条目还在搜索时，立即阅读和点击第一条结果。同时组件库保持小而美，通过属性驱动形态。

---

### Level 4：人机协同与双向闭环 (Human-in-the-Loop & Interactive Loop)

#### 6. `deployment-approval`（高危操作审批打断与恢复）
- **Prompt 示例**：`Prepare a staging deployment for my review`
- **演示的核心能力**：
  - **人机协同（HITL）暂停与唤醒**：Agent 遇到高危发布动作时主动挂起，进入低功耗 `waiting_input` 状态。
  - **双向意图闭环**：用户在 UI 点击 `Approve` / `Reject` $\to$ 触发标准 Action $\to$ 由服务端执行确定性的 Mock 后续动作。
  - **多画布（Multi-Surface）协同**：创建新的 `action-result` 画布展示部署回执，同时将原审批卡片置灰锁定（`disabled: true`）。
- **架构机制**：
  - Agent 触发 `approval.required`，Run 切换为 `waiting_input`，工作协程退出，等待外部驱动。
  - 用户操作提交标准信封 `POST /api/runs/{id}/actions`；
  - 服务端 Action Router 校验合法性后广播 `approval.resolved` 并由动作处理器执行 `deploy_staging_mock` 模拟工具。
  - A2UI 下发两条消息：一条创建 `surfaceId: "action-result"` 呈现凭据，另一条修改主画布组件为 `disabled: true`，彻底消除二次点击冲突。
- **设计哲学**：
  - 核心业务不能盲目让 Agent 自动全权操作。将人类决策作为可审计、可中断、可重放的明确环节纳入协议循环。

#### 7. `support-form`（声明式动态工单表单）
- **Prompt 示例**：`Help me open a support ticket`
- **演示的核心能力**：
  - **Schema 驱动的复杂表单生成（Schema-Driven Dynamic Form）**：动态渲染包含单行文本、邮箱输入、多行文本域及下拉枚举的完整表单。
  - **全链路严密校验**：长度限制、RFC 邮箱解析、枚举防篡改。
  - **表单状态持久化反填（Form Echo Back）**：提交后表单不仅锁定为只读，用户输入的数据还会原样反填持久化。
- **架构机制**：
  - A2UI 下发 `LabForm` 及其 `fields` 规范元数据（`name`、`label`、`type`、`maxLength`、`options`）。
  - 用户录入完毕提交后，后端校验通过并持久化领域实体 `ticket.created`。
  - A2UI 在更新组件时，将原本为 `null` 的 `values` 字段替换为用户实际提交的数据字典，并设置 `disabled: true`。
- **设计哲学**：
  - 解决回放真实性问题：由于表单反填了真实提交数据，历史记录即使在数月后重放，用户看到的也是当时所填写的完整真实表单，而非空白表单。

---

### 8. `plan-decision`（方案决策确认）

![推荐方案、备选与手动输入](images/plan-decision.png)

- **Prompt 示例**：`Analyze the API upgrade options and ask me to choose`
- **体验**：Agent 说明分析结论，场景文案统一使用英文。卡片提供“Incremental migration（Recommended）”“Full rebuild”与“Custom plan”。前两项点击即确认；方案3内直接输入方案或想法，点击该项内的“Confirm custom plan”提交。
- **语义与协议**：`decision.required` 携带候选项 ID、标题、说明与推荐标记，展示层映射为 `LabChoice`。服务端从持久化候选项白名单校验 `choose_plan`，并记录 `decision.resolved`。待选择时进入 `waiting_input`，确认后原卡片只读并出现结果 Surface。
- **持久化与上下文**：重启后仍可选择；相同请求重试幂等，冲突选择被拒绝。手动内容最多 500 个字符，提交后保存并进入后续模型语义上下文；未提交草稿仅保存在当前页面。Trace 展示原始 Action 与结果，回放不触发提交。
- **运行范围**：当前为确定性 Mock，仅记录确认结果，不执行真正的代码改造或外部工具。

---

## 三、八大场景能力横向对比矩阵

| 场景 ID | 演示名称 | 核心能力层级 | 主要 UI 组件 | Surface 数量 | 交互类型 | 关键架构特征 |
| :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| **`streaming-text`** | 流式文本 | **L1** | Markdown | 0 | 单向流式 | 文本增量缓冲，与 A2UI 共用事件序列 |
| **`server-health`** | 服务器健康 | **L2** | `LabToolCall`, `LabProgress`, `Card` | 1 $\to$ 2 | 事后动作 | 工具可观测性、数据模型单向绑定（`/summary`） |
| **`tool-error`** | 工具失败 | **L2** | `LabAlert` | 1 | 异常处理 | 显式失败事件映射，系统不崩溃、可审计重放 |
| **`image-card`** | 图文卡片 | **L3** | Markdown, `LabImageCard` | 1 | 静态富媒体 | 结构化领域事件、邻接表组件树动态扩展 |
| **`image-list`** | 资源列表 | **L3** | Markdown, `LabImageCard` (多实例) | 1 | 渐进式流式 | 搜索结果逐一到达渲染，`layout: "row"` 组件复用 |
| **`deployment-approval`**| 部署审批 | **L4** | `LabApproval`, `Text` | **2** | **双向中断/恢复** | HITL 挂起唤醒、意图路由白名单、卡片只读锁定 |
| **`plan-decision`** | 方案决策 | **L4** | `LabChoice` | **2** | 点击确认 / 手动输入 | 服务端候选项校验、幂等选择、后续会话上下文 |
| **`support-form`** | 工单表单 | **L4** | `LabForm`, `Text` | **2** | **双向数据收集** | Schema 驱动表单、服务端深度校验、表单内容持久化反填 |

---

## 四、Action Router 闭环与重放确定性

双向交互场景（Level 4）是 A2UI 最关键的闭环保障：

```text
[ 用户点击表单/审批按钮 ]
           ↓
   POST /api/runs/{id}/actions (action.Envelope)
           ↓
┌─────────────────────────────────────────────────────────────┐
│ 服务端 Action Router (internal/action/action.go)             │
│  1. 状态校验: Run 必须为 waiting_input (防止越权触发)         │
│  2. 场景白名单: 动作名/组件名与场景是否匹配                    │
│  3. 数据完整性: 长度截断、邮箱格式、枚举值校验                  │
│  4. 幂等防护: 相同动作幂等返回；冲突动作显式拒绝                │
└─────────────────────────────────────────────────────────────┘
           ↓
[ 原子批处理入库: action.received + 业务事件 + A2UI锁定消息 ]
           ↓
[ 前端 Surface 响应: 原交互卡片 disabled 且回填数据，新 Surface 呈现回执 ]
```

这一整套机制确保了：**无论在实时交互阶段，还是在离线重放（Replay）阶段，系统都处于完全确定性、安全受控的状态。**


## 五、多轮会话与 Trace

每个 run 是会话的一轮；**New run** 创建新会话，聊天底部 **Send message** 继续当前会话。后端保存历史并构建 `agent.Request`，前端不提交完整聊天 JSON。请求包含近期文本及经过筛选的 UI 语义事实，不包含完整组件树和联系表单字段。最近历史最多 8 轮，完整请求最多 32,000 个序列化 UTF-8 字节，省略信息记录在 Trace；单会话最多 100 轮。

**Trace turn** 可切换轮次，查看上下文构建、实际 Mock 请求、响应、工具、Action 与 A2UI 消息。历史轮组件只读；等待输入的表单和审批完成前不可创建下一轮。重放仅还原已保存事件，不发起模型请求。本版本明确显示 Mock 和未发生外部调用。

详见 [混合会话与 Trace 决策](decisions/0009-hybrid-conversations-and-traces.md)。
