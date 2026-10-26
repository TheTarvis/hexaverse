// Package tuning holds local developer overrides. Domain packages retain their
// defaults and opt into overrides with Number; no domain depends on the HTTP UI.
package tuning

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Field struct {
	Key        string  `json:"key"`
	Label      string  `json:"label"`
	Group      string  `json:"group"`
	Unit       string  `json:"unit"`
	Default    float64 `json:"default"`
	Min        float64 `json:"min"`
	Max        float64 `json:"max"`
	Integer    bool    `json:"integer,omitempty"`
	Regenerate bool    `json:"regenerate,omitempty"`
}
type Profile struct {
	Version int                `json:"version"`
	Values  map[string]float64 `json:"values"`
}
type Anchor struct {
	Wall  time.Time `json:"wall"`
	World int64     `json:"world"`
	Scale float64   `json:"scale"`
}

func (a Anchor) At(wall time.Time) int64 {
	return a.World + int64(float64(wall.Sub(a.Wall).Milliseconds())*a.Scale)
}

type diskState struct {
	Saved      Profile            `json:"profile"`
	Generation map[string]float64 `json:"generation"`
	Clock      Anchor             `json:"clock"`
}
type Snapshot struct {
	Fields         []Field            `json:"fields"`
	Profile        Profile            `json:"profile"`
	Active         map[string]float64 `json:"active"`
	RestartPending bool               `json:"restartPending"`
}

var state struct {
	sync.RWMutex
	enabled bool
	path    string
	fields  []Field
	disk    diskState
	active  map[string]float64
}

func Enabled() bool { state.RLock(); defer state.RUnlock(); return state.enabled }
func Number(key string, fallback float64) float64 {
	state.RLock()
	defer state.RUnlock()
	if state.enabled {
		if v, ok := state.active[key]; ok {
			return v
		}
	}
	return fallback
}
func Copy(values map[string]float64) map[string]float64 {
	out := make(map[string]float64, len(values))
	for k, v := range values {
		out[k] = v
	}
	return out
}
func defaults(fields []Field) Profile {
	p := Profile{Version: 1, Values: map[string]float64{}}
	for _, f := range fields {
		p.Values[f.Key] = f.Default
	}
	return p
}
func Validate(p Profile, fields []Field) error {
	if p.Version != 1 {
		return fmt.Errorf("unsupported tuning profile version %d", p.Version)
	}
	if len(p.Values) != len(fields) {
		return fmt.Errorf("profile must contain all %d tuning values", len(fields))
	}
	for _, f := range fields {
		v, ok := p.Values[f.Key]
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) || v < f.Min || v > f.Max || (f.Integer && math.Trunc(v) != v) {
			return fmt.Errorf("invalid %s: expected %g–%g %s", f.Label, f.Min, f.Max, f.Unit)
		}
	}
	get := func(k string) float64 { return p.Values[k] }

	if get("generation.minBodies") > get("generation.maxBodies") {
		return fmt.Errorf("minimum bodies exceeds maximum bodies")
	}
	if get("generation.maxBodies") > get("generation.maxRings") {
		return fmt.Errorf("maximum bodies exceeds available orbital shells")
	}
	if get("generation.maxRings")-1 > get("generation.maxOrbitalIndex") {
		return fmt.Errorf("galaxy shells exceed system extent")
	}
	if get("markets.premiumLow") > get("markets.premiumHigh") || get("markets.quantityLow") > get("markets.quantityHigh") {
		return fmt.Errorf("market lower bound exceeds upper bound")
	}
	return nil
}

// Initialize runs once on local startup, before clocks, seeding or services.
func Initialize(path string, fields []Field, wall time.Time, initialScale float64) error {
	state.Lock()
	defer state.Unlock()
	state.fields = fields
	state.path = path
	p := defaults(fields)
	epoch := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	d := diskState{Saved: p, Generation: Copy(p.Values), Clock: Anchor{wall, int64(float64(wall.Sub(epoch).Milliseconds()) * initialScale), initialScale}}
	data, err := os.ReadFile(path)
	if err == nil {
		if err = json.Unmarshal(data, &d); err != nil {
			return fmt.Errorf("read tuning: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err = Validate(d.Saved, fields); err != nil {
		return err
	}
	if d.Clock.Scale <= 0 || d.Clock.Wall.IsZero() {
		return fmt.Errorf("invalid saved world clock")
	}
	if err = Validate(Profile{1, d.Generation}, fields); err != nil {
		return fmt.Errorf("invalid active generation settings: %w", err)
	}
	// First account for downtime at the previous speed, then adopt startup speed.
	d.Clock = Anchor{wall, d.Clock.At(wall), d.Saved.Values["world.speed"]}
	state.disk = d
	state.active = Copy(d.Saved.Values)
	for _, f := range fields {
		if f.Regenerate {
			state.active[f.Key] = d.Generation[f.Key]
		}
	}
	if err = save(d); err != nil {
		return err
	}
	state.enabled = true
	return nil
}
func save(d diskState) error {
	if err := os.MkdirAll(filepath.Dir(state.path), 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(d, "", "  ")
	if err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(state.path), "tuning-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if _, err = temp.Write(b); err != nil {
		temp.Close()
		return err
	}
	if err = temp.Close(); err != nil {
		return err
	}
	return os.Rename(temp.Name(), state.path)
}
func ClockAt(wall time.Time) int64 {
	state.RLock()
	defer state.RUnlock()
	return state.disk.Clock.At(wall)
}
func ClockScale() float64 { state.RLock(); defer state.RUnlock(); return state.disk.Clock.Scale }
func Get() Snapshot {
	state.RLock()
	defer state.RUnlock()
	pending := false
	for k, v := range state.disk.Saved.Values {
		if state.active[k] != v {
			pending = true
		}
	}
	return Snapshot{append([]Field(nil), state.fields...), Profile{1, Copy(state.disk.Saved.Values)}, Copy(state.active), pending}
}

// Apply changes live values and saves all values; generation values stay staged.
func Apply(p Profile, wall time.Time) error {
	state.Lock()
	defer state.Unlock()
	if !state.enabled {
		return fmt.Errorf("local tuning is unavailable")
	}
	if err := Validate(p, state.fields); err != nil {
		return err
	}
	d := state.disk
	d.Saved = Profile{1, Copy(p.Values)}
	d.Clock = Anchor{wall, d.Clock.At(wall), p.Values["world.speed"]}
	if err := save(d); err != nil {
		return err
	}
	state.disk = d
	for _, f := range state.fields {
		if !f.Regenerate {
			state.active[f.Key] = p.Values[f.Key]
		}
	}
	return nil
}

// Stage saves an imported profile without changing any currently active values.
func Stage(p Profile) error {
	state.Lock()
	defer state.Unlock()
	if !state.enabled {
		return fmt.Errorf("local tuning is unavailable")
	}
	if err := Validate(p, state.fields); err != nil {
		return err
	}
	d := state.disk
	d.Saved = Profile{1, Copy(p.Values)}
	if err := save(d); err != nil {
		return err
	}
	state.disk = d
	return nil
}
func ActivateGeneration() error {
	state.Lock()
	defer state.Unlock()
	d := state.disk
	d.Generation = Copy(d.Saved.Values)
	if err := save(d); err != nil {
		return err
	}
	state.disk = d
	for _, f := range state.fields {
		if f.Regenerate {
			state.active[f.Key] = d.Saved.Values[f.Key]
		}
	}
	return nil
}

// Reject JSON null as a number; encoding/json otherwise silently treats it as zero.
func (p *Profile) UnmarshalJSON(data []byte) error {
	var raw struct {
		Version int                 `json:"version"`
		Values  map[string]*float64 `json:"values"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	values := make(map[string]float64, len(raw.Values))
	for key, value := range raw.Values {
		if value == nil {
			return fmt.Errorf("%s must be a number", key)
		}
		values[key] = *value
	}
	p.Version = raw.Version
	p.Values = values
	return nil
}
