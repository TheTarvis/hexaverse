package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestConstants(t *testing.T) {
	assert.Equal(t, "x-tracer", TracerKey)
	assert.Equal(t, "x-firestore-uid", FirestoreUidKey)
	assert.Equal(t, "x-uid", AccountIdKey)
	assert.Equal(t, "x-is-admin", IsAdminKey)

	assert.Equal(t, "appId", AppId)
}

func TestEventsObject(t *testing.T) {
	_ = Events.Topics
}

func TestConstantsAreStrings(t *testing.T) {
	constants := []string{
		TracerKey,
		FirestoreUidKey,
		AccountIdKey,
		IsAdminKey,
		AppId,
	}

	for _, constant := range constants {
		assert.NotEmpty(t, constant)
		assert.IsType(t, "", constant)
	}
}

func TestContextKeyConstants(t *testing.T) {
	contextKeys := map[string]string{
		"TracerKey":       TracerKey,
		"FirestoreUidKey": FirestoreUidKey,
		"AccountIdKey":    AccountIdKey,
		"IsAdminKey":      IsAdminKey,
	}

	for name, key := range contextKeys {
		assert.NotEmpty(t, key, "%s should not be empty", name)
		assert.True(t, len(key) > 2 && key[0:2] == "x-", "%s should start with x-", name)
	}
}

func TestAppIdConstant(t *testing.T) {
	assert.Equal(t, "appId", AppId)
	assert.NotEmpty(t, AppId)
}
