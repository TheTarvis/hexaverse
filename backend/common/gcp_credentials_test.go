package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGCPClientOptions(t *testing.T) {
	// In test environment (emulator), credentials may fail to initialize
	// but the function should return nil gracefully, not panic
	opts := GCPClientOptions()

	// Either returns options or nil - both are valid depending on environment
	// The important thing is it doesn't panic
	if opts != nil {
		assert.NotEmpty(t, opts, "If credentials are available, options should be returned")
	}
}

func TestGCPClientOptionsIdempotent(t *testing.T) {
	// Calling multiple times should return the same result (sync.Once behavior)
	opts1 := GCPClientOptions()
	opts2 := GCPClientOptions()

	// Both calls should return the same result
	if opts1 == nil {
		assert.Nil(t, opts2, "Both calls should return nil if first was nil")
	} else {
		assert.NotNil(t, opts2, "Both calls should return non-nil if first was non-nil")
		assert.Equal(t, len(opts1), len(opts2), "Both calls should return same number of options")
	}
}
