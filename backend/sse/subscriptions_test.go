package sse

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetSSEManager(t *testing.T) {
	manager := GetSSEManager()
	assert.NotNil(t, manager)

	manager2 := GetSSEManager()
	assert.Equal(t, manager, manager2)
}
