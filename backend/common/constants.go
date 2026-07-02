package common

// Context Keys
const (
	TracerKey       = "x-tracer"
	FirestoreUidKey = "x-firestore-uid"
	AccountIdKey    = "x-uid"
	IsAdminKey      = "x-is-admin"
)

const AppId = "appId"

type EventsObject struct {
	Topics []string
}

var Events EventsObject
