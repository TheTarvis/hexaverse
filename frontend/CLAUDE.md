# Frontend

Next.js 15 (App Router, Turbopack), TypeScript, Tailwind v4, Catalyst UI components, Firebase Auth, React Query.

## Layout

```
frontend/
├── app/                  # Next.js App Router
│   ├── layout.tsx        # Root layout — wraps Providers + LayoutWrapper
│   ├── page.tsx          # Home
│   └── login/            # Public auth pages (no app shell)
│                         # Domain pages (e.g. app/widgets/) are scaffolded
│                         # by /new-domain.
├── components/
│   ├── catalyst/         # 50+ UI primitives — use these, don't build your own
│   ├── account-provider.tsx
│   ├── app-navigation.tsx
│   ├── layout-wrapper.tsx
│   └── providers.tsx     # QueryClient + Account
├── hooks/                # use-*.ts — React Query hooks per domain
├── lib/
│   ├── services/         # API service layer (uses apiClient)
│   ├── types/            # Domain types
│   ├── api-client.ts     # Auto token refresh, 401 retry
│   ├── firebase.ts       # Firebase init + emulator wiring
│   ├── query-client.ts   # React Query client singleton
│   ├── query-keys.ts     # Query key factory (hierarchical)
│   └── toast.ts          # Toast wrapper (use this, not sonner directly)
└── middleware.ts
```

## Adding a new domain

Run `/new-domain <singular> [plural]`. It renders the four frontend templates from `.claude/skills/new-domain/templates/frontend/` to `lib/types/<singular>.ts`, `lib/services/<singular>-service.ts`, `hooks/use-<plural>.ts`, and `app/<plural>/page.tsx`, and prints the wiring snippets to add to `lib/query-keys.ts` and `lib/services/index.ts`.

## Patterns

> Code examples below use a `widget` domain. Run `/new-domain widget` if you want to follow along — the baseline skeleton ships only the `account` identity domain, which doesn't show the full CRUD pattern.

**API calls go through `apiClient`, not raw `fetch`.** It handles auth token refresh and 401 retry automatically.
```ts
import { apiClient } from '@/lib/api-client'
const response = await apiClient.get<Widget[]>('/v1/widgets')
```

**Components use hooks. Hooks use services. Services use `apiClient`.** Don't skip layers.

**React Query keys via the factory** in `lib/query-keys.ts`:
```ts
queryKeys.widgets.lists()             // ['widgets', 'list']
queryKeys.widgets.detail(id)          // ['widgets', 'detail', id]
```
On mutate, invalidate at the right level. Adding a new widget invalidates `lists()`; updating one invalidates `detail(id)` and `lists()`.

**Catalyst, not Headless UI.** All UI primitives live in `components/catalyst/`. If you need a button, import `Button` from there. Don't reach into `@headlessui/react` directly.

**Toasts via the wrapper.**
```ts
import { toast } from '@/lib/toast'
toast.success('Created')
```
Never `import { toast } from 'sonner'`. The wrapper enforces consistent styling.

**Toasts in components, not in hooks.** Hooks own data + cache. Components own user feedback. A hook that fires a toast becomes hard to compose.

**Forms in modals, not drawers.** Drawers are for view/detail; modals are for forms and multi-step flows. Action buttons go in the modal's `footer` prop so they don't scroll away.

**Auth state via `useAccountContext()`.** Don't call Firebase auth APIs directly from components.

## Color system

Backgrounds:
```
bg-zinc-100 dark:bg-zinc-700                 # page
bg-zinc-50 dark:bg-white/[0.12]              # card / panel
hover:bg-zinc-200 dark:hover:bg-white/[0.14]
```

Text:
```
text-zinc-900 dark:text-white                # primary
text-zinc-600 dark:text-zinc-400             # secondary
```

Borders: `border-zinc-200 dark:border-zinc-800/50`.

Page background dark mode is `zinc-700`, **not** `zinc-900`. Cards are lighter than the page in both modes.

## Testing

Vitest + Testing Library. Run `npx vitest run` for one-shot, `npx vitest` for watch. Add `data-testid` to interactive elements you want to assert on.

## Common gotchas

- **Mutation in `useEffect` deps causes infinite loops.** Mutation objects are unstable; exclude them with `eslint-disable-next-line react-hooks/exhaustive-deps`, or use a ref to track the value you actually depend on.
- **Optional props: omit them, don't pass `undefined`.** `<Foo bar={undefined} />` triggers a re-render where `<Foo />` doesn't.
- **`gap` for sibling spacing on flex/grid; `padding` for inside-an-element.** Mixing margin and padding on flex children produces unexpected gaps.
- **Server Component vs Client Component.** Default is server. Add `'use client'` at the top when you need hooks, state, or browser APIs. Pages that read auth must be client components.
