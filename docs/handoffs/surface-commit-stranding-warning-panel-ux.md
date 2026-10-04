# UX panel review: surface-commit-stranding-warning (spec stage)

*Persisted by the orchestrator, verbatim, from the reviewer's returned text
(2026-10-04); the reviewer is read-only and does not write files.*

Verdict: NEEDS SCENARIOS. There are no BLOCKERs. There are two MAJORs (F1, F2) and four MINORs (F3 to F6). The delta covers the five states well for the notice's lifetime: ideal, end, gap, per-fleet and reload. The gaps are the failure direction of Q3, the assistive-technology experience of a warning, and the copy and placement.

Scope notes:
- I did not find the design canvas ("Short by 6.6 t — would strand the fleet.") anywhere under docs, openspec or frontend/app, so I took its content from the brief. Nothing in the delta contradicts it. The canvas shows only the pre-commit preview line and no post-commit notice, so the notice is new surface, and it stays inside the existing amber vocabulary.
- The preview's live copy at `SpaceCommandPanel.tsx:282` is "This burn would leave the fleet unable to reach a station." The canvas line differs from it. That divergence already exists and is not this link's to fix.
- I read `SpaceCommandPanel.tsx`, `SystemSpaceView.tsx:760-767` (the announcer), `lib/toast.ts`, the live "Quote changes are not announced" and "A Landed Resolution Is Announced" requirements, and `system-console`'s Stranded marker. The commit success feedback is a sonner `toast.success`. `app/layout.tsx` mounts the sonner `Toaster`, and sonner's toast region is a polite live region.

## Findings

### F1 (MAJOR): Q3, a failed first read removes the warning when the player knows least
Where: "IF the first read requested at or after the acceptance fails, THEN the gap ends at that failure and the order is judged against the last read that answered, which predates the order, so the notice is removed [pending panel: Q3]." Also the scenario "A failed first read ends the gap and removes the notice", and task 3.8.

Why:
- The notice is a warning. The failure direction should be toward still showing it.
- On a failed read the view knows nothing new about the order. The only data it holds is the pre-order cache, which says "parked". Judging against that cache removes the warning on the strength of data that is known to be stale.
- At that moment the player already sees the fleets-error notice. A player who sees "fleet data unavailable" and also sees the warning vanish will read the vanishing as "the problem resolved".
- The working text also flips the notice off and then on again when a retry answers. That is a flicker with no cause the player can see.
- The cost of holding is a notice that outlasts the order, but only while reads keep failing. In that time the fleets-error notice and its retry are visible, so the player has an explanation and an exit. The "may outlast the order by the lag bound" language already accepts over-showing.

Recommendation: hold the notice. A failed read neither ends the gap nor judges the order. Only an answered read does.

Paste-ready replacement for the failure sentence in "The gap":

```
A read that fails, at any point, neither ends the gap nor judges the order:
the notice is held, and the order is judged only by reads that answer. The
notice may therefore outlast the order for as long as own-fleets reads keep
failing, and the view's existing fleets-error notice and its retry are what
tell the player the fleet's state is not currently known.
```

Also add one sentence to "The lag": "The bounds below hold while reads answer; while they fail, the notice is held (see The gap)."

Paste-ready replacement for the scenario:

```
#### Scenario: A failed read holds the notice until a read answers
- **GIVEN** a burn commit accepted with the warning, departing at 1000 and arriving at 61000, and the cached read describing the fleet as parked
- **WHEN** the first own-fleets read requested after the acceptance fails
- **THEN** the stranding notice is still shown
- **AND** the view's existing fleets-error notice and retry are shown
- **AND** when a retry answers with the fleet parked and attached to the target, the stranding notice is removed
- **AND** when instead a retry answers with the committed burn's instants, the stranding notice is still shown
```

Add a companion scenario, because the same rule applies to a failure after the gap has ended:

```
#### Scenario: A failed poll after the order was seen running holds the notice
- **GIVEN** the last answered own-fleets read reported the committed burn running and the notice is shown
- **WHEN** the next own-fleets read fails
- **THEN** the stranding notice is still shown
```

Task 3.8 must flip to match. The writer's note 2, about the notice returning, disappears because the notice is never removed on failure.

### F2 (MAJOR): Q5, a screen-reader user is told the order succeeded and never told it strands the fleet
Where: "It is static: appearing or being removed SHALL NOT change the view's live-region announcement [pending panel: Q5]." Also the scenario "A response that lands after the acting fleet changed belongs to the fleet that committed".

Why:
- The commit success toast is announced politely by sonner. The notice, as specified, is silent. An assistive-technology user therefore hears "burn committed, arrives X" and nothing about the stranding. That is the most safety-relevant fact in the response.
- The roster requirement says the warning must be "visible, non-blocking". The visible notice is only found by an AT user who navigates to it unprompted.
- The "response lands after the acting fleet changed" scenario has no cue at all on screen. The player who switched fleets sees no notice because the committing fleet is not acting. The inline notice cannot serve that player.
- The live spec forbids announcing quote changes and says the view announcer (`space-announcer`) is for landed resolutions. This is a different thing. It is a one-time consequence of the player's own action, so it is not a quote change and not an unprompted landing.

Recommendation (answers the announcement part of Q5): announce once, through a one-time warning toast fired in the commit callback, in addition to the success toast.
- It is announced exactly once, at the acceptance, by the toast region that already announces the success toast.
- It is not announced again on removal, on a switch back to the fleet, or on a refetch.
- It does not touch the view announcer, so there is no double-announce with the landing announcements.
- It reaches the player who switched fleets before the response landed.
- Use the existing `toast.warning`. It is amber, not the error toast and not the error styling.
- The inline notice itself carries no live-region role.

Paste-ready sentences, replacing "It is static: ... [pending panel: Q5]":

```
It is static: appearing or being removed SHALL NOT change the view's live-region
announcement. The warning SHALL be conveyed to assistive technology exactly once,
at the acceptance, by a one-time advisory (warning, not error) toast shown in
addition to the success feedback and independent of which fleet is acting when
the response lands; the notice's later removal, its return on a switch back to
the fleet, and read refreshes SHALL NOT raise any further announcement. The
notice is present as readable text in the view's reading order, next to the
command controls, and does not rely on colour alone to be understood.
```

Paste-ready scenarios:

```
#### Scenario: The warning is conveyed once, at the acceptance
- **WHEN** a burn commit is accepted with the stranding warning set true
- **THEN** one advisory toast conveying the warning is shown, in addition to the success feedback and not styled as an error
- **AND** the view's live-region text is unchanged

#### Scenario: Later changes to the notice raise no announcement
- **GIVEN** the notice and its advisory toast were shown for the acting fleet's order
- **WHEN** the notice is removed by a read, or hidden and shown again by a change of acting fleet
- **THEN** no further toast and no live-region announcement is made

#### Scenario: The player who switched fleets still learns of the warning
- **GIVEN** the burn command was invoked for fleet A, and fleet B is made acting before the response lands
- **WHEN** the response carrying the warning lands
- **THEN** the advisory toast is shown
- **AND** no inline notice is shown while B is acting
```

The last scenario can be folded into the existing "A response that lands after the acting fleet changed ..." scenario as an extra THEN. Update the scenario "The success feedback is not suppressed by the notice" so that "exactly once" applies to the success toast, and the warning toast is one separate toast.

If the panel rejects the toast, the fallback is that the inline notice carries `role="status"` and is announced at mount. That announcement fires only when the acting fleet is the committer, so the switched-fleet case becomes silent. I recommend against that fallback.

### F3 (MINOR): Q5, the notice has no stated recovery or next step, and its placement can shift the commit control
Where: "It uses the command column's existing amber text treatment" (the placement is otherwise only "on the view's command column", per the writer's note and task 4.3).

Why:
- A non-dismissible warning that lasts a whole burn should tell the player what they can do.
- Appearing at the moment of the click, a notice that moves the commit or stop controls under the pointer is a mis-click hazard.
- Dismissibility: I recommend it not be dismissible. The notice is a status of the order, not an event, and its end is tied to the order's life. A dismiss control adds a state (dismissed, then the order switches back) the spec does not model.

Paste-ready sentences to add to "What the notice is":

```
It is not dismissible: its only end is the order's. It is placed with the burn
command controls and the preview in the command column, and its appearing or
removal SHALL NOT remove, disable or re-order those controls. It names what the
player can do, which is to place a different order.
```

Paste-ready scenario:

```
#### Scenario: The notice does not displace the command controls
- **GIVEN** a parked own fleet is acting and the burn command is available
- **WHEN** a burn commit is accepted with the warning and the notice appears
- **THEN** the burn, cut-drive and stop controls present before the commit are still present and in the same order
- **AND** the notice offers no dismiss control
```

### F4 (MINOR): Q3, a missing fleet entry in the own-fleets read is not stated
Where: "the own-fleets read's entry for that fleet is in burn mode and its burn's departure instant and arrival instant both equal the response's".

Why:
- An answered read with no entry for that fleet (the fleet is gone, or the read is empty) falls out as "not running", so the notice is removed. That is the right result but it is implicit.
- With F1's hold rule, the read answers but the fleet is absent. Say so, so that implementers do not treat absence as a failure to hold.

Paste-ready scenario:

```
#### Scenario: An answered read with no entry for the fleet ends the notice
- **GIVEN** the notice is shown for the acting fleet's order
- **WHEN** an own-fleets read answers with no entry for that fleet
- **THEN** the stranding notice is removed
```

### F5 (MINOR): a warned response without both burn instants is unspecified
Where: the writer's note 4. The delta says nothing for this case. Task 1.2 covers only an omitted or false field.

Why:
- The backend always serves a burn on an accepted commit, so this is defensive.
- Without the instants the order cannot be recognised, so there is no end condition.
- The fail-safe that fits the warning direction is: show the notice for the gap only. It ends at the first read requested after the acceptance that answers. It does not end earlier, and it does not outlast that read.

Paste-ready sentence for "The order's identity":

```
IF an accepted response carries the warning but not both burn instants, THEN the
order cannot be identified, and the notice SHALL be shown until the first
own-fleets read requested at or after the acceptance answers, and removed then.
```

Paste-ready scenario:

```
#### Scenario: A warned response without both burn instants shows the notice for the gap only
- **WHEN** a burn commit is accepted with the warning set true and a response whose burn lacks the departure instant or the arrival instant
- **THEN** the stranding notice is shown until the first own-fleets read requested at or after the acceptance answers
- **AND** it is removed when that read answers, whatever that read reports
```

### F6 (MINOR): Q9, the copy constraint cannot yet be tested beyond "no digit"
Where: the scenario "The notice's copy names stations and lane gates and carries no wire text".

Why:
- The scenario needs observable checks for the names. Add case-insensitive checks for "station" and "lane gate", and a check that the text does not come from the response or contain the word "strand".
- The word "strand" belongs to the roster's persistent indication and the strip's Stranded pill, which mean "already stranded". The notice says "this order will strand", so it should not reuse the word.

Paste-ready replacement for the THEN lines (copy recommended below):

```
- **THEN** its text contains, case-insensitively, both "station" and "lane gate"
- **AND** it contains no digit, and does not contain the word "strand" or "stranded"
- **AND** its text is the same whatever the response and the read contain
```

## Recommendations on the open questions

### Q3: hold, do not remove, on a read failure
Reason: see F1. A warning should fail toward still showing. Judge only on answered reads, and let the fleets-error notice carry the "state unknown" message. Paste-ready text is in F1.

### Q5: the form, in one decision
- Form: both an inline notice and a one-time advisory toast. The inline notice is persistent for the order's life and carries no live-region role. The toast announces the warning once, at acceptance, through sonner's existing live region.
- Placement: in the command column, with the burn controls and the preview, not displacing them (F3).
- Follows: the acting fleet, whatever is selected. This keeps the writer's working text. The notice is about the fleet's course, not about the selected body, so selection changes must not hide it.
- Dismissibility: not dismissible.
- Coexistence with the preview line: two separate elements, and the preview line is unchanged. Distinctness is carried by tense and subject. The preview line is conditional about a quote ("This burn would leave ..."). The notice is present tense about the order in progress ("Your current course ..."). Both stay on screen while the quote keeps refreshing. Neither is announced by the view announcer.
- Announcement: see F2. The view announcer is unchanged, so the "Quote changes are not announced" requirement and the landing announcements are unaffected. There is no double-announce, because the inline notice is silent and the toast is the single source.

### Q9: copy
Recommended string:

`Your current course leaves this fleet unable to reach any station or lane gate. Place a different order to change it.`

Why this string:
- It names both stations and lane gates, as the served condition does (`fleet-movement`).
- It has no figure and no digit, and no wire text.
- It differs from the preview line ("This burn would leave the fleet unable to reach a station.") in tense, subject and the added next step, and it covers both targets.
- It avoids the word "stranded", which belongs to the roster's persistent indication and the strip's Stranded pill, where it means "already stranded".

The toast text, shorter, same constraints: `This course leaves the fleet unable to reach a station or lane gate.` Do not put the word "stranded" or a figure in either string.

## Checked and found adequate (no finding)
- The notice's lifetime and each way an order ends: cut, stop at both sides of the speed floor, arrival at a body and at a point, a replacement order elsewhere.
- The gap: a read requested before the acceptance and answered after it does not end it.
- The projected clock not ending the notice.
- Per-fleet ownership, and the response landing after the acting fleet changed.
- Rejected, failed and field-omitted commits showing no notice.
- A reload showing no notice and leaving the persistent indication to the roster row.
- No contradiction with the live requirements found (the preview's and the roster's lines are untouched).
- The fences are respected: no palette or type change, no galaxy-view work, no client arithmetic, and `followup-explain-withheld-burn-command.md` stays out.

Path of record: `/Users/travis/Projects/hexaverse/openspec/changes/surface-commit-stranding-warning/specs/system-space-view/spec.md`.
