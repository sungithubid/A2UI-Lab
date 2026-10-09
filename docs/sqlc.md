# sqlc 开发指南

仓储使用 sqlc 生成的类型安全查询，仍基于标准库 `database/sql` 和 modernc SQLite。
应用 `go.mod` 不包含 sqlc；生成器锁定为 v1.31.0，依赖和校验和单独保存在
`tools/sqlc/go.mod`、`go.sum`。第一次生成需要下载和编译开发工具，后续使用 Go 缓存。
`make install` 也会下载工具依赖。构建和部署使用已生成的源码，不要求安装全局 sqlc。

## 文件与命令

- `sqlc.yaml`：SQLite 引擎、现有 goose 迁移目录、各模块查询及生成路径。
- `internal/modules/{auth,workspace,notes}/queries.sql`：手写并评审的 SQL。
- 对应模块 `dbgen/`：生成的查询、参数和结果类型；禁止手改。
- `repository.go`：调用查询，管理事务，转换领域错误与 API 模型。
- `make sqlc`：在临时目录生成，成功后更新模块 dbgen，清理已过期产物。
- `make sqlc-check`：临时生成并比较文件集合和内容，发现缺失、多余或漂移即失败；不改写源码。
- `make verify`：先检查 SQL 生成产物，再执行 API 漂移与完整测试。

配置的 schema、queries、out 使用示例中的单行相对路径。新增模块时复制一个 sql 配置块，
将 queries/out 指向该模块；无需复制迁移或新增另一份 schema。文件名保持零填充数字排序。
sqlc 从迁移的 Up 部分推断表结构；运行时仍由 goose 应用迁移，生成过程不连接数据库。

## 具名 SQL 参数

```sql
-- name: GetNote :one
SELECT * FROM notes
WHERE workspace_id = sqlc.arg(workspace_id) AND id = sqlc.arg(id);
```

```go
row, err := r.queries.GetNote(ctx, dbgen.GetNoteParams{
    WorkspaceID: wid,
    ID: id,
})
```

sqlc 管理占位符编号、参数绑定、字段类型、Scan、行迭代与关闭。
新增数据库字段或修改查询后运行 `make sqlc`；编译器能检查生成接口与调用方的类型一致性。
参数仍应使用具名结构体字段，不要改成位置式结构体字面量。

Notes 创建/更新使用 `RETURNING *`，返回实际持久化的记录。更新同时包含 workspace_id
和 id 条件，查不到返回 sql.ErrNoRows；仓储转换为 fault.ErrNotFound。删除使用 :execrows，
零影响行转换为同样的领域错误。认证查不到记录转换为 ErrUnauthorized，成员关系查不到
转换为 ErrForbidden。不要把 SQL 错误直接当作 HTTP 错误，也不要在 handler 执行 SQL。

## 事务与模型边界

通过 `db.BeginTx` 开启事务，`queries.WithTx(tx)` 将所有查询绑定到同一个事务；保留
`defer tx.Rollback()` 和成功路径 `tx.Commit()`。身份、工作空间与 owner 成员关系必须
原子创建；会话清理、数量限制和插入也在同一个事务中。Notes 分页的 count/list 保持
同一个只读事务，避免读取不同快照。

API DTO 仍由业务模块声明，仓储通过具名字段转换。这样数据库新增内部字段不会自动
暴露到 API，也不会把密码哈希等持久化信息误序列化。sqlc 消除手写 Scan 和参数位置映射，
但不会代替输入校验、业务模型设计或权限校验。所有业务查询继续明确约束 workspace_id，
服务层继续先验证成员关系。

## 验证与升级

新增/修改迁移和查询后执行 `make sqlc`、`make fmt`、`make verify`，将 SQL 与生成文件一并提交。
需要修改 API DTO 时，另外执行 `make types`。不得修改已经应用的迁移。

升级生成器：在 tools/sqlc 目录执行 `go get -tool github.com/sqlc-dev/sqlc/cmd/sqlc@版本`，
更新工具 go.mod/go.sum，重新生成并验证；不要更新应用的 go.mod 来安装开发工具。

参考：[官方 SQLite 教程](https://docs.sqlc.dev/en/latest/tutorials/getting-started-sqlite.html)、
[迁移解析](https://docs.sqlc.dev/en/latest/howto/ddl.html)、
[事务](https://docs.sqlc.dev/en/latest/howto/transactions.html)。
