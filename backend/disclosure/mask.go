package disclosure

import (
	"hexaverse/common"
	"hexaverse/space"
)

// OutermostHost walks a masking chain to the entity it ultimately registers
// as: a ship docked to a carrier docked to a body registers as the body.
// Returns the id itself when nothing is attached above it.
//
// Transitive is the chosen starting point over the alternative — sweeping a
// body reveals only the carrier, and revealing what is inside the carrier
// needs a second scan — because it is the simpler of the two. The narrower
// rule makes carriers a real stealth investment and is a reasonable later
// change; it touches this function and one scenario.
//
// A cycle is a data error. The visited set catches a true cycle; the depth
// bound catches a chain long enough to be wrong for some other reason. Both
// return ErrAttachmentCycle rather than looping or returning a partial
// chain.
func OutermostHost(att Attachments, id string) (string, error) {
	if att == nil {
		return id, nil
	}
	visited := map[string]bool{id: true}
	current := id
	for depth := 0; depth < maxAttachmentDepth; depth++ {
		host, ok := att.HostOf(current)
		if !ok || host == "" {
			return current, nil
		}
		if visited[host] {
			return "", ErrAttachmentCycle
		}
		visited[host] = true
		current = host
	}
	return "", ErrAttachmentCycle
}

// Masked reports whether a ship is hidden inside a host at world time t.
//
// Two clauses, and their ORDER is the requirement "Lighting a Drive Breaks
// Masking": emission wins. A ship whose burn interval is open is unmasked
// from its departMs, so departing a host is a detectable event — masking
// and emission never hold at once. When the burn resolves into a docked
// park the interval has closed, emission is false again, and the stored
// attachment re-masks it with no separate "re-mask" write.
//
// A masked ship is ABSENT from every live channel, not marked as hidden.
func Masked(att Attachments, id string, s space.ShipState, t common.WorldMillis) (bool, error) {
	if Emitting(s, t) {
		return false, nil
	}
	host, err := OutermostHost(att, id)
	if err != nil {
		return false, err
	}
	return host != id, nil
}

// chainBeneath returns every id masked at hostId, including those masked
// further down the chain, in the stable order Attachments reports.
//
// It is used ONLY by the focused scan. No live disclosure path calls it,
// and that is deliberate: a host's own disclosure must be computable
// without reference to what is masked at it, so nothing that can see the
// chain may reach the live channels.
func chainBeneath(att Attachments, hostId string) ([]string, error) {
	if att == nil {
		return nil, nil
	}
	var out []string
	visited := map[string]bool{hostId: true}
	var walk func(id string, depth int) error
	walk = func(id string, depth int) error {
		if depth >= maxAttachmentDepth {
			return ErrAttachmentCycle
		}
		for _, child := range att.AttachedTo(id) {
			if visited[child] {
				return ErrAttachmentCycle
			}
			visited[child] = true
			out = append(out, child)
			if err := walk(child, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk(hostId, 0); err != nil {
		return nil, err
	}
	return out, nil
}
