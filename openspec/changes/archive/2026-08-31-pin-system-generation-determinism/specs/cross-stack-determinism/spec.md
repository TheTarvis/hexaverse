## ADDED Requirements

### Requirement: Recorded Cross-Target Values Live In Fixtures, Not Test Constants
A value recorded to pin a rule-bearing function's cross-build-target or
cross-language reproducibility SHALL be committed under `fixtures/`, never
hard-coded as a constant inside a Go or TypeScript test file. A package's
standing regression baseline for such a function SHALL be a fixture family
asserted per `The Golden Fixture Reproduces On Every Build Target`, not a
private golden constant local to one test file — a constant recorded this
way is a second, undiscoverable implementation of the fixture machinery,
re-recordable only by editing Go or TypeScript source rather than by the
reviewable-diff convention the fixture files use, and it cannot distinguish
"this package's output changed" from "this package's output diverged only on
a build target other than the one the constant was recorded on," which is
exactly the failure mode a golden-master constant recorded on one
architecture exhibits when read against another.

#### Scenario: A retired test-file constant is replaced by a fixture family
- **WHEN** a package's cross-target or cross-run regression pinning is
  migrated from a constant recorded in a `_test.go` (or `.test.ts`) file to a
  fixture family under `fixtures/`
- **THEN** the constant and the code path that compares against it are
  deleted in the same change that adds the fixture family
- **AND** the fixture family covers at least the same generation-order
  projection the retired constant pinned

#### Scenario: A hand-copied digest constant in a test file is a violation
- **WHEN** a test file asserts a rule-bearing function's output against a
  SHA-256 digest (or other recorded value) declared as a source-level
  constant in that same test file, rather than read from a file under
  `fixtures/`
- **THEN** this is a violation of this requirement regardless of whether the
  constant currently reproduces on every build target the function runs on

### Requirement: A Cross-Target Leg That Cannot Execute Reports Loudly, Not Silently
Where a leg of the cross-build-target matrix (for example, an emulated
architecture leg in a CI pipeline) cannot execute because its runtime is
unavailable, the pipeline SHALL NOT treat that leg as passed or omit mention
of it. It SHALL instead emit a warning, in a form the pipeline's output makes
easy to search for, naming which packages went unchecked as a result and the
remedy that clears the condition. This holds regardless of whether the
condition is expected to persist (an environment not yet provisioned) or
transient — a check that degrades silently trains reviewers to stop noticing
the degradation, which is the same failure mode as never running the leg at
all.

#### Scenario: An emulated leg missing its runtime reports a named, greppable warning
- **WHEN** a CI leg intended to assert the cross-build-target matrix's
  emulated-architecture leg runs on a runner whose image lacks the emulation
  runtime the leg needs
- **THEN** the leg prints a warning containing the literal marker
  `DETERMINISM ARM64 LEG UNASSERTED`, naming the packages it could not check
  and the command or artifact that would clear the condition

#### Scenario: A degraded leg does not fail the pipeline by itself
- **WHEN** the emulated-architecture leg is unable to execute for the reason
  named in its warning
- **THEN** the pipeline's overall result is not forced to fail solely because
  that leg could not execute
- **AND** the warning remains visible in the pipeline's output for that run

#### Scenario: A restored runtime clears the warning without further changes
- **WHEN** the CI runner image gains the emulation runtime the leg requires
- **THEN** the leg executes and asserts the packages it names, and the
  warning does not appear, with no change required to the packages' own code
