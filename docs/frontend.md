# Frontend components and languages

Monoseed keeps styled, composable shadcn/ui-style components in `web/src/components/ui`.
They are maintained in this repository; Radix handles dialog focus traps, keyboard navigation,
ARIA roles and portals. Use these components instead of building custom overlay behavior.
The theme remains in `web/src/styles.css` and wrappers use `cn` to merge classes.

| Component | Exports / usage |
| --- | --- |
| Dialog | Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose; Notes and workspace creation |
| DropdownMenu | Root, Trigger, Content, Item, Group, Separator, RadioGroup, RadioItem; note actions and language selection |
| Select | Root, Trigger, Value, Content, Item; workspace selection |
| Tabs | Root, List, Trigger, Content; Notes cards/table views |
| Table | Table, Header, Body, Footer, Caption, Row, Head, Cell; semantic table primitives |
| DataTable | Typed TanStack Table v8 columns, sorting, empty state and pagination; Notes table |
| Badge | default, secondary, outline, destructive variants; counts and membership roles |
| Avatar | Root, Image, Fallback; identity initials, optional image with alt text |
| Button / Input / Textarea / Confirm | Existing form and destructive-action primitives |

Imports use named exports, for example:

```tsx
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

<Dialog>
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
  <DialogContent>
    <DialogTitle>Title</DialogTitle>
    <DialogDescription>Describe this dialog.</DialogDescription>
    {/* Form content; provide a Cancel or Close control. */}
  </DialogContent>
</Dialog>
```

Always provide a dialog title and description, labels for inputs and accessible names for
icon-only controls. Controlled dialogs opened outside a DialogTrigger must restore focus
to the initiating control, as the Notes editor does. Keep mutation state in the feature:
prevent dismissal and duplicate submission while saving, retain the form after errors.

`DataTable<T>` accepts `ColumnDef<T>[]`, `data`, and an optional `pageSize` (default 10).
For a complete dataset, it sorts and paginates locally. For an API page, supply
`serverPage={{page, total, onPageChange}}` (one-based page) and the API page size.
**Sorting then covers only the supplied page.** Notes uses server pagination (12 rows)
and labels the view “Sort current page”. Do not imply global sorting; add supported API
sort parameters and server-side ordering before promising that behavior. Pass
`enableSorting: false` for action columns. Loading and fetch errors belong outside the table.

## Simplified Chinese and English

`web/src/lib/i18n.ts` initializes i18next/react-i18next with bundled resources from
`web/src/lib/locales.ts`. No translation download or backend service is needed.
English phrases are translation keys; `zhCN` must implement every English key.
Use `useTranslation()` and `t('phrase')`; interpolation uses named parameters,
e.g. `t('Page {{page}} of {{count}}', {page, count})`. Keep complete sentences together.
Date formatting uses the active language through Intl / `toLocaleDateString`.
Do not translate user-written workspace names or note content.

Language selection order:

1. Explicit saved choice (`monoseed.language` in localStorage): `en` or `zh-CN`.
2. First supported entry in `navigator.languages`: `en-*` → English, `zh-*` → Simplified Chinese.
3. English fallback when no supported language is found.

The login page and application sidebar provide a language menu. Manual selection persists
across refresh/sign-out on that browser origin; automatic detection does not save a preference.
`document.documentElement.lang` follows the active language. If storage is unavailable,
switching still works for the current visit. Different browser origins have separate preferences.
Chinese variants are presented as Simplified Chinese; Traditional Chinese is not a separate locale.

UI labels, validation, confirmations, toasts, navigation, roles, loading/empty/error states
and the 404 page are translated. API problem responses remain unchanged; the UI maps
HTTP status codes to localized messages rather than displaying raw server details.
To add a language, add its complete catalog and update supported languages, detection,
the language menu and tests. Tests check catalog/interpolation parity, preference order,
storage failure, translated validation, sorting/pagination, and real browser interactions.
