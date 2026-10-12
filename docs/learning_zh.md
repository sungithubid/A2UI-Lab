# P0：交互教学基线

[English](learning.md) | [简体中文](learning_zh.md)

本阶段帮助开发者沿着一个实际交互，追踪前端请求、后端事件、展示映射、
Action 和下一轮上下文。9 个场景共用同一链路，全部是本地 Mock：
场景 ID 决定固定行为，prompt 不经过真实模型推理，messages 预览也不是外部 HTTP 请求。

![Learning lab：事件检查点与相同 Action 重试](images/learning-lab.png)

## 从一个完整闭环开始

1. 执行 `make dev`，选择 **Decision · implementation plan**，点击 **New run**。
2. 展开 **Learning lab**。点击事件检查点，在 Protocol Inspector 查看实际保存的 JSON；
   当前事件前缀中还没有发生的检查点不可点击。
3. 查看 `model.request`，核对确实传给 Mock 的应用请求；Trace 另提供 role/content 预览。
   查看 `decision.required`，找到服务端拥有的候选项 ID。
4. 点击推荐/备选方案，或者在方案 3 内输入并提交。查看 `action.received`、
   `decision.resolved`、`action.completed`；原卡片变为只读。
5. 点击 **Retry last Action**，发送同一份已保存的信封。返回的事件序号保持不变，
   不产生第二份确认结果。
6. 发送追问，在 Trace 的 **Build context** 和 **Agent request · Mock** 中核对：
   上一轮选择成为对应轮次的语义事实，不传整个 UI 树。
7. 刷新后选中原 Run，再 Reset/Step/Play。保存的消息和只读结果被还原，
   不重新提交选择，也不调用 Agent。

## 五个问题对应的代码入口

| 问题 | 实际契约 | 代码 |
| --- | --- | --- |
| 前端提交什么？ | 新 prompt/scenario；追问另带 conversationId/parentRunId，不上传完整历史 | [lab-page.tsx](../web/src/features/lab/lab-page.tsx)、[experiment.tsx](../web/src/features/lab/experiment.tsx)、[handler.go](../internal/modules/lab/handler.go) |
| 后端保存什么？ | 会话、轮次及统一事件日志；每个批次与状态更新同事务 | [repository.go](../internal/modules/lab/repository.go)、[queries.sql](../internal/modules/lab/queries.sql) |
| Agent 收到什么？ | 后端从历史文本、允许的领域事实构造应用 Request | [agent.go](../internal/agent/agent.go)、[context.go](../internal/modules/lab/context.go) |
| 输出如何变成 UI？ | 语义事件 → 展示模型 → Markdown / A2UI → 纯 reducer → 组件注册表 | [presentation.go](../internal/presentation/presentation.go)、[protocol.go](../internal/a2ui/protocol.go)、[chat.ts](../web/src/lib/chat.ts)、[renderer.tsx](../web/src/features/renderer/renderer.tsx) |
| 交互如何进入下一步？ | 服务端校验 Action，原子保存结果和只读 UI；后续请求读取语义事实 | [action.go](../internal/action/action.go)、[Service.Action](../internal/modules/lab/service.go)、[context.go](../internal/modules/lab/context.go) |

前端拥有交互控件，后端拥有业务执行、能力白名单、历史和生命周期。
移植代码时应一起复制一个完整纵向切片，而不是只复制卡片样式。

## 每个场景的移植配方

以下场景都从 `POST /api/runs` 开始，提交非空 prompt 与 scenarioId。
列出的事件是观察检查点，不是全部事件，也不约定固定 seq。

| 场景 | 持久化输出 → 展示 | 前端交互 | 下一轮上下文 |
| --- | --- | --- | --- |
| streaming-text | model.text_delta → text-delta → Markdown；不创建 Surface | 无业务 Action；Stop run 使用独立生命周期接口 | 用户 prompt 与已保存文本；停止后携带 interrupted 状态 |
| server-health | tool.started / agent.progress / tool.completed → 工具、进度、结果与绑定 /summary 的 Card | main / view-errors / view_errors，data 为空 | 文本、工具结果、Action 结果 |
| tool-error | 工具启动后 error.occurred → LabAlert；run.failed | 无 Action | 部分文本、错误事实、failed 状态 |
| stream-error | 先输出不完整 Markdown，再 error.occurred → LabAlert；run.failed | 无 Action | 不完整文本、mock_stream_disconnected 错误事实与 failed 状态 |
| image-card | resource.recommended → image-card → LabImageCard | 安全链接直接由浏览器导航，不调用 Action API | 资源领域事实，不传组件树 |
| image-list | resource.found 逐条到达 → image-row → 同一 Surface 的左图右文卡片 | 浏览器链接导航 | 按保存顺序组织的资源事实 |
| support-form | input.required → form → LabForm；run.waiting_input | main / ticket-form / submit_ticket；name、email、summary、priority | 表单用途和工单成功结果；提交的联系字段不进入模型上下文 |
| deployment-approval | approval.required → approval → LabApproval；run.waiting_input | main / deployment-confirmation / decide_deployment；decision 为 approve/reject | 审批结果和本地模拟结果；拒绝后为 cancelled |
| plan-decision | decision.required → choice → LabChoice；run.waiting_input | main / plan-decision / choose_plan；choiceId，custom 时另带 text | 候选项和已确认结果；提交的自定义文本会进入后续上下文 |

场景固定数据：[mock.go](../internal/agent/mock/mock.go)、
[scenarios.go](../internal/agent/mock/scenarios.go)。
交互协议与只读结果：[interactive.go](../internal/a2ui/interactive.go)。
前端控件：[interactive.tsx](../web/src/features/renderer/interactive.tsx)。
所有场景均不把 Trace 或 A2UI 树作为历史上下文。普通 prompt 原样保存，
联系字段排除规则不等于通用隐私/秘密检测。

## 请求示例与校验边界

追问只提交以下数据：

```json
{
  "prompt": "Continue with the plan I confirmed",
  "scenarioId": "streaming-text",
  "conversationId": "<会话 ID>",
  "parentRunId": "<最新已结束 Run ID>"
}
```

推荐方案提交 `POST /api/runs/{id}/actions`：

```json
{
  "version": 1,
  "runId": "<Run ID>",
  "surfaceId": "main",
  "componentId": "plan-decision",
  "category": "tool",
  "action": "choose_plan",
  "data": { "choiceId": "incremental" }
}
```

自定义方案的 data 改为 `{"choiceId":"custom","text":"Migrate read APIs first."}`。
标题与推荐标记读取已保存的候选定义，不能由客户端伪造。
当前最新轮次的同一份有效信封重试返回原结果；改变选择返回 409；
非法字段返回 422。这些拒绝请求不追加 accepted Action 或结果事件。
当前是一个 Run 的单次交互契约，不是通用幂等键系统。出现下一轮后，
上一轮所有 Action，包括重试，都被拒绝。

## 异常练习及验收证据

| 练习 | 操作 | 应观察到 |
| --- | --- | --- |
| 部分输出失败 | 运行 stream-error，等待失败，再单步/播放/刷新 | 文本先于错误保存，尾部缓冲不丢失；告警和 run.failed 可恢复；回放不追加事件 |
| 主动停止 | streaming-text 输出中点击 Stop run | /stop 保存 runtime.stop_requested，取消并等待 worker 退出，刷出已收到的文本，通常以 run.interrupted 结束 |
| SSE 断开与重连 | streaming-text 输出中点击 Disconnect SSE，等待后点击 Reconnect SSE | 后端继续执行；新 EventSource 用连续前缀的 ?after=N 补齐遗漏，不重复拼接文本 |
| 相同 Action 重试 | 先完成表单/审批/选择，再 Retry last Action | 返回相同结果，权威 lastSeq 不变，不生成第二份结果或模拟操作 |
| 冲突选择 | 下一轮之前，将已保存 choose_plan 的 choiceId 改成另一个有效选项提交 | 409，原选择、只读卡片及事件日志不变 |
| 非法输入 | REST 提交空 custom 文本、未知 ID、伪造表单字段 | 422，仍可正常完成待交互场景，不保存 accepted Action |
| 待输入恢复 | 场景进入 waiting_input 后重启 make dev，选中 Run | 仍可提交；这里没有真实模型 checkpoint 或恢复推理 |
| 执行中恢复 | 在隔离数据库上，执行中终止进程后重启 | 启动追加 run.interrupted，保存前缀可读取；正常关闭则取消并等待 worker |
| 历史只读 | Reset/Play，或选择较早轮次 | Stop、Action 重试、SSE 练习均不可触发业务变更 |

停止响应以实际保存状态为准：正常完成若先于取消，可能返回 completed/failed。
已 interrupted 的停止请求幂等；completed/failed/waiting_input 返回 409。
取消已接受后即使 HTTP 调用方断开，worker 仍完成持久化，可查询 Run 确认结果。
与其他变更接口一样，POST /stop 即使没有请求体，也必须携带
Content-Type: application/json；Host/Origin 检查照常执行。

Disconnect SSE 只关闭实时 EventSource；REST 读取、显式提交仍可工作，
不是全局网络离线模拟。浏览器自动重连使用 Last-Event-ID；手动创建新连接没有该头，
所以通过 after 查询参数恢复。服务端同时收到两者时优先使用 Last-Event-ID。
缓存存在事件缺口时不能用最大 seq，否则可能永久跳过遗漏。

未提交草稿、网络连接状态、重试练习的反馈属于本地界面状态，
不是持久化聊天输出。原始事件可以通过 GET /api/runs/{id}/events?after=0 查看，
每页最多 1000 条，用最后一条 seq 继续分页。

## 验证与下一阶段边界

前端复用生成的 REST 类型、事件信封、连续前缀/去重逻辑、聊天 reducer 和受控注册表；
工具业务留在服务端。后端复用一个场景的语义类型、展示映射、白名单、
事务和上下文规则。替换 Mock 不应要求修改前端 Action 或 A2UI 契约。

执行 `make fmt`、`make test`、`make verify`。
P0 新增验证入口：[resilience_test.go](../internal/modules/lab/resilience_test.go)、
[use-events.test.tsx](../web/src/features/lab/use-events.test.tsx)、
[learning.spec.ts](../tests/e2e/learning.spec.ts)。
既有交互测试验证并发重试、输入校验、服务恢复及历史过滤。
全部使用隔离临时数据库，不需要模型凭据。

P0 完成确定性交互教学；真实 Provider 请求、流式归一化和模型工具闭环属于 P1/P2，
真实 Agent checkpoint 恢复属于后续阶段。
