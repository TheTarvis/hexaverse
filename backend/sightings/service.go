package sightings

import "context"

// Service is the sighting-pile read path: bounding and defaulting the page
// size before it ever reaches the Dao (specs/sighting-records/spec.md —
// "The Pile Is Paginated and Bounded Per Read").
type Service struct {
	dao Dao
}

// NewService constructs the production Service.
func NewService() *Service { return &Service{dao: NewDao()} }

// NewServiceWith constructs a Service from an explicit Dao, for tests.
func NewServiceWith(dao Dao) *Service { return &Service{dao: dao} }

// List returns a page of cid's sighting pile, newest pulse-reach (AsOf)
// first. limit is clamped to (0, PageMax]: an unspecified or zero limit
// defaults to PageMax, and a caller-requested limit above PageMax is
// clamped rather than honored — the bound is a hard ceiling on the read
// surface, never a caller-overridable default. cursor is opaque and passed
// through unchanged. systemId is variadic so every pre-existing 4-argument
// call site keeps compiling unchanged; a non-empty first element restricts
// the page to that system's records — ordered, bounded, and cursored
// exactly as the unfiltered read is (sighting-records "The Pile Read
// Filters To One System On Request").
func (s *Service) List(ctx context.Context, cid string, limit int, cursor string, systemId ...string) ([]Sighting, string, error) {
	if limit <= 0 || limit > PageMax {
		limit = PageMax
	}
	return s.dao.List(ctx, cid, limit, cursor, systemId...)
}
