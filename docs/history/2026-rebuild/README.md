# Historical rebuild records

Archived 2026-10-16 after the domain documentation migration and explicit cleanup
request. These records are retained for provenance, not agent instructions or an
active backlog. Current rules/intent/gaps start at [documentation](../../README.md).

Full content is preserved; valid Markdown links were rebased to their actual
retained destinations and a historical notice added. Plain-text/code references
retain their original context. Old source paths remain short redirect records.
Targeted source coverage preserves uniquely relevant unresolved history without
accepting every old rule as current. Original Git content hashes below identify the pre-cleanup source exactly; the
archived payload differs only by notice/link rebasing, verified during cleanup.

| Original path | Archived record | Original lines | Original SHA-256 |
| --- | --- | --- | --- |
| [docs/plans/build-order.md](../../plans/build-order.md) | [Snapshot](plans/build-order.md) | 407 | `01c1778ebc8de5d2e2bd01e93239e8b57510bcfe62c685e19b40978810f9c5d1` |
| [docs/plans/continous_space/chain.md](../../plans/continous_space/chain.md) | [Snapshot](plans/continous_space/chain.md) | 957 | `71732754cad5807f3838715093dcd393a9339eec4d9d90f1d4b09db2b0db2f3f` |
| [docs/plans/system-hud/chain.md](../../plans/system-hud/chain.md) | [Snapshot](plans/system-hud/chain.md) | 1417 | `d930181dc6c5a0c20d0469cdfd4dfd2921b86037fde32cb0829a6605f62e0ce4` |
| [docs/specs/BACKLOG.md](../../specs/BACKLOG.md) | [Snapshot](specs/BACKLOG.md) | 121 | `f240cfcba934d646245487aa6ef819d286b815882f6ee63955c4012c251de31b` |
| [docs/specs/0003-system-interior.md](../../specs/0003-system-interior.md) | [Snapshot](specs/0003-system-interior.md) | 326 | `d96318398f6caf528d4e7bea2b7bd5c4092abeeea7f0c328e914385a20dae1e9` |

Removed outright: `docs/specs/TEMPLATE.md` (84 lines), the retired numbered-spec
workflow scaffold; it contains no unique gameplay decisions and is recoverable
from pre-cleanup Git history. Current authoring follows the canonical domain
format and imported skills. No scratch file or asset was pruned.

Cleanup verification: five archived bodies match their pre-cleanup Git content
exactly after reversing link rebasing/header insertion; all changed/archive local
Markdown links resolve; no incoming old-path anchor fragments were found. The
3,228 original lines became 45 redirect lines; removing the 84-line template
reduces active source-path content by **3,267 lines**. No source content was lost
from the five archived records.

## Complete specs-folder pass

The [file-by-file audit](specs/README.md) records the subsequent whole-folder
cleanup: ten additional full specs and the original index archived, all thirteen
remaining paths classified and retained as redirects/navigation. Earlier #0003
and BACKLOG snapshots remain unchanged. No historical spec metadata remains active
in docs/specs; no scratch or asset cleanup was performed.
