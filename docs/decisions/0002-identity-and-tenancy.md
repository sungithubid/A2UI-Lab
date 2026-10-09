# 0002 — Server-side sessions and explicit tenant predicates

Status: accepted · 2026-10-08

**Context.** The example must be safe to copy, and authorization must survive forged IDs, multiple memberships and revoked access.

**Decision.** Use bcrypt, random opaque session cookies with hashed database tokens, independent synchronizer CSRF tokens and strict Origin validation. Initialize owners by CLI only. Every service operation checks live membership; every business repository query includes workspace_id. Notes allows all three membership roles to collaborate. Keep per-IP login limits in-process and ignore forwarded IP headers by default.

**Consequences.** Logout/revocation are effective immediately; session lookups cost a small indexed SQLite read. A UI workspace selector conveys no authority. Proxy deployments need an additional trusted edge rate limit if distinct clients share a socket IP. Membership invitations/editing, password recovery, MFA and global superuser privileges are outside the initial scope.
