package common

// Auth method constants - the canonical names for connection authentication methods.
// These are the source of truth; providers.go Auth fields must use these values.
const (
	AuthOAuth2            = "oauth2"
	AuthIAM               = "iam"
	AuthDatabase          = "database"
	AuthBearerToken       = "bearer_token"
	AuthClientCredentials = "client_credentials"
	AuthNone              = "none"
)
