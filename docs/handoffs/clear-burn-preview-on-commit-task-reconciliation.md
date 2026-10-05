# clear-burn-preview-on-commit — task-list reconciliation

Reconciled: the 25 unchecked test tasks of sections 1-4 of
`openspec/changes/clear-burn-preview-on-commit/tasks.md` (1.1; 2.1-2.3; 3.1-3.19;
4.1-4.2), plus a spot check of the already-checked 5.1-5.5 and 7.3.
At HEAD `d52eab1` (the change's code is `62c8f15`; the red base is `987ba60`).

**How the earlier count came to be wrong.** The SDET's red-phase delegations
forbade editing `openspec/`, so nobody checked the section 1-4 boxes after the
tests were written and went green. The orchestrator then reported 35, then 38,
of 40 without counting the file. The committed file had 13 of 40 checked.

Evidence base: the two test files as they are at HEAD
(`frontend/components/space/SpaceCommandPanel.test.tsx` = PANEL,
`frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` = VIEW).
`bash harness/openspec-red-manifest.sh verify clear-burn-preview-on-commit`:
"all 2 test file(s) unchanged since handoff". Vitest on the two files at HEAD:
2 files passed, 127 tests passed, 0 failed.

Settlements cited below: contract = `docs/handoffs/clear-burn-preview-on-commit-impl-contract.md`
(index in `...-impl-contract-index.md`; §8 at 394-411, §9 at 412-484, §12 at
539-604); RULING 16 = rulings file lines 450-485 (settles the contract's nine
reported problems in the contract). Where a task is met under a settlement and
not under its literal wording, the row says SETTLED.

Common to every VIEW row: the harness runs the real `SystemSpaceView`,
`SpaceCommandPanel`, `useMyFleets`, `useOrder`, `useCutDrive`, `useStop` over a
mocked `fleetService` (`vi.mock('@/lib/services', ...)` at VIEW:71; no
`vi.mock('@/hooks/use-fleets')` anywhere in the file, the only mention is the
comment at VIEW:27). Helper `expectCommitted(why, expected)` (VIEW:1125-1134)
asserts statement present, its copy equals the literal `STATEMENT_COPY`
(VIEW:229), and `burn().disabled` true, or statement null and disabled false.
`P(fleet, target)` is the per-fleet, per-target preview request count.
Every row asserts its `settled` log via `expectLog` unless it says otherwise.

## Section 1

**1.1 EVIDENCED.** VIEW `harness smoke test (clear-burn-preview-on-commit 1.1)` /
`SDET-added: point-2 selects a distinct point, preview requests are counted per
fleet and per target, a held preview answers by index` (VIEW:548-576). The
harness is extended in place and the file keeps its name (header comment,
VIEW:16-22; the architect's choice per contract §7). Second point trigger:
`trigger('point-2', {x:-12,y:6,z:22})` (VIEW:~158) and `POINT_2`; assertions
`selectedPoint()` is `'-12,6,22'` (:556), `P('fleet_a', POINT_2)` 1 (:557),
`holdPreview()` + `answerPreview` (:561-570), per-fleet count (:572-574). Same
real hooks over a mocked service, fake timers, `mocks.preview` counts. No
section 3 test mocks `useMyFleets` (grep above).

## Section 2 (PANEL)

**2.1 EVIDENCED.** `describe('Scenario: A committed order removes the quote and
withholds the burn command — the panel arm (2.1 a)')`, PANEL:961.
- `it('... — selectionCommitted true, false and omitted')`, PANEL:962-994, one
  `rerender` walk true, false, omitted, true again, with `preview: null,
  currentQuote: null` so the uncapped label would otherwise show.
  - prop true: statement present (:968), `disabled` true (:969), click then
    `order.mutate` not called (:970-972), no `burn-uncapped-label` (:973),
    `aria-describedby` truthy, equals `stmt.id`, and
    `document.getElementById(described)` is the statement (:974-978).
  - prop false and prop omitted (`assertAvailable`, :980-985): no statement,
    enabled, label present, no `aria-describedby` attribute.
- `it('... — with the canvas unavailable the statement is still shown and the label absent')`,
  PANEL:997-1005: `canvasAvailable: false` with the prop true: statement
  present (:1001), label absent (:1002), described by the statement (:1003).

**2.2 EVIDENCED.** `describe('Scenario: A response that lands after the selection
was replaced withholds nothing ... — the click-time key (2.2)')`, PANEL:1008;
`it.each` of two rows (a body, a point), PANEL:1009-1034. The command is invoked
for the row's selection, the held response is not yet landed, `rerender` with
`selection: { bodyId: 'feat-body-9' }` (:1021), nothing reported yet (:1022),
then `onSuccess` fires and `onCommitAccepted` is called once with exactly
`{ fleetId: 'fleet_1', departMs: T0+1000, arriveMs: T0+61000,
strandingWarning: false, selectionKey: key }` (:1026-1032), key `'body:feat-body-3'`
or `'point:30,0,-10'`, not the re-rendered selection's.
Predecessor payload edits (diff the field only): "A response that lands after the
acting fleet changed ..." test gains `selectionKey: 'body:feat-body-3'` at
PANEL:783; the `it.each` "an unwarned commit (1.2)" (two rows, one shared
assertion) gains it at PANEL:808. `grep selectionKey` finds exactly these three.

**2.3 EVIDENCED.** `describe('Scenario: The statement carries no figure and no
wire text — the panel arm (2.3)')`, PANEL:1037; three tests.
- 2.3 a, `it.each` three rows (body, lane gate, point), PANEL:1041-1070:
  `textContent` equals the local `STATEMENT_COPY` literal (:1051); no digit
  (:1052, which also rules out a countdown); says "burn is unavailable" and
  "select another target" (:1053-1054); no body id leaks (:1055); follows
  `selection-facts` by DOM position (:1056-1060); precedes the burn control
  (:1061-1064); no `role`, no `aria-live` (:1065-1066); `closest(live)` null for
  itself and every ancestor (:1067, selector covers `aria-live`, alert, status,
  log, timer, marquee).
- 2.3 b, PANEL:1073-1091: two different responses (unwarned vs a warned
  5000/80000 response with a different delta-v) and two different fleets (id
  `fleet_1` vs `fleet_7`); both texts equal the constant (:1089-1090).
  Wording note: "two different own-fleets reads" is arranged as two fleet props,
  because the panel does not read the own-fleets query; the read-level
  equivalent lives in VIEW, where `expectCommitted` asserts the same constant at
  every row. Not a settlement, a harness-level reading.
- 2.3 c, PANEL:1094-1110: after a warned commit, with `commitStrandingNotice`,
  both `commit-stranding-notice` and `commit-drift-notice` are present (GIVEN,
  :1103-1104), the statement is present, and the statement precedes both
  (:1107-1109).

## Section 3 (VIEW, all inside `describe('the committed selection ...')`, VIEW:1136)

**3.1 EVIDENCED.** `describe('3.1')` / `it('Scenario: A committed order removes
the quote and withholds the burn command — the quote is gone, Burn withheld
across two refresh intervals and a baseline poll')`, VIEW:1138-1164.
Preview shown first (:1142); order accepted with no stranding field `'absent'`
(:1147); next read reports that burn (:1148); `flush(2*PREVIEW_REFRESH_MS)` asserts a
baseline poll read happened (:1151-1152) and the poll answers the same burn
(:1153). Clauses: quote gone `quoteGone()` (:1156); statement and disabled
`expectCommitted` (:1157, disabled although the request settled, because the order
answered at :1147); selection unchanged (:1158); no uncapped label, no-quote,
stale, retry `noQuoteStates()` equals `[]` (:1159); zero preview requests
`P` equals the pre-acceptance snapshot (:1160); activating sends no order
`orderCalls()` 1 (:1161-1162); success feedback once (:1163). The canvas-unavailable
clause is carried by PANEL 2.1 b, as the task says.

**3.2 EVIDENCED.** `describe('3.2')` / `it('Scenario: The committed selection
holds before any read has answered after the acceptance')`, VIEW:1168-1178.
`commitUnwarned()` (response 1000 to 61000); cached read still parked
(`fleet-row-eta-fleet_a` absent, :1170) and the post-acceptance read unanswered
(`pending.listMine.length` 2, :1171; log equals `BASE_LOG`, :1172); statement and
disabled (:1173); quote gone (:1174); click sends no order (:1175-1176); `P` 1
(:1177).

**3.3 EVIDENCED.** `describe('3.3')` / `it('Scenario: A read begun before the commit
and answered after it does not end the committed selection')`, VIEW:1182-1203.
Held earlier read (`reconnect`, calls 2, :1185-1186); a NEW `listMine` call at the
acceptance (calls 3, :1190); `answerListMine(1, [parked])` leaves
`document.body.innerHTML` identical (:1193-1195), statement still shown (:1196),
`P` 1 (:1197); `answerListMine(2, [burning 1000/61000])` still shown, `P` 1
(:1199-1202).

**3.4 EVIDENCED.** `describe('3.4')` / `it('Scenario: The projected clock passing
the arrival does not end the committed selection')`, VIEW:1207-1223. Last read
reports the burn (`commitUnwarnedAndConfirm`), `flush(61_000)` of fake timers, no
read answered (log equals `CONFIRMED_LOG`, :1216); `data-world-time` above 61000
(:1211-1214); reads were requested and none answered (:1215); statement, disabled
(:1217); `P` 1 over 61 s (:1218). Then `answerListMine(last, [datedAt(burning(...),
99_999)], 99_999)`: the third argument is the envelope's `worldTime`
(helper VIEW:381-382) and `datedAt` sets the fleet's own `worldTime`, both past
61000 (:1220); still shown (:1221), `P` 1 (:1222).

**3.5 EVIDENCED.** `describe('3.5')` / `it('Scenario: Cutting the drive ends the
committed selection')`, VIEW:1227-1255. Real fleet-panel control
`fleet-cmd-cut-drive-fleet_a` (:1231); cut answered, refreshed read requested
(:1234-1235); still committed until that read answers, `P` 1 (:1236-1237); read
answers drifting: statement removed and control available (`expectCommitted(...,
false)`, :1241), exactly one request sent at that answer (`P` 2 and
`pending.preview.length` 1, :1242-1243); while pending no figure or ceiling from
before (`quoteGone()` covers arrival, delta-v, fuel, fuel ceiling, affordability,
stranding line, :1244) and no stale (:1245); uncapped label shown (:1246); burn in
that window carries no cap (`'maxFuelTons' in mocks.order.mock.calls[1][1]` false,
:1250); accepted: statement shown again (:1252), no further request (`P` 2, :1253),
selection unchanged (:1254).

**3.6 EVIDENCED.** `describe('3.6')` / `it.each` two rows, `Scenario: A stop ends the
committed selection, above or at the speed floor — the refreshed read answers
%s`, VIEW:1259-1275. Rows: `burning('fleet_a', 70000, 90000)` and `pointParked`.
Stop via real control `fleet-cmd-stop-fleet_a` (:1264); statement present until the
refreshed read answers (:1269); after it: removed and control available (:1273),
`P` 2 i.e. one request sent at that answer (:1274), both rows. The task's "70000
and 90000" instants are the first row's burn.

**3.7 EVIDENCED.** `describe('3.7')` / `it.each` four rows, `Scenario: A read
reporting the order gone ends the committed selection — %s`, VIEW:1279-1295: point
park; 5000-80000 to HOST; 5000-61000 to OTHER; 1000-90000 to OTHER (:1280-1283).
Same harness (committed, read confirmed, `poll()`-caused read, :1285-1288),
statement present and `P` 1 while the poll read is unanswered (:1289-1290); closing
assertion for every row: statement removed and control available (:1293), one
request at that answer, `P` 2 (:1294). No `preview-deltav` assertion in the point
row (none in any row).

**3.8 EVIDENCED, SETTLED (contract §9 row 3.8, §12 item 4, RULING 16).**
`describe('3.8')` / `it('Scenario: Arrival at the selected body hands over to the
docked-at-target state')`, VIEW:1299-1319. The docked-at-target reference is built
as a first phase of the same test (:1301-1305, `resetHarness()`), because the task
needs a no-commit state to compare with. Read reported the order running
(`commitUnwarnedAndConfirm`), next read `attached('fleet_a', OTHER)` (:1311):
statement present before (:1310) and removed after (:1314); no preview request
`P` 1 (:1315); `burn().disabled` equals the reference (:1316); label presence equals
the reference (:1317), nothing more asserted about either. The landing is announced
"once and nothing else": jsdom cannot count, so the contract settles it as the live
region text equalling exactly one sentence, `Burn complete — arrived and attached to
feat-body-1.` (:1318), with empty text before (:1309). That is the settled reading
of "made once", not a literal count.

**3.9 EVIDENCED.** `describe('3.9')` / `it('Scenario: An order that settled inside the
commit round trip never shows past the first read')`, VIEW:1323-1330. Statement
shown before the first post-acceptance read answers (:1325); that read answers
`attached('fleet_a', OTHER)` (:1326); removed (:1328); `P` 1 (:1329).

**3.10 EVIDENCED, SETTLED in part (contract §9.1, §12 item 5).**
`describe('3.10')` / `it('Scenario: A failed read changes nothing for the quote and
the burn command')`, VIEW:1334-1376, one walk, every trigger zero-time.
(1) first read rejected: statement and disabled (:1337), `space-fleets-error` and
`space-fleets-retry` (:1338-1339), no `preview-no-quote`/`preview-stale`/
`preview-retry` (:1340), `P` 1 (:1341). (2) retry answers the committed instants,
still shown, `P` 1 (:1344-1348). (3) later read rejected, still shown, `P` 1
(:1351-1356). (4) read answers drifting: removed, `P` 2, figures shown (:1361-1364).
(5) further read rejected: no statement and control available (:1373), resumed
preview untouched (:1374), `P` equals the snapshot taken before (:1375), a window
zero fake ms wide. Settlement: the contract records that steps 1-3's "no preview
request" can only show the failure sent nothing at that instant, not withholding
over time (§9.1, §12 item 5); that over-time property is carried by 3.1 (20 s) and
3.4 (61 s). Kept as the scenario states them.

**3.11 EVIDENCED.** `describe('3.11')`, two tests, VIEW:1380-1403.
- bodies, `... — bodies`: after the commit the other body is selected: `P(a, HOST)`
  1 (:1383), figures shown (:1384), control available and no statement (:1385);
  first body again: statement and disabled (:1389), `P(a, OTHER)` 1 (:1390).
- points, `... — points`: commit toward a point (`mock-select-point`): statement and
  disabled (:1396), `P(a, POINT)` 1, no further request (:1397); different point
  (`mock-select-point-2`, `selectedPoint()` is `'-12,6,22'`): previewed `P(a,
  POINT_2)` 1 (:1401), control available and no statement (:1402).
"No preview request" for the committed target means no request beyond the one the
selection itself caused, consistently with contract §9 row 3.11.

**3.12 EVIDENCED, SETTLED (contract §9 row 3.12, §12 item 6).** `describe('3.12')` /
`it.each` two rows (second response warned `true`, unwarned `'absent'`), `Scenario:
A second commit by the same fleet moves the committed selection — %s`,
VIEW:1407-1429. X committed and confirmed (:1411); Y selected, second commit
accepted 5000-80000 (:1412-1414): Y statement and disabled (:1415), `P(a, HOST)` 1
(:1416); X selected again in the gap while `listMine#2` is unanswered and the last
read still reports the first order: no statement, enabled (:1420), `P(a, OTHER)` 2
(:1421), figures (:1422); after `answerListMine(2, [burning 1000/61000])`: the same
three (:1426-1428). The scenario's "including while a read still reports the first
order's instants" has two readings; the contract settles it by asserting both (the
gap, then the new answer).

**3.13 EVIDENCED.** `describe('3.13')` / `it('Scenario: A response that lands after the
selection was replaced withholds nothing for the new selection')`, VIEW:1433-1450.
Command invoked for X (:1437-1438), Y selected before the response (:1439),
response settled (:1440), read answered (:1441): Y's preview still shown (:1444),
control available and no statement (:1445), `P(a, HOST)` 1 (:1446); X selected
again: statement and disabled (:1448-1449).

**3.14 EVIDENCED, SETTLED (contract §9 row 3.14, §9.2, §12 item 2, RULING 16).**
`describe('3.14')`, two tests (`it` pairs, not one `it.each`; same arrangement and
closing assertion), VIEW:1457-1520.
- row one, VIEW:1457-1496: A commits toward the kept selection (:1459-1464); B made
  acting: B previewed `P(b, OTHER)` 1, control available, no statement (:1466-1469);
  A acting again: statement and disabled, `P(a, OTHER)` 1 (:1471-1474); B acting,
  B's commit for the kept selection (`mocks.order.mock.calls[1][0]` is `'fleet_b'`,
  :1480), both orders reported running (:1482): B acting statement and disabled, `P`
  of A and B unchanged (:1485-1487), A acting again (:1488-1490), B again
  (:1492-1495), each with statement, disabled, no new request.
- row two, VIEW:1498-1520: command invoked for A (:1503), B made acting, B's
  figures shown and `P(b)` 1 (:1505-1507); A's response placed (:1510): `P(b)`
  unchanged over a window of zero time (:1511), B's figures stay shown (:1512), B
  available and no statement (:1513); A acting again: statement and disabled,
  `P(a, OTHER)` 1 (:1516-1519). This row alone asserts B's figures and B's request
  count.
  Settlement: the task's parenthetical alternative "(or the preview held on a
  deferred)" is not used, since a held preview shows no figures; the per-fleet request
  count is the alternative the task allows (contract §9.2, §12 item 2, RULING 16).

**3.15 (regression guard) EVIDENCED.** `describe('3.15 (regression guard)')` /
`it.each` three rows (cap rejection; failure with no mapped reason; SDET-added: the
same failure with a read in flight), `Scenario: A rejected or failed commit enters
no committed state — %s`, VIEW:1524-1550. Preview shown first (:1539); no
statement and control available in every row (:1544-1545); cap row also `P` 2 and
figures (:1547-1548). Green before implementation by design (task header,
contract §12 item 3); the wrong-build redness proofs are the red-coverage file's.

**3.16 EVIDENCED.** `describe('3.16')` / `it('Scenario: A rejected commit leaves an
earlier committed selection alone')`, VIEW:1554-1563: X committed and confirmed
(:1555-1556), Y selected, rejected commit (`CAP_ERROR`, :1557-1559), X selected again:
statement and disabled (:1562).

**3.17 (regression guard) EVIDENCED, SETTLED (contract §9 row 3.17, §12 item 3).**
`describe('3.17 (regression guard)')` / `it('Scenario: The committed selection is
silent — the live-region text is identical before, after, and after the cut')`,
VIEW:1567-1582: announcer text read before the acceptance (:1571), after it
(:1575), after the cut drive and the drifting read (:1579); `r1` and `r2` equal `r0`
(:1580-1581). The contract has the test assert nothing about the statement at the
third reading (it is a guard of absences); the statement's removal there is
carried by 3.5, which shares the arrangement.

**3.18 (regression guard) EVIDENCED.** `describe('3.18 (regression guard)')`, two tests,
VIEW:1586-1607. Row one (view opened on a burn): `P(a, OTHER)` 1, enabled, no
statement (:1590-1592). Row two (unmount, fresh view on the same `QueryClient` over
a read still reporting an earlier committed order): `cleanup(); renderView()`
(:1600-1601), `P` equals the snapshot plus 1, enabled, no statement (:1604-1606).

**3.19 EVIDENCED.** `describe('3.19')` / `it('Scenario: One order, two consumers')`,
VIEW:1611-1626. Warned commit: notice and statement both shown (:1613-1614); another
body selected: notice stays, statement goes (:1617-1618); commit accepted with no
stranding field: statement shown (:1624) and no notice (:1625), before any read has
answered (`pending.listMine.length` 3, :1622).

## Section 4

**4.1 EVIDENCED.** `git diff 987ba60 62c8f15 -- VIEW`: each of the four tasks'
tests gains `await click(\`mock-select-${HOST}\`)` before the second Burn click and
nothing else is removed or reworded; titles unchanged. The four tests (the
contract's §8 rows, seven tests counting the rows' share with 4.2):
1. `3.13` `it('Scenario: A later commit by the same fleet replaces the earlier
   notice')` (VIEW:898): select HOST inserted; the second response's fixture
   `burning('fleet_a', 5000, 80000)` becomes `..., HOST`.
2. `3.14` `it('Scenario: A second warned commit by the same fleet replaces the notice
   and raises its own warning')` (VIEW:916): select HOST inserted; second response
   and its read fixture gain `HOST`.
3. `3.15` `it.each` `Scenario: A rejected or failed commit shows no notice and leaves
   an earlier one alone — %s`, two rows (cap rejection, unmapped failure) (VIEW:937):
   select HOST inserted before the second Burn. The cap row then has a current quote on
   HOST because the default preview mock resolves (contract §8); no test asserts that
   quote, as assertions are unchanged.
4. `3.16` `it.each` `Scenario: A response without the stranding field shows no
   notice — %s`, two rows (field absent, field false), control leg (VIEW:962): select
   HOST inserted before the control leg's Burn; the control leg's response fixture is
   unchanged, as the contract specifies only the insertion.

**4.2 EVIDENCED, SETTLED for one test (contract §8 and §12 item 1, RULING 16).**
Three tests, each now selects another body after the commit:
5. `3.17` `it('Scenario: The notice is advisory and distinct from the preview\'s
   stranding line')` (VIEW:987): select HOST inserted after the confirming read, before
   the `preview-stranding` assertions; the preview mock still carries the warning.
6. `3.18` `it('Scenario: The notice does not depend on the preview — no-quote')`
   (VIEW:1026): select HOST inserted after `commit()`, before the `preview-no-quote`
   assertion; the mock still rejects.
7. `3.18` `it('Scenario: The notice does not depend on the preview — stale')`
   (VIEW:1035): a re-ordering, not an insertion. The task's literal wording (select
   another body after the commit with the failing refresh still in the mock) cannot
   produce a stale state, as the other body's first request would fail into no-quote.
   Now: select OTHER, assert figures (original GIVEN kept), Burn, accept warned, select
   HOST, assert its first figures, then `mockRejectedValue`, `flush(PREVIEW_REFRESH_MS)`,
   assert `preview-stale`, the notice, and `preview-stale` again. All four original
   assertions survive; the failing refresh moves after the commit. Settled by RULING 16
   ("task 4.2's stale row is a re-ordering inside its test, not an insertion") and
   contract §12 item 1.

## Already-checked tasks, judged from code and tests

- **5.1 supported.** `SpaceCommandPanel.tsx:56-57` `selectionKey: string` on the
  exported payload type (`:~50`); captured at click `const committedKey =
  selectionKey(selection)` (`:158`) and sent as `selectionKey: committedKey` (`:189`).
- **5.2 supported.** Prop `selectionCommitted?: boolean` (`:102`, default false at
  `:138`); `useId` statement id (`:150`); `burnAvailable` includes
  `!selectionCommitted` (`:151`); statement `data-testid="selection-committed-statement"`
  rendered at `:350-356` immediately before the control; control `disabled` includes
  `selectionCommitted` (`:365`) and `aria-describedby={selectionCommitted ? statementId
  : undefined}` (`:366`); uncapped label gated on `burnAvailable` (`:342`).
- **5.3 supported.** `interface CommittedOrder` (`SystemSpaceView.tsx:244`) with
  `readsAtAcceptance` (`:249`); state `committedOrders` (`:278`); handler
  `handleCommitAccepted` (`:350`, `useCallback`) sets the record for every accepted
  commit (`:355-361`). I did not re-audit the absence of the old unwarned-removal branch
  line by line, and no effect, timer or clock term appears in the diff of this file (grep
  of `git diff 987ba60 62c8f15` for `wallMsUntil|worldTime|projected|Date.now|setTimeout|useEffect`
  on added/removed lines: no hits).
- **5.4 supported.** `order = committedOrders[acting.id]` (`:773`), `awaitingRead` (`:775`),
  `selectionCommitted = orderLive && !!order && selectionKey(selection) === order.selectionKey`
  (`:786`), `previewWanted` includes `!selectionCommitted` (`:787`), prop passed
  (`:965`, with `onCommitAccepted` at `:963`).
- **5.5 supported.** `git diff 987ba60 62c8f15 --stat -- frontend backend` lists exactly
  four files: `SpaceCommandPanel.tsx`, `SpaceCommandPanel.test.tsx`, `SystemSpaceView.tsx`,
  `SystemSpaceView.stranding-notice.test.tsx`. No `use-burn-preview.ts`, `use-fleets.ts`,
  type, service or backend file. No added or removed line of `SystemSpaceView.tsx`
  mentions `wallMsUntil` or the projected clock (grep above).
- **7.3 supported with named gaps (RULING 17, rerun result in
  `clear-burn-preview-on-commit-journey.md`, "Gate rerun — tier 4").** The spec
  `frontend/e2e/tests/committed-selection-journey.spec.ts` (912 lines) exists and has the
  legs `keyboard-focus` (Enter at :543, focus not the statement :608, Tab inside the
  column and not body :596-606), `committed-render-hold` (the six preview ids as
  `FIGURE_IDS` at :269-276, statement, Burn disabled, order POST count one at :707),
  `one-order-no-preview`, `second-activation` (:725), `zero-preview-2-intervals` (:729),
  `another-target-and-back`, `cut-the-drive` (:786-796, figures logged),
  `arrive-and-dock` (:806-811, row reads docked), drift and stranding notice logged not
  asserted (:699, :798, :832), and the `[journey-console]` update-depth check (:131-139).
  Rerun outcome: this journey PASSED in 27.8 s with keyboard-focus, committed-render-hold,
  one-order-no-preview, second-activation, another-target-and-back, cut-the-drive and
  arrive-and-dock PASSED. **Logged UNTESTED by RULING 17:** `zero-preview-2-intervals`
  (flight 5423 ms wall at scale 5, covered at tier 1 by 3.1 and 3.4). **Not walked, by
  the task's own word "optional":** the reload leg (spec header :65). Weak spot recorded
  there: after acceptance focus was on `BODY`, and the leg passes on Tab landing on the cut
  control inside the column. I did not run the spec nor trace every assertion inside the
  legs; this is reading of the spec file and the journey record, not a re-execution.
  The box says the journey was written, which it was; 7.4 (tier 4 at the gate) is
  correctly unchecked, since the gate outcome is NOT PASSED (RULING 19).
- No already-checked box is unsupported by what I could read.

## Totals

25 tasks reconciled: **25 EVIDENCED, 0 PARTIAL, 0 NOT FOUND.** Of the 25, six
are met under a recorded settlement and not the literal wording: 3.8, 3.10 (steps
1-3), 3.12, 3.14, 3.17, 4.2 (one test), each cited above. Vitest at HEAD on the
two files: 2 passed, 127 tests passed. Manifest verify: both files unchanged since
handoff. The 25 boxes are flipped in tasks.md after this file was written.
