# Existing scan confirmation race

One intermediate full frontend run failed the existing P1b scenario in
`SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx`. The same suite passed
in isolation, and the final integrated frontend run passed all 2,212 tests.
Production scan code was not changed by this feature.

## Reproduction and diagnosis

Temporarily add this clock probe at the beginning of P1b:

```ts
let queryTime = Date.now()
vi.spyOn(Date, 'now').mockImplementation(() => ++queryTime)
```

Run `npx vitest run components/space/SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx -t P1b`
from `frontend/`. The probe reproduced a pending confirmation marker remaining
alongside the settled report. It was removed after diagnosis.

The scan mutation's hook invalidates the running-status query before its
observer records acceptance in the view. A fast confirming read can therefore
finish before the acceptance marker is stored. The marker's timestamp exceeds
the read's `dataUpdatedAt`, so confirmation waits for another read. Equal
timestamps in fast tests can mask this ordering.

An independent fix should record acceptance before issuing its confirming
refetch, while retaining settled-report and remount behavior. This is outside
the scene-art scope; no production scan changes or weakened scan assertions
were included here.
