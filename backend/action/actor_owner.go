package action

import "context"

// ActorOwner resolves an action actor to the corporation that owns it — the
// seam the four action endpoints authorize through (action-dispatch "Action
// Endpoints Are Restricted to the Owning Corporation",
// replace-observation-with-sightings tasks.md 6.5).
//
// It is declared HERE, in action, and satisfied at the composition root
// (router.go) by an adapter over the fleet service: the dependency between
// these two packages already runs the other way — fleet imports action to
// commit and resolve — so action importing fleet back would be an import
// cycle. The `collection` parameter is what keeps this package verb-agnostic:
// an action already stores its actor's home collection in
// Action.ActorCollection, so the handler can ask "who owns this actor" without
// knowing which verb's package the actor lives in.
//
// Two conventions the implementation is expected to honour, neither of them
// derived from a scenario:
//
//   - An EMPTY collection means "the caller does not know which collection
//     this actor lives in — resolve it across the actor collections you know".
//     GET /v1/actions?actor=<id> is exactly that case: the wire carries an
//     actor id and no collection, and there is no action document to read one
//     off before the ownership decision is made.
//   - An actor that cannot be found is NOT an error: it resolves to an empty
//     corporation id with a nil error, which the handler treats as "not
//     owned by the requester" and answers as absence. An error return is
//     reserved for a genuine lookup failure.
type ActorOwner interface {
	OwnerOf(ctx context.Context, collection, actorId string) (corpId string, err error)
}
