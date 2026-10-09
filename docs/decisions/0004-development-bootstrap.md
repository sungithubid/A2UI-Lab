# 0004 — Opt-in development bootstrap and loopback origins

Status: accepted · 2026-10-09

**Context.** A new developer sees a login page without a prepared account. Vite advertises 127.0.0.1 while APP_ORIGIN uses localhost, causing otherwise valid local login requests to fail Origin validation.

**Decision.** Provide optional development-only startup credentials in the existing configuration layer. Only serve bootstraps them through the Auth service's atomic user/workspace creation. Retain existing identities and passwords. Redact passwords from config inspection and omit them from logs. For local HTTP development, trust localhost and 127.0.0.1 on the configured port; keep exact matching for production/test and all remote origins, and preserve CSRF token validation.

**Consequences.** Developers can initialize an account with `.env` and `make dev`, with no hard-coded default credentials. Repeated starts are idempotent; changing a configured password cannot reset an existing account. CLI inspection and migration commands remain free of identity creation. Switching hostnames requires another login because cookies are host-specific. No public signup, production bootstrap or superuser bypass is introduced.
