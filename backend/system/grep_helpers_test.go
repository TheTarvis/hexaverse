package system

// Shared test-only helpers for this RED-phase suite (openspec change
// add-orbital-system-bodies).

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// assertErr is a generic sentinel used across this suite's fakes wherever a
// test only needs "some non-nil error occurred", not a specific identity.
var assertErr = errors.New("system: simulated store failure (test fixture)")

// assertNoHandlerReferences is the static half of system-body-table's "The
// Body Table Is an Unfiltered Internal Seam, Never a Response" requirement:
// it greps every handler.go in the backend module for the given substring
// and fails if found — a handler reaching for BodyTable or Ids() directly
// would bypass the disclosure filter the requirement mandates.
func assertNoHandlerReferences(t *testing.T, substr string) {
	t.Helper()
	root := "../" // backend/ — this file lives at backend/system/
	var hits []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		if !strings.HasSuffix(path, "handler.go") {
			return nil
		}
		b, rerr := os.ReadFile(path)
		if rerr != nil {
			return rerr
		}
		if strings.Contains(string(b), substr) {
			hits = append(hits, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walking backend/ for handler.go files: %v", err)
	}
	if len(hits) > 0 {
		t.Errorf("%q referenced directly in handler code (bypasses the disclosure filter): %v", substr, hits)
	}
}
