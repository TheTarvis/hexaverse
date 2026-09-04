package system

import (
	"bytes"
	"testing"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// TestGetOrCreateInterior_Scenario_StoredFeatureOutsideLiveRadiusIsRejectedAtBoundary
// and TestGetOrCreateInterior_Scenario_MultipleBadFeaturesAllOmittedIndependently
// (DELETED) used to pin system-interior's "Interior Feature Decode Validates
// Ring Against the Live Schedule" — a decoded feature whose stored ring
// exceeded the live schedule's MaxRing was omitted from the interior read,
// because any downstream coordinate-table computation on an out-of-range ring
// panicked. That requirement is REMOVED: a feature carries no ring any more,
// there is no schedule to validate it against, and no code path can panic on
// one. The tests asserted a guard that has no subject left, so they are
// deleted outright rather than repointed (test-immutability protocol: an
// authorized change, cause = the spec removed the requirement they pinned).
//
// The read's SURVIVING per-feature guard — every non-star feature must decode
// a continuous orbital element set, one bad feature never stopping the loop —
// is pinned in full by interior_continuous_decode_test.go, which is where
// this file's runGuarded sibling coverage now lives.
//
// captureLog stays here: it is this package's shared log-capture helper (14
// call sites across gate_body_test.go, spliced_body_complete_or_loud_test.go
// and interior_continuous_decode_test.go), and the continuous decode guard it
// serves is very much alive.

// captureLog swaps the global zerolog logger for the duration of fn so a test
// can assert on structured log content without a production seam — production
// code logs through the package-level github.com/rs/zerolog/log singleton
// (see system/service.go's log.Warn().Ctx(ctx)... calls), and this is the only
// way to observe it from a black-box test.
func captureLog(t *testing.T, fn func()) string {
	t.Helper()
	var buf bytes.Buffer
	original := log.Logger
	log.Logger = zerolog.New(&buf)
	defer func() { log.Logger = original }()
	fn()
	return buf.String()
}
