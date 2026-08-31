## ADDED Requirements

### Requirement: Interior Generation Reproduces Across Build Targets
Given the same per-system seed, region, and galaxy-tier skeleton, the
interior generator SHALL produce identical persisted interior data —
including every float-valued field, notably each feature's
`Resource.Richness` — on every Go build target the backend is built for,
regardless of differences in floating-point multiply-add contraction
behavior between those targets (`arm64`, which contracts, and
`amd64`/`GOAMD64=v1`, which does not). This requirement covers the interior
generator's own arithmetic given a skeleton; it makes no claim about the
skeleton or the galaxy-tier region character the interior generator
consumes as input, which are produced upstream by `galaxy-generation` and
are not pinned by this requirement.

#### Scenario: The same seed produces the same interior on both targets
- **WHEN** an interior is generated from the same seed, region, and skeleton
  by the generator compiled for `arm64` and, separately, for
  `amd64`/`GOAMD64=v1`
- **THEN** every generated feature's fields are identical between the two
  runs, including every `Resource.Richness` value

#### Scenario: The compiled generator emits zero fused multiply-add instructions
- **WHEN** `backend/system` is compiled for `arm64` and its compiled output
  is inspected for fused multiply-add instructions
- **THEN** no fused multiply-add instruction appears anywhere in the
  compiled package's output
- **AND** `backend/system` carries no entry in the capability's deviation register

### Requirement: Lattice Placement Is Independent Of The Continuous Stream
The interior generator SHALL derive its lattice-tier placement output —
every generated feature's id, type, ring, angular position, direction,
parent id, footprint cells, resource kind and richness, and effects, in
generation order — as a function of the per-system seed alone, unaffected by
whether the generator also draws continuous orbital elements for the same
interior, or by the value of the continuous seed it draws them from when it
does. The continuous stream SHALL independently vary its own output with its
own seed, so that a lattice output identical across two runs is evidence of
correct stream separation rather than of a continuous stream that produces
no output at all. The generator SHALL additionally pin, per recorded case,
the number of words it consumes from the lattice stream, because a
continuous element drawn from the lattice stream after the last lattice
draw shifts no output and is therefore invisible to a present-versus-absent
comparison.

#### Scenario: Lattice placement is unchanged whether continuous draws are present or absent
- **WHEN** an interior is generated across a swept set of seeds, with the
  continuous element draws present and again with them absent
- **THEN** every feature's lattice ring, start angle, direction, footprint,
  resources, effects, id, type, parent id, and generation order are
  identical between the two runs, for every seed
- **AND** this assertion is inherited from `add-orbital-system-bodies`'s own
  "Adding continuous elements leaves every lattice placement unchanged"
  scenario, which shares the same WHEN/THEN against a differently-named
  requirement; the two are intentionally paired, not independently derived,
  and a future editor changing one SHALL check the other

#### Scenario: The lattice stream's word consumption is pinned per case
- **WHEN** an interior is generated for a recorded case with an instrumented
  lattice stream that counts every word drawn from it
- **THEN** the number of lattice-stream words consumed equals the count
  recorded for that case in the `interiorElements` fixture family
- **AND** the instrumented run's lattice-tier projection is byte-identical to
  the uninstrumented run's, so the instrument cannot alter what it measures

#### Scenario: Differing continuous seeds leave the lattice projection unchanged
- **WHEN** the generator is invoked twice with the same lattice seed and two
  different continuous seeds
- **THEN** the lattice-tier projection (ids, type, ring, angular position,
  direction, parent id, footprint, resources, effects, in generation order)
  is identical between the two runs

#### Scenario: Differing continuous seeds produce differing continuous elements
- **WHEN** the generator is invoked twice with the same lattice seed and two
  different continuous seeds
- **THEN** the continuous orbital elements (space position, size, width) of
  at least one feature differ between the two runs, demonstrating the
  continuous stream is live rather than accidentally disconnected
