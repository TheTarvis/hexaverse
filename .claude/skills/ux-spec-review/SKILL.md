---
name: ux-spec-review
description: UX review method for specs - the five UI states as scenario coverage, error-experience requirements, flow walkthrough for dead ends and data loss, feedback/waiting rules, accessibility as testable SHALL requirements, spec-altitude discipline. Load when UX-reviewing an OpenSpec change with user-facing surface.
---

# UX Review of OpenSpec Changes

Premise: a missing empty state or an unspecified error message is a **spec defect** — if it isn't in a scenario, it won't be in the sprint, and the user meets the gap in production. The review converts experience gaps into paste-ready OpenSpec text at the spec stage, where the fix costs one edit. Scope check first: no user-facing surface (UI, emails, CLI output, user-visible error text) → "no findings", one line, done.

## 1. The five states, per view

Every view or flow a requirement implies must have scenario coverage for the states it can actually reach:

| State | The question | Classic miss |
|---|---|---|
| Loading | What does the user see while waiting? | spinner-forever with no timeout behavior |
| **Empty** | Zero items — often the FIRST thing a new user sees | blank page instead of guidance + the action that fills it |
| Ideal | The happy path | (usually the only one specced) |
| Partial | Long lists, cut-off data | no pagination scenario; next-page failure unspecified |
| Error | The operation failed | nothing specified → devs ship `err.message` in a toast |

Name exactly which state is missing for which requirement, and supply the scenario ("WHEN a user with no saved reports opens the reports page THEN an explanation and a create-report action are shown").

## 2. Error experience (beyond "an error is shown")

"THEN authentication fails with a retriable error" specifies the API, not the experience. For every user-reachable failure scenario, push the THEN to pin:

- **Message intent** (what the user learns and can do — not exact copy, which is implementation): distinguish "wrong password" from "account locked" from "service unavailable" when the design distinguishes them; keep them uniform when security demands it (coordinate with the security reviewer on enumeration).
- **Input preservation**: a failed submit SHALL NOT discard what the user typed. This is the most common unspecified data-loss bug.
- **Recovery path**: what can the user do next — retry, edit, contact, go back? A dead-end error state is a BLOCKER.

## 3. Waiting and feedback

Any WHEN involving a mutation needs specified feedback, or users double-submit and lose trust:

- Pending state visible; trigger disabled or duplicate submission otherwise prevented (pairs with the reliability reviewer's idempotency requirement — reference it, don't duplicate it).
- Success confirmed observably (state change, confirmation, redirect — the scenario names which).
- Operations design.md admits are slow (exports, imports, sends) need a specified waiting experience: progress, completion notification, or explicit "we'll email you".

## 4. Flow walkthrough

Sequence the scenarios end-to-end and walk each multi-step flow AS the user, hunting:

- **Dead ends**: a state with no exit (error page without navigation, final step without continuation).
- **Destructive actions**: anything deleting or irreversibly changing user data needs confirmation or undo as a requirement — "WHEN a user confirms deletion" presumes a confirmation the spec never established.
- **Data loss on navigation**: leave mid-form, back-button after step 2, session expiry mid-flow — what survives? If the design implies drafts, demand the scenario.
- **Information the user was never shown**: step 3 asks for a code step 1 never told them about; a requirement references a choice no view offers.
- **Interruption re-entry**: user returns to a half-finished flow — resume, restart, or corrupt?

## 5. Accessibility as SHALL requirements

A11y that isn't in the spec won't survive the sprint. Where the change adds interaction, propose testable requirements (they double as Playwright-automatable):

- New interactive elements SHALL be keyboard-operable (scenario: "WHEN a user activates the submit control via keyboard THEN the form submits").
- Dialogs/overlays SHALL move focus in on open and restore it on close.
- Form inputs SHALL have programmatically associated labels; validation errors SHALL be announced and associated with their field.
- Async results/updates SHALL be announced (aria-live behavior), stated as observable behavior, not implementation.

Scope to what the change adds — don't audit the whole product.

## 6. Consistency

Grep `openspec/specs/` for how existing capabilities phrase errors, confirmation, and empty states — new flows follow established patterns unless the design doc changes them deliberately. A second confirmation pattern in one product is a finding against the change, not a style preference.

## Altitude discipline and finding format

Pin **user-observable behavior only** — never colors, spacing, copy text, or component choices (implementation). Not "show a nice empty state" but "THEN an explanation and a create action are shown".

Every finding: severity (BLOCKER = user can lose data or get stuck · MAJOR = reachable state unspecified · MINOR = polish) + the requirement it attaches to + paste-ready delta text (`#### Scenario:` with `- **WHEN**` / `- **THEN**`). If the scenarios genuinely cover the experience: say so and stop — no padding.
