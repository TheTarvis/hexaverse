package websocket

import (
	"encoding/json"
)

// Message represents a websocket message
type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// ToJSON marshals the message to JSON
func (m *Message) ToJSON() ([]byte, error) {
	// If the payload is already a map with all the message fields,
	// use the raw payload directly to preserve all fields
	if rawMsg, ok := m.Payload.(map[string]interface{}); ok {
		// Ensure the type is preserved in the payload
		rawMsg["type"] = m.Type

		// Marshal the raw message
		return json.Marshal(rawMsg)
	}

	// Otherwise use the normal Message structure
	return json.Marshal(m)
}
