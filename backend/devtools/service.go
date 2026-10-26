package devtools

import (
	"context"
	"fmt"
	"hexaverse/config"
	"hexaverse/galaxy"
	"hexaverse/tuning"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Requests and local maintenance share one gate so no command races a reset.
var gate sync.RWMutex

func Initialize() error {
	if !config.LocalTuningAllowed() {
		return nil
	}
	path := os.Getenv("HEXAVERSE_TUNING_FILE")
	if path == "" {
		path = filepath.Join("..", ".scratch", "local-tuning", "state.json")
	}
	return tuning.Initialize(path, Catalogue(), time.Now(), config.ServiceConfig.WorldTimeScale)
}

type FleetTools interface {
	TrimCargoForTuning(context.Context, string) error
}
type Service struct {
	dao    *Dao
	fleets FleetTools
}

func NewService(dao *Dao, fleets FleetTools) *Service { return &Service{dao, fleets} }
func (s *Service) Apply(ctx context.Context, p tuning.Profile) error {
	gate.Lock()
	defer gate.Unlock()
	if err := tuning.Validate(p, tuning.Get().Fields); err != nil {
		return err
	}
	if err := tuning.Apply(p, time.Now()); err != nil {
		return err
	}
	return s.ReconcileCargo(ctx)
}

// Also run on startup so imported capacity settings trim existing cargo.
func (s *Service) ReconcileCargo(ctx context.Context) error {
	ids, err := s.dao.FleetIDs(ctx)
	if err != nil {
		return err
	}
	for _, id := range ids {
		if err = s.fleets.TrimCargoForTuning(ctx, id); err != nil {
			return fmt.Errorf("tuning saved; trimming fleet %s: %w", id, err)
		}
	}

	return nil
}
func (s *Service) Regenerate(ctx context.Context) error {
	gate.Lock()
	defer gate.Unlock()
	if err := s.dao.ClearGameplay(ctx); err != nil {
		return err
	}
	if err := tuning.ActivateGeneration(); err != nil {
		return err
	}
	return galaxy.SeedDevGalaxy(ctx)
}
