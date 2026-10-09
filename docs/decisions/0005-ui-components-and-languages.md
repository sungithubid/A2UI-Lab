# 0005: Composable UI primitives and bundled translations

Status: accepted

The starter needs reusable administration UI without another application framework.
Keep locally styled shadcn/ui-style wrappers over Radix primitives. Add only components
used by the existing vertical slice: dialogs, menus, selects, tabs, tables, badges and
avatars. Radix owns accessibility behavior; feature modules own forms, mutation state
and focus restoration for externally opened dialogs.

Use TanStack Table v8 for typed column definitions, sorting and pagination. Notes retains
its existing server pagination contract. The UI explicitly labels sorting as current-page
sorting; global sorting requires a future API change. The library's React Compiler
compatibility lint warning is expected: this project does not enable React Compiler,
and the table instance is consumed within its component without memoization.

Use i18next/react-i18next with bundled English and Simplified Chinese resources. Resolve
an explicit stored choice before browser language preferences, falling back to English.
Store only manual overrides and synchronize HTML's language. No language server,
network-loaded catalog or account schema change is needed. English phrases act as keys;
a typed Chinese catalog and tests enforce parity and interpolation placeholders.
API errors remain language-neutral on the wire; presentation maps statuses to localized
messages. User content is not translated.

Consequences: more frontend dependencies and a larger asset bundle, but no runtime
services or Go dependency changes. Existing API DTOs and tenant isolation are unchanged.
See [frontend guide](../frontend.md) for usage and language extension instructions.
