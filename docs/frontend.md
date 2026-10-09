# Frontend

React 19, Vite, TanStack Query/Router, Tailwind and local shadcn-style controls remain.
`features/lab` orchestrates experiments and SSE. `features/renderer` is an independent
component registry with error boundaries. `features/inspector` exposes protocol data;
the timeline shows the complete normalized stream. `lib/events` orders/deduplicates
observations; `lib/a2ui` validates and reduces a contiguous event prefix. Replay uses
that same pure reducer with reset/step/play controls and disables server actions.

REST DTOs are generated in `src/generated/api.ts`; do not hand-edit them. Protocol
state is local renderer state, validated from unknown JSON at its boundary. API and
protocol types are not business logic. Existing local UI and i18n primitives remain
available, but the first Lab screen uses English. No second UI framework is introduced.
