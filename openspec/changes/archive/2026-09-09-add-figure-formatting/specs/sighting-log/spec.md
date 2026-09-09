## MODIFIED Requirements

### Requirement: The Sighting Log Lists the Corporation's Own Pile in Served Order
The system SHALL present the requesting corporation's sighting pile as a list,
one row per served record, in the order the server returned them, and SHALL NOT
re-sort them client-side — the pile is ordered by each record's `asOf`, the
instant the light left, which is not the order the claims were filed, so a
client re-sort would silently assert a different ordering than the one the
server's pagination is built on.

Each row SHALL show the record's system, its `asOf`, and the **raw host id** of
the host that was swept. The `asOf` is presented per `figure-formatting` as an
absolute `T+` stamp and carries its raw served value; this presentation rule
applies to `asOf` alone. Because the absolute stamp is minute-resolution
(`figure-formatting`'s `T+ Dd HH:MM`), two records whose `asOf` values fall
within the same minute render an identical stamp. The row order — served,
never client-sorted — remains the only visible signal of their relative
sequence; this is accepted rather than remedied by a seconds field on this
surface alone, per `figure-formatting`'s one-format-everywhere rule. The raw
id is the label, not a fallback from one: no wire surface in this codebase
serves a name for a body or for a fleet, so there is nothing for the row to
prefer and nothing for it to fall back from. The row
SHALL NOT present the id as degraded — no placeholder text, no empty cell, no
"unknown host", no styling that marks it as missing information.

This is deliberately **unlike** the system column (*An Unknown System Name Falls
Back to Its Id*), and the difference is the reason both rules are stated. A
system's name is served, and is only occasionally unresolvable, so that column
genuinely falls back. A host's name is served by nothing, so a host column with
a name path would specify a branch that no response can take and no test can
induce without mocking a shape the server does not produce.

A row for a record that names a target SHALL show that target's hull count and
the hull types present. A row for a clean-sweep record SHALL instead show a
clean-sweep marker and no composition, because the sweep found nothing masked
at that host — itself a filed claim, not an absence of one.

#### Scenario: Rows render in the served order
- **WHEN** the pile read returns records
- **THEN** the log renders one row per record, in the order the response listed
  them, with no client-side re-sorting

#### Scenario: A composition row shows hulls
- **WHEN** a served record names a target
- **THEN** its row shows the record's system, `asOf` (presented per
  `figure-formatting` and carrying its raw served value), swept host, hull
  count, and hull types

#### Scenario: The swept host is shown as its raw id, whatever the host is
- **GIVEN** records whose swept hosts are a planet, a moon, a belt, a lane gate,
  a trading station, a fleet, and a host in a system other than the open one
- **WHEN** their rows are shown
- **THEN** every row shows the swept host as its raw host id
- **AND** no row carries a placeholder, an empty cell, or a degraded-state
  indication on the host column

#### Scenario: A clean-sweep row shows the clean-sweep marker
- **WHEN** a served record is a clean sweep
- **THEN** its row shows a clean-sweep marker and no hull count or hull types
- **AND** it still shows the system, `asOf`, and swept host

#### Scenario: Two records within the same minute render identical stamps, distinguished only by row order
- **GIVEN** two served records whose `asOf` values fall within the same minute
- **WHEN** their rows are shown
- **THEN** both display the identical `T+ Dd HH:MM` stamp
- **AND** their relative order in the list — never their stamps — is what
  shows which was observed first
