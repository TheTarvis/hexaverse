// Command seed generates and persists the live galaxy for an environment, and
// (with the `start-area` subcommand) emits the frozen logged-out start-area
// asset the frontend serves statically. Re-runnable: a fresh galaxy is written
// under a new id and the "live" pointer is flipped, never corrupting the
// previous world in place.
//
//	go run ./cmd/seed                 # seed the live galaxy (uses Firestore/emulator)
//	SEED=1234 go run ./cmd/seed       # seed with a specific seed
//	go run ./cmd/seed start-area      # (re)generate frontend/public/galaxy/start-area.json
//
// Configuration comes from env vars, not CLI flags, because the shared `config`
// package parses os.Args at init and rejects unknown flags.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"hexaverse/galaxy"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "start-area" {
		out := envOr("START_AREA_OUT", "../frontend/public/galaxy/start-area.json")
		if err := writeStartArea(out); err != nil {
			fmt.Fprintf(os.Stderr, "start-area generation failed: %v\n", err)
			os.Exit(1)
		}
		return
	}

	seed := int64(1)
	if s := os.Getenv("SEED"); s != "" {
		v, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			fmt.Fprintf(os.Stderr, "invalid SEED %q: %v\n", s, err)
			os.Exit(1)
		}
		seed = v
	}

	if err := seedLive(seed); err != nil {
		fmt.Fprintf(os.Stderr, "seeding failed: %v\n", err)
		os.Exit(1)
	}
}

func seedLive(seed int64) error {
	ctx := context.Background()
	svc := galaxy.NewService()
	gen, err := svc.Generate(ctx, seed, galaxy.DefaultParams())
	if err != nil {
		return err
	}
	fmt.Printf("Seeded live galaxy %s: %d systems, %d lanes (seed %d)\n",
		gen.Galaxy.Id, len(gen.Systems), len(gen.Lanes), seed)
	return nil
}

// writeStartArea generates the fixed start-area mini-galaxy and writes it as the
// same pinned wire shape the frontend consumes — frozen, committed, never
// regenerated at request time.
func writeStartArea(out string) error {
	gen := galaxy.Generate(galaxy.StartAreaSeed, galaxy.StartAreaParams())
	gen.Galaxy.Id = "gal_start_area"
	gen.Galaxy.CreatedAt = 0 // frozen

	dto := galaxy.ToDTO(&gen, 0)
	data, err := json.MarshalIndent(dto, "", "  ")
	if err != nil {
		return err
	}

	abs, err := filepath.Abs(out)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(abs, append(data, '\n'), 0o644); err != nil {
		return err
	}
	fmt.Printf("Wrote start-area asset (%d systems, %d lanes) to %s\n",
		len(gen.Systems), len(gen.Lanes), abs)
	return nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
