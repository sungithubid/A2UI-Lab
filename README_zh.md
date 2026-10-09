# Monoseed

[English](README.md) | 简体中文

一个以源码二次开发为核心、面向 AI Coding Agent 的 SaaS Starter Kit：使用 Go + React + SQLite，最终部署为**单个可执行文件**。Notes 是完整的业务参考模块，新增功能时可以沿用它的实现路径。

## 快速开始

开发环境需要 **Go 1.27.1+**、**Node 24**（可执行 `nvm install && nvm use`）、npm 和 make。验证流程中的 Go race 检测需要 C 编译器；生产程序使用 `CGO_ENABLED=0` 构建，运行时无需 Node.js、Redis 或独立数据库服务。Linux 下，Playwright 可能需要安装浏览器系统依赖：`cd web && npx playwright install --with-deps chromium`。

```sh
make install
make build
export APP_DATA_DIR="$HOME/.local/share/monoseed"
./bin/myapp admin create --email owner@example.com --workspace '我的工作空间'
./bin/myapp serve
```

管理员创建命令会提示输入密码，输入内容不会显示，长度要求为 12–72 字节。打开 **http://localhost:8080**，登录后即可创建笔记，并在侧边栏创建和切换工作空间（Workspace）。项目默认关闭公开注册；每个通过 CLI 创建的用户都会获得一个拥有 `owner` 角色的工作空间。

自动化场景可以将密钥管理工具输出的密码通过标准输入传给 `admin create --email … --password-stdin`。不要将密码作为命令行参数。测试仅在隔离的临时环境中使用固定的测试账号和密码。

## 本地开发

```sh
make dev
```

访问 **http://localhost:5173** 或 **http://127.0.0.1:5173**。Vite 会将 `/api` 请求代理到 `127.0.0.1:8080` 的 Go 服务，React 支持 HMR。修改 Go 代码后需要重新启动 `make dev`。

开发模式默认使用当前项目内 `.data` 目录的绝对路径。在另一个终端中，用相同的数据目录初始化管理员：

```sh
APP_DATA_DIR="$PWD/.data" ./bin/myapp-dev admin create --email owner@example.com
```

`make dev` 也会读取根目录 `.env`。如果环境变量或文件中配置了 `APP_DATA_DIR`，管理员初始化命令也必须使用相同目录。

为配合本地 Vite 代理，开发脚本固定使用以下设置：

- `APP_ENV=development`
- `APP_ADDR=127.0.0.1:8080`
- `APP_ORIGIN=http://localhost:5173`
- `APP_COOKIE_SECURE=false`

日志、超时和其他设置仍可配置。独立运行的 Go CLI 默认使用 `os.UserConfigDir()/monoseed`，数据目录不依赖当前工作目录。部署时应显式设置稳定的绝对数据路径。

### 启动时自动初始化开发账号

项目没有内置的默认账号密码。可以在 `.env` 中添加：

```dotenv
APP_DEV_ADMIN_EMAIL=admin@example.com
APP_DEV_ADMIN_PASSWORD=local-dev-password-123
APP_DEV_ADMIN_WORKSPACE=Development
```

重新启动 `make dev`，就能使用这里设置的邮箱和密码登录。密码必须为 12–72 字节。上述配置是可选的，仅允许在 `APP_ENV=development` 下使用；`serve` 启动时会在接收请求前，原子地创建用户和拥有 owner 角色的工作空间。

如果同邮箱账号已经存在，会保留原账号及其密码，不会重复创建工作空间。因此修改 `.env` 中的密码不会重置已有账号密码。清空邮箱和密码两个配置项即可关闭自动初始化。`config show`、`migrate`、`doctor` 等 CLI 命令不会创建开发账号。配置展示会隐藏密码，启动日志也不会打印密码。

本地 HTTP 开发模式接受配置端口下的 `localhost` 和 `127.0.0.1`，其他主机或端口仍被拒绝，写请求仍需要 CSRF Token。生产和 test 环境保持精确 Origin 匹配。两个地址的 Cookie 独立，切换访问地址后需要重新登录。

| 命令 | 用途 |
| --- | --- |
| `make install` | 下载 Go 依赖，通过 `npm ci` 安装前端依赖及 Chromium |
| `make dev` | 构建 Go 开发服务，同时启动 Go 和 Vite |
| `make fmt` | 使用 gofmt 和 Prettier 格式化代码 |
| `make sqlc` | 从 SQL 查询与 goose 迁移生成类型安全的 Go 代码 |
| `make sqlc-check` | 检查 SQL 生成代码是否一致，不改写现有产物 |
| `make types` | 导出 Huma OpenAPI，并生成 TypeScript 类型 |
| `make test` | 执行 Go 测试和 Vitest |
| `make verify` | 执行完整质量门禁，包括构建、冒烟和 E2E |
| `make build` | 先构建前端，再以 CGO 禁用模式生成 `bin/myapp` |
| `make smoke` | 重新构建并验证独立二进制运行及重启持久化 |
| `make e2e` | 重新构建，在全新测试环境中执行 Chromium E2E |

修改代码后必须执行 `make verify`。Go 检查显式覆盖 `cmd` 和 `internal`，避免将 `node_modules` 内第三方包附带的 Go 文件纳入项目测试。

## 配置与运维

完整配置项、默认值、单位和生产示例均列在 **[.env.example](.env.example)** 中：

```sh
cp .env.example .env
# 编辑 .env 后，查看合并和校验后的生效配置；此命令不会打开数据库。
./bin/myapp config show
./bin/myapp serve
```

Go CLI 会自动读取当前工作目录中的 `.env`。优先级为 **进程环境变量 > `.env` > 内置默认值**；显式空值会选择内置默认值。`.env` 是可选文件，已加入 Git 忽略规则。

从其他目录启动时，可以在进程环境中设置 `APP_ENV_FILE=/absolute/path/.env`。显式指定的文件不存在时会报错；设置 `APP_ENV_FILE=-` 可以禁用文件加载。这个选择器仅从进程环境读取，配置文件不能通过自身的 `APP_ENV_FILE` 重定向加载路径。项目不自动叠加 `.env.local` 或 `.env.production` 等文件。

配置文件使用字面值，数据路径必须是绝对路径，不要写入 `$HOME`、`~` 等 shell 替换表达式。上面的快速开始命令在 shell 中执行，因此可以使用 `$HOME`；这与在 `.env` 文件中填写路径不同。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_DEV_ADMIN_EMAIL` / `APP_DEV_ADMIN_PASSWORD` | 空 | 可选的开发启动账号；配置展示会隐藏密码 |
| `APP_DEV_ADMIN_WORKSPACE` | `Development` | 初始化开发账号时的工作空间名称 |
| `APP_ENV` | `development` | 可选 development、test、production；production 要求 HTTPS 和 Secure Cookie |
| `APP_ADDR` | `127.0.0.1:8080` | HTTP 监听地址 |
| `APP_DATA_DIR` | 系统用户配置目录下的 `/monoseed` | 持久化数据目录，必须是绝对路径 |
| `APP_ORIGIN` | `http://localhost:8080` | 浏览器访问的精确 Origin，不带末尾 `/` |
| `APP_LOG_LEVEL` / `APP_LOG_FORMAT` | `info` / `json` | 日志级别 debug/info/warn/error；格式 json/text |
| `APP_COOKIE_SECURE` | `false` | 使用 HTTPS 时必须为 true |
| `APP_SESSION_TTL` | `168h` | 会话有效期，至少 1 秒 |
| `APP_HTTP_READ_HEADER_TIMEOUT` | `5s` | 读取请求头的最大时间 |
| `APP_HTTP_READ_TIMEOUT` | `15s` | 读取整个请求（包括请求体）的最大时间 |
| `APP_HTTP_REQUEST_TIMEOUT` | `30s` | 请求处理的总体截止时间，超时返回 503 |
| `APP_HTTP_WRITE_TIMEOUT` | `35s` | 写响应的最大时间，必须大于请求处理超时 |
| `APP_HTTP_IDLE_TIMEOUT` | `60s` | Keep-Alive 连接的空闲等待时间 |
| `APP_HTTP_SHUTDOWN_TIMEOUT` | `10s` | 优雅关闭等待时间 |
| `APP_HTTP_HEALTH_TIMEOUT` | `2s` | 数据库就绪检查的截止时间 |
| `APP_HTTP_MAX_HEADER_BYTES` | `1048576` | 请求头限制，单位为字节，最大 16 MiB |
| `APP_HTTP_MAX_BODY_BYTES` | `131072` | 全局请求体限制，单位为字节，最大 64 MiB；API 自身更小的限制仍然生效 |

时长采用 Go duration 语法，例如 `500ms`、`15s`、`2m`、`168h`，不支持 `7d`。所有超时必须为正数；非法设置会阻止启动，并在错误中指出变量名。读取整个请求的超时不能小于读取请求头的超时，健康检查超时不能大于请求处理超时。

配置在启动时读取，修改后需要重启。环境名称不会关闭认证，也不会自动改变日志或超时的默认值。

远程访问的 Origin 必须使用 HTTPS。生产环境设置 `APP_ENV=production`，通过 TLS 反向代理提供访问，并配置 `APP_ORIGIN=https://your-domain.example` 和 `APP_COOKIE_SECURE=true`。Go 程序应监听回环地址或私有网络接口，TLS 由外部代理终止。

程序默认不信任转发的客户端 IP 请求头，因此同一代理后的客户端会共享内置的登录限速桶。公开部署时，可在代理层额外配置按客户端 IP 限速。

```sh
./bin/myapp version
./bin/myapp migrate
./bin/myapp doctor
./bin/myapp backup create --output /absolute/new-backup.db
```

应用启动前也会自动运行迁移，迁移失败会停止启动。`doctor` 会打开并迁移配置的数据库，然后检查 WAL、外键、busy timeout 和数据库完整性。

备份通过 SQLite `VACUUM INTO` 创建一致性快照，支持在线执行，并拒绝覆盖已有文件。备份包含密码哈希和有效会话，应妥善保管。恢复时先停止所有应用进程，保留原数据目录，新建私有目录，将快照复制为 `app.db`，然后把 `APP_DATA_DIR` 指向新目录。不要将恢复后的数据库与旧的 `-wal`、`-shm` 文件混用。

程序处理 SIGINT/SIGTERM 并执行优雅关闭，等待时间可配置，默认为 10 秒。健康检查接口为 `/healthz`（进程）和 `/readyz`（数据库），Huma OpenAPI 地址为 `/api/openapi.json`。

会修改数据的 API 请求必须携带受信任的 `Origin`（本地开发之外要求与配置值精确匹配）；登录后还必须在 `X-CSRF-Token` 请求头中携带登录接口或 `/api/auth/me` 返回的 Token。会话默认七天过期，退出登录会立即撤销会话。

## 项目结构

```text
cmd/app/                        CLI 入口
internal/app/                   依赖组装与 HTTP 生命周期
internal/platform/              配置、SQLite、迁移、HTTP、安全与错误处理
internal/modules/auth/          用户、bcrypt、会话与登录保护
internal/modules/workspace/     成员关系、工作空间列表与创建
internal/modules/notes/         Handler → Service → Repository 参考模块
internal/webui/                 嵌入的生产静态资源与 SPA 回退
web/src/app/                    前端路由与布局
web/src/features/               登录、概览、笔记、工作空间与账号页面
web/src/components/ui/          项目内维护的 shadcn/ui 基础组件
web/src/generated/              自动生成的 OpenAPI 类型
scripts/                        开发、类型生成、冒烟与隔离测试服务脚本
tests/e2e/                      浏览器工作流与租户隔离测试
AGENTS.md                       AI Agent 贡献规范
docs/                           架构、开发流程、ADR 与 OpenAPI 文档
```

## 功能范围

已实现：安全登录与退出、多工作空间成员关系、Notes CRUD 与分页、账号页面、响应式界面、通知、类型安全 API、SQLite 备份、生产静态资源缓存、测试和 AI 开发规范。

系统持久化 `owner`、`admin`、`member` 三种角色，三者目前均可操作所属工作空间的 Notes。没有绕过工作空间授权的全局超级管理员。CLI 初始化的是拥有工作空间的 owner。

首版尚未实现邀请、成员管理、密码重置与修改、MFA、SSO、公开注册、计费、审计历史和并发编辑冲突处理。工作空间支持创建、列表和切换，尚不提供删除等管理操作。登录限速状态保存在进程内。支持的部署方式为单实例访问本地 SQLite 数据库，不支持多个副本或网络存储上的共享数据库。

Jobs、内容寻址存储（CAS）和 LLM/Agent 集成保留了文档中的扩展边界，尚未实现。后续开发可参阅 [架构说明](docs/architecture.md)、[开发流程](docs/development.md)、[架构决策](docs/decisions/README.md) 和 [AGENTS.md](AGENTS.md)。

实际执行的本地验证结果记录在 [验证记录](docs/verification.md) 中。

## UI 组件与国际化

本地维护的 shadcn/ui 风格组件集合包含 Dialog、DropdownMenu、Select、Tabs、
Table/DataTable、Badge 和 Avatar。笔记页面演示弹窗编辑、操作菜单、卡片/表格切换、
服务端分页及当前页排序，工作空间选择与创建也使用了这些组件。

界面支持简体中文与英文。首次访问按浏览器首选语言自动选择；登录页与侧栏的语言菜单
支持手动切换，并记住本机选择。工作空间名称和笔记内容保留原文。
组件用法、分页语义、语言识别规则及添加翻译方式见 [前端开发指南](docs/frontend.md)。

## sqlc 类型安全 SQL

Auth、Workspace、Notes 仓储已使用 sqlc 生成的 `database/sql` 查询。修改各模块的
`queries.sql` 后执行 `make sqlc`；`make verify` 会检查生成代码是否与源码一致。
生成器版本和校验和锁定在独立的 `tools/sqlc` Go 模块中，应用构建和运行不需要 sqlc
程序，也不增加 sqlc 运行时依赖。数据库迁移仍由 goose 执行。
具名参数、事务及新增模块流程见 [SQL 开发指南](docs/sqlc.md)。
