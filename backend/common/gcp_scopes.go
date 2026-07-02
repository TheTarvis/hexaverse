package common

// UserGCPScopes defines the OAuth scopes requested from users when they connect
// their GCP accounts. These scopes appear on the OAuth consent screen.
//
// IMPORTANT: Adding scopes requires updating the GCP OAuth consent screen
// and may trigger re-verification. See docs/gcp/oauth_scopes.md for details.
//
// This is the single source of truth for user-facing GCP scopes.
// Used by:
//   - oauthapps/platform.go (platform OAuth app configuration)
//   - google/auth.go (token source creation)
var UserGCPScopes = []string{
	"https://www.googleapis.com/auth/bigquery",
	"https://www.googleapis.com/auth/pubsub",
	"https://www.googleapis.com/auth/datastore",
	"https://www.googleapis.com/auth/devstorage.full_control",
	"https://www.googleapis.com/auth/cloudplatformprojects.readonly",
	"https://www.googleapis.com/auth/firebase.readonly",
	"https://www.googleapis.com/auth/gmail.readonly",
	"https://www.googleapis.com/auth/gmail.send",
	"https://www.googleapis.com/auth/gmail.modify",
	"https://www.googleapis.com/auth/drive",
}

// UserGCPScopesWithIdentity returns UserGCPScopes plus OpenID Connect scopes
// for user identity. Use this for OAuth consent flows.
func UserGCPScopesWithIdentity() []string {
	return append([]string{
		"openid",
		"email",
		"profile",
	}, UserGCPScopes...)
}

// GCPScopeGroup defines a user-friendly grouping of Google OAuth scopes.
// Users select scope groups (not raw URLs) when creating connections.
type GCPScopeGroup struct {
	ID       string   `json:"id"`
	Label    string   `json:"label"`
	Scopes   []string `json:"scopes"`
	Required bool     `json:"required"` // always included, not user-selectable
}

// GCPScopeGroups maps user-friendly group IDs to the raw Google scope URLs.
// "projects" is always required for basic GCP functionality (project picker).
var GCPScopeGroups = []GCPScopeGroup{
	{ID: "bigquery", Label: "BigQuery", Scopes: []string{
		"https://www.googleapis.com/auth/bigquery",
		"https://www.googleapis.com/auth/cloudplatformprojects.readonly",
	}},
	{ID: "storage", Label: "Cloud Storage", Scopes: []string{
		"https://www.googleapis.com/auth/devstorage.full_control",
		"https://www.googleapis.com/auth/cloudplatformprojects.readonly",
	}},
	{ID: "firestore", Label: "Firestore", Scopes: []string{
		"https://www.googleapis.com/auth/datastore",
		"https://www.googleapis.com/auth/firebase.readonly",
		"https://www.googleapis.com/auth/cloudplatformprojects.readonly",
	}},
	{ID: "pubsub", Label: "Pub/Sub", Scopes: []string{
		"https://www.googleapis.com/auth/pubsub",
		"https://www.googleapis.com/auth/cloudplatformprojects.readonly",
	}},
	{ID: "gmail", Label: "Gmail", Scopes: []string{
		"https://www.googleapis.com/auth/gmail.readonly",
		"https://www.googleapis.com/auth/gmail.send",
		"https://www.googleapis.com/auth/gmail.modify",
	}},
	{ID: "drive", Label: "Google Drive", Scopes: []string{
		"https://www.googleapis.com/auth/drive",
	}},
}

// gcpScopeGroupMap is a lookup index built from GCPScopeGroups.
var gcpScopeGroupMap map[string]*GCPScopeGroup

func init() {
	gcpScopeGroupMap = make(map[string]*GCPScopeGroup, len(GCPScopeGroups))
	for i := range GCPScopeGroups {
		gcpScopeGroupMap[GCPScopeGroups[i].ID] = &GCPScopeGroups[i]
	}
}

// ResolveScopeGroups converts scope group IDs to full Google OAuth scope URLs.
// Always includes identity scopes (openid, email, profile).
// Duplicate scopes across groups are deduplicated automatically.
func ResolveScopeGroups(groupIDs []string) []string {
	seen := make(map[string]bool)
	var scopes []string

	// Always include identity scopes
	for _, s := range []string{"openid", "email", "profile"} {
		scopes = append(scopes, s)
		seen[s] = true
	}

	// Add requested groups
	for _, id := range groupIDs {
		if g, ok := gcpScopeGroupMap[id]; ok {
			for _, s := range g.Scopes {
				if !seen[s] {
					scopes = append(scopes, s)
					seen[s] = true
				}
			}
		}
	}

	return scopes
}

// ScopeURLsToGroups reverse-maps full scope URLs back to scope group IDs.
// Returns only groups where ALL scopes in the group are present.
func ScopeURLsToGroups(scopes []string) []string {
	scopeSet := make(map[string]bool, len(scopes))
	for _, s := range scopes {
		scopeSet[s] = true
	}

	var groups []string
	for _, g := range GCPScopeGroups {
		allPresent := true
		for _, s := range g.Scopes {
			if !scopeSet[s] {
				allPresent = false
				break
			}
		}
		if allPresent {
			groups = append(groups, g.ID)
		}
	}
	return groups
}

// MergeScopeGroups combines two lists of scope group IDs, deduplicating.
func MergeScopeGroups(existing, additional []string) []string {
	seen := make(map[string]bool, len(existing))
	merged := make([]string, 0, len(existing)+len(additional))
	for _, g := range existing {
		seen[g] = true
		merged = append(merged, g)
	}
	for _, g := range additional {
		if !seen[g] {
			merged = append(merged, g)
		}
	}
	return merged
}
