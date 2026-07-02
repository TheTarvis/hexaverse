package sse

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSSEManager_AddClient(t *testing.T) {
	manager := &SSEManager{clients: map[string]*SSEClient{}}

	client := NewSSEClient(context.Background(), "channel-456", "account-789", false)
	manager.AddClient(client)

	assert.Equal(t, 1, manager.GetClientCount())
}

func TestSSEManager_RemoveClient(t *testing.T) {
	manager := &SSEManager{clients: map[string]*SSEClient{}}

	client := NewSSEClient(context.Background(), "channel-456", "account-789", false)
	manager.AddClient(client)
	assert.Equal(t, 1, manager.GetClientCount())

	manager.RemoveClient(client.ID)
	assert.Equal(t, 0, manager.GetClientCount())
}

func TestSSEManager_RemoveClient_NonExistent(t *testing.T) {
	manager := &SSEManager{clients: map[string]*SSEClient{}}

	manager.RemoveClient("non-existent-client")
	assert.Equal(t, 0, manager.GetClientCount())
}

func TestSSEManager_GetClientCount(t *testing.T) {
	manager := &SSEManager{clients: map[string]*SSEClient{}}

	assert.Equal(t, 0, manager.GetClientCount())

	for i := 0; i < 5; i++ {
		manager.AddClient(NewSSEClient(context.Background(), "channel-456", "account", false))
	}

	assert.Equal(t, 5, manager.GetClientCount())
}

func TestSSEManager_BroadcastToChannel(t *testing.T) {
	manager := &SSEManager{clients: map[string]*SSEClient{}}

	target := NewSSEClient(context.Background(), "channel-A", "account-1", false)
	other := NewSSEClient(context.Background(), "channel-B", "account-2", false)
	manager.AddClient(target)
	manager.AddClient(other)

	event := &Event{
		Type:      "test.event",
		Timestamp: "2024-01-15T10:00:00Z",
		Data:      map[string]interface{}{"itemId": "item-1"},
	}

	manager.BroadcastToChannel("channel-A", event)

	select {
	case received := <-target.Channel:
		assert.Equal(t, "test.event", received.Type)
	default:
		t.Error("Expected event to be received by target channel client")
	}

	select {
	case <-other.Channel:
		t.Error("Other channel client should not receive event")
	default:
	}
}

func TestSSEManager_BroadcastToAccount(t *testing.T) {
	manager := &SSEManager{clients: map[string]*SSEClient{}}

	target := NewSSEClient(context.Background(), "channel-A", "account-1", false)
	other := NewSSEClient(context.Background(), "channel-A", "account-2", false)
	manager.AddClient(target)
	manager.AddClient(other)

	event := &Event{Type: "notification", Data: map[string]interface{}{}}
	manager.BroadcastToAccount("account-1", event)

	select {
	case <-target.Channel:
	default:
		t.Error("Account-targeted client did not receive event")
	}

	select {
	case <-other.Channel:
		t.Error("Other account should not receive event")
	default:
	}
}

func TestSSEManager_BroadcastToAdmins(t *testing.T) {
	manager := &SSEManager{clients: map[string]*SSEClient{}}

	admin := NewSSEClient(context.Background(), "channel-A", "admin", true)
	regular := NewSSEClient(context.Background(), "channel-A", "regular", false)
	manager.AddClient(admin)
	manager.AddClient(regular)

	manager.BroadcastToAdmins(&Event{Type: "admin.alert", Data: map[string]interface{}{}})

	select {
	case <-admin.Channel:
	default:
		t.Error("Admin client did not receive event")
	}

	select {
	case <-regular.Channel:
		t.Error("Regular client should not receive admin event")
	default:
	}
}

func TestNewSSEClient(t *testing.T) {
	client := NewSSEClient(context.Background(), "channel-123", "account-456", true)

	assert.NotEmpty(t, client.ID)
	assert.Equal(t, "channel-123", client.ChannelId)
	assert.Equal(t, "account-456", client.AccountId)
	assert.True(t, client.IsAdmin)
	assert.NotNil(t, client.Channel)
	assert.Equal(t, 100, cap(client.Channel))
}
