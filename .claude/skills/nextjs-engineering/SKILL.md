---
name: nextjs-engineering
description: Next.js App Router engineering standards for the OpenSpec team - server/client component boundaries, data fetching and caching decisions, mutations, the five UI states, forms, auth placement, TypeScript contract discipline. Load when designing or implementing Next.js work from an OpenSpec change.
---

# Next.js Engineering Standards (App Router)

Baseline: Next.js 14+/15 App Router, React Server Components, TypeScript strict. When the repo disagrees with this document, the repo wins — match existing conventions first.

## Component boundary decisions

- **Server component by default.** Add `"use client"` only when the component needs state, effects, refs, browser APIs, or event handlers — and push that directive to the smallest leaf that needs it. A `"use client"` on a layout poisons the whole subtree.
- Pass server data down as props; pass Server Actions or route-handler URLs down for mutations. Never import server-only modules (db clients, secrets) into client components — enforce with the `server-only` package where the repo uses it.
- Interactive islands: extract the interactive part (`<AddToCartButton>`) out of the static part (`<ProductPage>`), not the reverse.

## Data fetching and caching

Decide per fetch, and record the decision in design.md when it's contract-relevant:

- Fetch in server components (or route segment `page.tsx`) close to where data is used; React deduplicates identical fetches per render. No client-side fetching for data RSC can deliver.
- **Authenticated/user-specific data is never statically cached.** Be explicit: `cache: "no-store"` (or `dynamic = "force-dynamic"`) for per-user responses; `revalidate` intervals only for genuinely shared data. A cached page leaking user A's data to user B is the classic App Router security bug.
- After mutations, invalidate deliberately: `revalidatePath`/`revalidateTag` — stale-after-write is a scenario failure ("THEN the updated name is shown").
- Loading UX comes from the router: `loading.tsx`/`<Suspense>` boundaries at the segment where waiting actually happens, not one global spinner.

## Mutations

- Pick ONE pattern per change (design.md decides): Server Actions or route handlers + client fetch. Don't mix within a feature.
- **Server Actions are public, unauthenticated-by-default endpoints.** Every action revalidates auth/authz inside the action body — the fact that only one page renders the form is not access control.
- Validate input at the boundary with the repo's schema library (typically zod): parse, don't trust. Return typed error shapes the UI can render, not thrown strings.
- Pending state via `useFormStatus`/`useTransition`; disable the trigger while pending (double-submit is a standard spec scenario); confirm success observably.

## The five UI states (each scenario maps to one)

Every data-bearing view implements: **loading** (`loading.tsx`/Suspense skeleton), **empty** (designed zero-state with the action that fills it — not a blank div), **error** (`error.tsx` boundary or inline recoverable error preserving user input), **partial** (pagination/infinite lists: what the next-page fetch failure looks like), **ideal**. If a spec scenario names a state the UI can't reach, that's an implementation gap; if the UI has a state no scenario covers, report the spec gap — don't invent behavior.

## Forms and input

- Labels tied to inputs (`htmlFor`), errors announced adjacent to the field they concern, focus moved to the first invalid field on failed submit.
- Preserve user input through failed submissions — wiping a form on error is a QA finding waiting to happen.
- Client-side validation is UX; server-side validation is the requirement. Both, always; the server is the referee.

## Contract discipline

- API payload types come from the single source of truth named in design.md (zod schema, OpenAPI-generated client, or shared package) — never hand-retyped interfaces that drift from the Go side.
- The error envelope is uniform: one shape for all API errors (design.md defines it), so error UI is written once.
- `NEXT_PUBLIC_*` env vars ship to the browser — secrets never carry that prefix; grep for violations before handoff.

## Accessibility floor (spec scenarios or not)

Semantic elements over div-with-onClick; keyboard operability for every interaction; visible focus; dialogs trap and restore focus; dynamic updates announced (`aria-live` for async results); images with meaningful alt or empty alt. Playwright's `getByRole` selectors double as an a11y smoke test — if a role query can't find it, a screen reader can't either.

## Spec-first discipline

- **No task, no code.** Every production edit implements a task in an approved change's tasks.md, which traces to a scenario/requirement. Adjacent improvements, drive-by refactors, and "obvious" fixes outside the change are reported as proposed changes, not made — unrequested edits are how code drifts from spec.
- Existing code found diverging from `openspec/specs/` is **drift**: report file:line + the spec passage; the orchestrator decides whether the fix is a corrective change (code wrong) or a baseline correction (spec wrong). Never patch either side quietly.

## Test-driven workflow

- The SDET's scenario suite (vitest component/hook tests and contract tests) exists before your code: run the tests for your task red, implement to green, refactor with them green. For units below its reach (component logic, form validation helpers, hooks), write your own test first and watch it fail before implementing. Playwright is **not** part of the red suite — the SDET writes one journey spec per change after every task is checked (`docs/testing-tiers.md`).
- **Tests are immutable to implementers**: never edit assertions, `test.skip`/`.only`, or delete a test to reach green — including your own once written. A test you believe wrong is a dispute for the orchestrator (cite the scenario text); only the SDET revises tests, post-adjudication.

## Verification before checking off a task

Relevant vitest tests green and untouched · `tsc --noEmit` (or repo script) clean · lint clean · the scenario's flow exercised against a running dev server · error and empty states actually reachable (throw/return empty in dev to see them) · no console errors on the touched routes. **Never the Playwright suite per task** — it runs once per change at archive time (`docs/testing-tiers.md`).
