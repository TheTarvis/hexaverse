package system

import (
	"context"
	"errors"
	"net/http"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/galaxy"
	"hexaverse/space"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// DueActions is the #0005 read-fold seam: resolving a scope's due actions.
// The interior read runs it first, so a verb that completed while nobody was
// reading (a scan on a quiet board) settles — slot released, effects minted —
// before this read's fog projects. That is what makes the client's poll/eta
// refetches actually DELIVER a reveal instead of re-reading stale fog.
type DueActions interface {
	ResolveDue(ctx context.Context, scope string) ([]action.Action, error)
}

type Handler struct {
	svc      ServiceInterface
	clock    common.WorldTime
	actions  DueActions
	contacts ContactsSource
}

func NewHandler() *Handler {
	return &Handler{svc: NewService(), clock: common.WorldClock()}
}

func NewHandlerWith(svc ServiceInterface, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

// WithActions wires the #0005 read-fold into the interior read.
func (h *Handler) WithActions(actions DueActions) *Handler {
	h.actions = actions
	return h
}

// WithContacts wires the interior read's body-table resolution and live
// disclosure union (tasks.md 4.4, 4.5, 4.7). Nil (the default) serves every
// feature/lane-gate with no space/size and an empty contacts array — see
// GetInterior's own degradation.
func (h *Handler) WithContacts(src ContactsSource) *Handler {
	h.contacts = src
	return h
}

func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	authorized.GET("/systems/:systemId", h.GetInterior)
}

// GetInterior serves a system's interior, materializing it on first request
// (the dev-only trigger until #0008). Every feature and every lane-gate body
// ships in full, unconditionally, to every authenticated requester
// (system-interior: "Bodies Are Public; Ships Are Disclosed" —
// replace-observation-with-sightings design.md Decisions 4/5): no per-
// requester band computed, no body omitted for lack of stored knowledge.
// Foreign SHIP presence is a wholly separate question: the response's
// `contacts` array is the requester corporation's own live disclosure union
// (system-interior "Foreign Presence Is Served As System Contacts"; task
// 4.5), empty for a corpless requester or when no ContactsSource is wired.
func (h *Handler) GetInterior(c *gin.Context) {
	systemID := common.RequiredHttpParam(c, "systemId")
	ctx := c.Request.Context()

	// The read-fold (#0005): settle this scope's due actions before projecting,
	// so a completed scan's observations are already minted in THIS response.
	// Opportunistic — the read still serves if the fold fails.
	if h.actions != nil {
		if _, err := h.actions.ResolveDue(ctx, systemID); err != nil {
			log.Warn().Ctx(c).Err(err).Str("systemId", systemID).Msg("Due-action resolve failed on interior read")
		}
	}

	gen, err := h.svc.GetOrCreateInterior(ctx, systemID)
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, galaxy.ErrSystemNotFound), errors.Is(err, galaxy.ErrNoLiveGalaxy):
		c.AbortWithStatus(http.StatusNotFound)
		return
	case err != nil:
		log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("Failed to get interior")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	now := h.clock.Now()

	gates, err := h.svc.LaneGates(ctx, systemID, gen.Interior.Radius)
	if err != nil {
		log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("Failed to compute lane gates")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Every feature and every lane-gate body ships in full to every
	// authenticated requester — no per-requester band computed, no body
	// omitted (replace-observation-with-sightings design.md Decisions 4/5).
	features := projectUnfogged(gen)

	// Continuous position/size (task 4.7) and the requester corporation's
	// own live contact union (task 4.5, system-interior "Foreign Presence
	// Is Served As System Contacts") — resolved behind ONE seam
	// (ContactsSource.InteriorReadExtras) that never surfaces the internal
	// body-table seam to this handler by name. Degrades to the plain
	// feature/gate set and empty contacts — never fails the read — when no
	// ContactsSource is wired or the underlying resolution errors.
	contacts := make([]contactDTO, 0)
	if h.contacts != nil {
		extras, err := h.contacts.InteriorReadExtras(ctx, systemID, common.ActorCorp(c), features, gates, now)
		if err != nil {
			log.Warn().Ctx(c).Err(err).Str("systemId", systemID).
				Msg("Interior geometry/contacts resolution failed; serving the plain feature/gate set")
		}
		features = extras.Features
		gates = extras.Gates
		contacts = contactsToDTO(extras.Contacts)
	}

	c.JSON(http.StatusOK, interiorDTO{
		SystemId:  gen.Interior.SystemId,
		Extent:    gen.Interior.Extent,
		Character: gen.Interior.Character,
		StarClass: gen.Interior.StarClass,
		Features:  features,
		LaneGates: gates,
		Contacts:  contacts,
		WorldTime: now,
		Scale:     h.clock.Scale(),
	})
}

// --- Wire DTO --------------------------------------------------------------

type interiorDTO struct {
	SystemId string `json:"systemId"`
	// Extent is the interior's CONTINUOUS star-frame upper bound over every
	// generated body's orbital radius (SystemInterior.Extent). It REPLACED
	// the lattice ring count `radius`, which openspec
	// build-production-space-view removed (tasks.md 9.1): serving both would
	// leave a consumer free to keep scaling continuous space off the lattice
	// number. It is the system-sized
	// number a client scales a camera, clamps a pan bound, or bounds a pick
	// radius with, and it is the one that survives the lattice's removal.
	// Never `omitempty`: a system whose stored Extent is genuinely zero must
	// read as zero, not as absent.
	Extent    float64         `json:"extent"`
	Character string          `json:"character"`
	StarClass string          `json:"starClass"`
	Features  []fogFeatureDTO `json:"features"`
	LaneGates []LaneGate      `json:"laneGates"`
	// Contacts is the requester corporation's own live disclosure of
	// foreign ship presence (system-interior "Foreign Presence Is Served As
	// System Contacts") — a top-level array alongside Features/LaneGates,
	// never folded into either (disclosure.Contact carries no fleet id).
	// Always present, never omitted, even when empty (an authenticated but
	// corpless requester, or a requester with no fleet of its own present).
	Contacts  []contactDTO       `json:"contacts"`
	WorldTime common.WorldMillis `json:"worldTime"`
	// Scale is the simulation clock's time-warp factor — world-milliseconds
	// advanced per wall-clock millisecond — read from the SAME clock that
	// produced WorldTime (system-interior "The read carries the world
	// clock's scale alongside its world time"). Served UNCONDITIONALLY and
	// without `omitempty`: a float64 with `omitempty` disappears at exactly
	// the value every world runs at today, which is the shape that ships
	// correct-and-absent and leaves a client hardcoding 1.
	Scale float64 `json:"scale"`
}

// contactDTO is disclosure.Contact's wire shape: camelCase field names,
// matching this endpoint's existing convention, over the package's own
// PascalCase Go fields. Carries exactly what Contact carries — position,
// velocity, emitting, scanning — never a target id (Contact has none by
// design).
type contactDTO struct {
	Position space.Vec3 `json:"position"`
	Velocity space.Vec3 `json:"velocity"`
	Emitting bool       `json:"emitting"`
	Scanning bool       `json:"scanning"`
}

func contactsToDTO(cs []disclosure.Contact) []contactDTO {
	out := make([]contactDTO, 0, len(cs))
	for _, c := range cs {
		out = append(out, contactDTO{Position: c.Position, Velocity: c.Velocity, Emitting: c.Emitting, Scanning: c.Scanning})
	}
	return out
}
