package common

// Context Keys
const (
	TracerKey       = "x-tracer"
	FirestoreUidKey = "x-firestore-uid"
	AccountIdKey    = "x-uid"
	IsAdminKey      = "x-is-admin"
	// CorpIdKey holds the requester's living-corporation id, resolved once per
	// request by the ResolveCorporation middleware (#0009). ActorCorp reads it;
	// fog + ownership key on it. Empty for a signed-in account that hasn't woken.
	CorpIdKey = "x-corp"
)

const AppId = "appId"

type EventsObject struct {
	Topics []string
}

var Events EventsObject
