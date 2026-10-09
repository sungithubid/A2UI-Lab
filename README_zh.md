# A2UI Lab

[English](README.md) | [简体中文](README_zh.md)

本地优先的流式 Agent UI 工程实验室：执行确定性场景，查看语义事件和 A2UI
协议，操作动态界面，并从 SQLite 事件日志重放整个运行。无需账号或 LLM 密钥。

```sh
make install
make dev
# 打开 http://localhost:5173
```

选择 Server health，输入提示，点击 New run。Mock Agent 逐步输出文本、工具调用、
进度和结果；独立 Presentation 层生成状态卡片。View errors 将标准动作提交到后端。
Protocol Inspector 查看原始 JSON、序号、时间、surface、校验和解析状态；Timeline
展示整个事件流。Reset / Step / Play 只消费已保存事件，Live 返回当前状态。
运行历史在重启后保留。Mock 输出固定，不会根据提示调用真实服务器。

Delete run 删除选中的非运行中记录；Delete all runs 会先弹窗确认，再停止运行中的任务，
清空全部运行及其事件，包括等待表单/确认的记录和当前列表未显示的历史。
Protocol Inspector 中间的横向分隔线可拖动调整上下区域高度，并在当前浏览器中记住比例。
聚焦分隔线后可用上下方向键微调、Home/End 调至边界，双击恢复默认比例。

当前共七个场景：服务器健康、流式文本、工具失败、可跳转图片卡片、左图右文资源列表、
支持工单表单、部署确认。图片是随二进制打包的本地插画，链接在新标签打开官方文档。
表单校验姓名、邮箱、问题描述和优先级，提交结果只保存在本次运行中。部署确认支持批准/拒绝，
仅批准后记录模拟执行；不会部署真实服务。表单和确认在 waiting_input 状态等待，重启仍可继续，
处理后变为只读，结果可重放；相同重试不重复执行，相反决定会被拒绝。仅实现首个确定性纵向切片；Eino、
OpenAI-compatible 模型、真实 Agent 中断/恢复、Intent/Generative 和原始 JSON 编辑器后续实现。

开发需要 Go 1.27.1+ / Node 24；生产运行只需一个内嵌前端和迁移的 Go 二进制。

```sh
make build
./bin/a2ui-lab serve
./bin/a2ui-lab config show
./bin/a2ui-lab doctor
./bin/a2ui-lab backup create --output /absolute/path/backup.db
make test
make verify
```

配置见 `.env.example`。优先级为进程环境 > `.env` > 默认值，`APP_ENV_FILE=-`
禁用文件加载。默认存储在系统用户配置目录下的 `a2ui-lab`，开发模式使用 `.data`。
只允许监听 loopback IP，默认 `127.0.0.1:8080`。应用没有鉴权；远程部署需自行配置
带鉴权的反向代理，production 仍要求 HTTPS Origin。备份必须使用 CLI，不能直接复制 WAL 主文件。

架构：Agent → 语义事件 → Presentation → A2UI → Renderer → Action Router。
使用当前生产版 A2UI v0.9.1 的明确子集和独立 Lab catalog，不宣称完整 Basic Catalog 支持。
详情见 [架构](docs/architecture.md)、[场景与演进阶梯](docs/scenarios.md)、[开发](docs/development.md)、[协议子集](docs/protocol.md)。

迁移 00003 新增 runs/events。旧 Monoseed 迁移和数据库中的旧数据保留，旧账号、
Workspace、Notes 页面/API 和 admin CLI 已移除。升级旧库前请备份；新默认目录不会自动导入旧目录，
需要迁移旧库时显式指定 `APP_DATA_DIR`。

完整验证包含生成物漂移、Go vet/race、TS/ESLint/Vitest、构建、真实二进制重启测试和 Playwright。
测试使用临时数据库，不读取个人 `.env`，不需要任何外部模型。
