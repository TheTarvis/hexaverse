package space

import (
	"errors"

	"hexaverse/common"
)

// maxBodyDepth bounds hierarchical resolution (star -> planet -> moon ->
// station is 4 levels) so a cyclic parent chain fails with a named error at
// a bounded recursion depth rather than recursing forever (design.md
// Decision 9; space-kinematics: "A cyclic parent chain fails with a named
// error, not unbounded recursion").
const maxBodyDepth = 4

// ErrUnknownBody is returned when a body's stored parent identity does not
// resolve through the injected Bodies lookup.
var ErrUnknownBody = errors.New("space: unknown body")

// ErrBodyCycle is returned when a body's parent chain returns to a body
// already visited during the same resolution, within the depth bound.
var ErrBodyCycle = errors.New("space: cyclic parent chain")

// Body is a body's identity, size, and (if any) orbital elements. A nil
// Orbit means parentless — the star, positioned at the origin.
type Body struct {
	Id    string
	Size  float64
	Orbit *Orbit
}

// Bodies resolves body identity to orbital elements. Accepted as an
// interface because space owns no storage and mints no body; system/galaxy
// do (design.md Decision 9).
type Bodies interface {
	Body(id string) (Body, bool)
}

// Position derives a body's position at world time t recursively through
// its parent chain: a parentless body is at the origin; a parented body is
// at its parent's position plus its own local orbital offset
// (space-kinematics: "Orbital Position Is a Closed-Form Function of Time").
func Position(bodies Bodies, id string, t common.WorldMillis) (Vec3, error) {
	return resolvePosition(bodies, id, t, 0, map[string]bool{})
}

func resolvePosition(bodies Bodies, id string, t common.WorldMillis, depth int, visited map[string]bool) (Vec3, error) {
	if depth >= maxBodyDepth {
		return Vec3{}, ErrBodyCycle
	}
	if visited[id] {
		return Vec3{}, ErrBodyCycle
	}
	visited[id] = true

	b, ok := bodies.Body(id)
	if !ok {
		return Vec3{}, ErrUnknownBody
	}
	if b.Orbit == nil {
		return Vec3{}, nil
	}
	parentPos, err := resolvePosition(bodies, b.Orbit.ParentId, t, depth+1, visited)
	if err != nil {
		return Vec3{}, err
	}
	return parentPos.Add(b.Orbit.LocalPosition(t)), nil
}

// Velocity derives a body's instantaneous velocity at world time t
// analytically: a parentless body's velocity is the zero vector; a
// parented body's velocity is its parent's velocity plus its own local
// orbital velocity (space-kinematics: "A Body's Velocity Is Computed
// Analytically, Not by Finite Difference").
func Velocity(bodies Bodies, id string, t common.WorldMillis) (Vec3, error) {
	return resolveVelocity(bodies, id, t, 0, map[string]bool{})
}

func resolveVelocity(bodies Bodies, id string, t common.WorldMillis, depth int, visited map[string]bool) (Vec3, error) {
	if depth >= maxBodyDepth {
		return Vec3{}, ErrBodyCycle
	}
	if visited[id] {
		return Vec3{}, ErrBodyCycle
	}
	visited[id] = true

	b, ok := bodies.Body(id)
	if !ok {
		return Vec3{}, ErrUnknownBody
	}
	if b.Orbit == nil {
		return Vec3{}, nil
	}
	parentVel, err := resolveVelocity(bodies, b.Orbit.ParentId, t, depth+1, visited)
	if err != nil {
		return Vec3{}, err
	}
	return parentVel.Add(b.Orbit.LocalVelocity(t)), nil
}
