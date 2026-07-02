package config

// Config holds the server configuration
type Config struct {
	Port               string
	PubSubProjectID    string
	PubSubTopicID      string
	PubSubEmulatorHost string
	FirebaseCredFile   string
}
