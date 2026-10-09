# 0003 — Visible, validated environment configuration

Status: accepted · 2026-10-08

**Context.** HTTP deadlines were hard-coded and available environment settings were difficult to discover. Developers need a copyable configuration catalog and a way to inspect effective values.

**Decision.** Add root `.env.example`, typed HTTP settings, explicit validation and a side-effect-free `myapp config show`. Use the small, pinned godotenv parser for optional file loading, followed by process overrides; avoid a general configuration framework or global environment mutation. Development uses Node's native env-file loader and the documented portable literal-value syntax. `APP_ENV_FILE=-` disables files, while explicit missing paths fail. A production label requires HTTPS and Secure cookies. Huma's body caps must respect the global cap and its default body deadline must not override the configured net/http deadline.

**Consequences.** Existing built-in defaults remain unchanged. Configuration errors fail before opening the database. Operators can use process environment only or select a stable absolute file path. File loading is working-directory-sensitive only when using the optional `.env` default; persistent data paths stay absolute. No configuration reload, automatic file cascade or unused backend settings are introduced. Tests and schema generation explicitly isolate themselves from personal configuration. The public configuration listing is an explicit non-secret allowlist, not a dump of the process environment.
