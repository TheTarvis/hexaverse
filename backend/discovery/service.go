package discovery

import (
	"context"
	"errors"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
)

var (
	ErrForbidden = errors.New("surveyed naming entitlement required")
	ErrConflict  = errors.New("name or claim already reserved")
	ErrLocked    = errors.New("the first confirmed name is permanent")
	ErrInvalid   = errors.New("invalid celestial name")
	ErrNotFound  = errors.New("celestial object not found")
)

type GalaxySource interface {
	LiveIdentity(context.Context) (string, error)
}
type TargetSource interface {
	DiscoveryTargets(context.Context, string) ([]Target, error)
}
type Service struct {
	dao     Dao
	galaxy  GalaxySource
	targets TargetSource
	clock   common.WorldTime
}

func NewService(g GalaxySource, t TargetSource, c common.WorldTime) *Service {
	return NewServiceWithDao(NewDao(), g, t, c)
}
func NewServiceWithDao(d Dao, g GalaxySource, t TargetSource, c common.WorldTime) *Service {
	return &Service{d, g, t, c}
}
func (s *Service) Records(ctx context.Context, gid string) ([]Record, error) {
	return s.dao.Records(ctx, gid)
}
func (s *Service) EnsureHome(ctx context.Context, sid, cid, name string) error {
	gid, err := s.galaxy.LiveIdentity(ctx)
	if err != nil {
		return err
	}
	return s.dao.Home(ctx, gid, sid, cid, name, s.clock.Now())
}
func (s *Service) Target(ctx context.Context, sid, bid string) (*Target, error) {
	targets, err := s.targets.DiscoveryTargets(ctx, sid)
	if err != nil {
		return nil, err
	}
	for _, t := range targets {
		if t.BodyId == bid {
			return &t, nil
		}
	}
	return nil, ErrNotFound
}
func (s *Service) ConfirmName(ctx context.Context, sid, bid, cid, input string) (*Record, error) {
	name, err := ValidateName(input)
	if err != nil {
		return nil, err
	}
	target, err := s.Target(ctx, sid, bid)
	if err != nil {
		return nil, err
	}
	if !Eligible(target.Kind) || target.Protected {
		return nil, ErrForbidden
	}
	{
		targets, err := s.targets.DiscoveryTargets(ctx, sid)
		if err != nil {
			return nil, err
		}
		for _, t := range targets {
			if t.BodyId != bid && Canonical(t.Name) == Canonical(name) {
				return nil, ErrConflict
			}
		}
	}
	return s.dao.Name(ctx, *target, cid, name, s.clock.Now())
}

func (s *Service) Targets(ctx context.Context, sid string) ([]Target, error) {
	return s.targets.DiscoveryTargets(ctx, sid)
}

func (s *Service) HomeInTx(ctx context.Context, tx *firestore.Transaction, gid, sid, cid, name string, at common.WorldMillis) error {
	return s.dao.HomeInTx(ctx, tx, gid, sid, cid, name, at)
}
