package fleet

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/galaxy"
	"hexaverse/space"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	svc   ServiceInterface
	clock common.WorldTime
}

// NewHandlerWith is this package's only handler constructor: a fleet Service
// cannot be built from process-wide singletons alone (its lane-crossing
// GraphSource is a required constructor parameter, tasks.md 6.3), so there is
// deliberately no zero-argument NewHandler — the composition root wires the
// service and passes it in.
func NewHandlerWith(svc ServiceInterface, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

// RegisterRoutes wires the surviving endpoint set (design.md Decision 21A):
// GET /route is deleted with no successor here (routing is chain link 4
// section 5's own concern). POST /scan is back — the focused-scan verb
// (replace-observation-with-sightings §5, task 5.2), on the sensor channel,
// distinct from the lattice-era radial scan link 4 deleted.
func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	g := authorized.Group("/fleets")
	{
		g.GET("", h.List)
		g.GET("/:fleetId", h.Get)
		g.POST("/:fleetId/orders", h.Order)
		g.POST("/:fleetId/cancel", h.Cancel)
		g.POST("/:fleetId/cut-drive", h.CutDrive)
		g.POST("/:fleetId/stop", h.Stop)
		g.POST("/:fleetId/jump", h.Jump)
		g.POST("/:fleetId/scan", h.Scan)
		g.POST("/:fleetId/hold", h.Hold)
		g.POST("/:fleetId/release", h.Release)
	}
}

// Get returns the requester's own fleet in full; a fleet belonging to
// another corporation 404s outright — permanently, not an interim
// (fleet-movement "Fleet Read Endpoints Serve Own Fleets In Full and
// Foreign Fleets As Contacts", replace-observation-with-sightings design.md
// Decision 7: a foreign fleet has no addressable identity, so this 404 is
// not a redaction, it is the shipped absence semantics — "a direct read of
// an undisclosed entity is indistinguishable from absence." Foreign
// presence reaches a client through the interior read's `contacts`
// projection and nowhere else, mirrored here from List's own ownership
// check).
func (h *Handler) Get(c *gin.Context) {
	f, err := h.svc.Get(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	if err != nil {
		h.respond(c, nil, err)
		return
	}
	if requesterCid := common.ActorCorp(c); requesterCid == "" || f.CorporationId != requesterCid {
		h.respond(c, nil, ErrNotFound)
		return
	}
	dto, err := h.toDTO(c, f)
	if err != nil {
		h.respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, dto)
}

// List returns every fleet the requester may see in a system: their own
// units in full; foreign fleets are omitted entirely — permanently
// (fleet-movement "Fleet Read Endpoints Serve Own Fleets In Full and
// Foreign Fleets As Contacts": own fleets are returned in full, a foreign
// fleet is omitted from a list read, `mine=true` with no corporation
// returns an empty list). Read-only: it never settles a due arrival.
func (h *Handler) List(c *gin.Context) {
	requesterCid := common.ActorCorp(c)
	ctx := c.Request.Context()

	var fleets []Fleet
	var err error
	if common.OptionalQueryParam(c, "mine") == "true" {
		if requesterCid == "" {
			c.JSON(http.StatusOK, gin.H{"fleets": []fleetDTO{}, "worldTime": h.clock.Now()})
			return
		}
		fleets, err = h.svc.ListForCorp(ctx, requesterCid)
	} else {
		systemID := common.RequiredQueryParam(c, "systemId")
		if systemID == "" {
			return // RequiredQueryParam already aborted with 400
		}
		fleets, err = h.svc.ListInSystem(ctx, systemID)
	}
	if err != nil {
		log.Error().Ctx(c).Err(err).Msg("list fleets failed")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	out := make([]fleetDTO, 0, len(fleets))
	for i := range fleets {
		f := &fleets[i]
		if requesterCid == "" || f.CorporationId != requesterCid {
			continue // foreign fleets are omitted entirely from a list read
		}
		dto, err := h.toDTO(c, f)
		if err != nil {
			log.Error().Ctx(c).Err(err).Str("fleetId", f.Id).Msg("could not resolve fleet position; omitting from list")
			continue
		}
		out = append(out, dto)
	}
	c.JSON(http.StatusOK, gin.H{"fleets": out, "worldTime": h.clock.Now()})
}

// commandedFleetId resolves the fleet a command endpoint names, but ONLY for
// the corporation that owns it (fleet-movement "Fleet Command Endpoints Are
// Restricted to the Owning Corporation"). It answers `404 Not Found` with an
// empty body — never `403`, and never a body naming the fleet, its owner, or
// the reason — when the fleet does not exist, when the requester has no
// corporation at all, or when it belongs to another corporation: a foreign
// fleet is indistinguishable from a nonexistent one, and a 403 or an
// explanatory body would itself confirm the id exists (design.md Decision 21).
//
// The corpless case is checked unconditionally rather than by equality alone:
// a bare `ActorCorp(c) != f.CorporationId` comparison would hand every
// ownerless fleet record to every corpless requester.
//
// Every command endpoint calls this BEFORE binding its body and before
// reaching the service, so a rejected request dispatches nothing: no order is
// committed, no burn is cut, no sensor-channel slot is claimed and no masking
// stripped. For POST /scan in particular the rejection must precede scan-host
// resolution — ErrScanHostUnresolved also maps to 404, so a check made any
// later would pass for the wrong reason while the foreign scan still ran.
//
// Returns the fleet id and true when the command may proceed; on false the
// response is already written.
func (h *Handler) commandedFleetId(c *gin.Context) (string, bool) {
	fleetId := common.RequiredHttpParam(c, "fleetId")
	if fleetId == "" {
		return "", false // RequiredHttpParam already aborted with 400
	}
	f, err := h.svc.Get(c.Request.Context(), fleetId)
	if err != nil {
		h.respond(c, nil, err)
		return "", false
	}
	if requesterCid := common.ActorCorp(c); f == nil || requesterCid == "" || f.CorporationId != requesterCid {
		h.respond(c, nil, ErrNotFound)
		return "", false
	}
	return fleetId, true
}

func (h *Handler) Order(c *gin.Context) {
	fleetId, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	var req OrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	f, err := h.svc.OrderTo(c.Request.Context(), fleetId, req)
	h.respondWithStrandingWarning(c, f, err)
}

func (h *Handler) Cancel(c *gin.Context) {
	fleetId, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	f, err := h.svc.Cancel(c.Request.Context(), fleetId)
	h.respond(c, f, err)
}

// CutDrive handles POST /v1/fleets/:fleetId/cut-drive (fleet-movement "Cut
// Drive Converts the Burn to a Drift and Goes Dark").
func (h *Handler) CutDrive(c *gin.Context) {
	fleetId, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	f, err := h.svc.CutDrive(c.Request.Context(), fleetId)
	h.respond(c, f, err)
}

// Stop handles POST /v1/fleets/:fleetId/stop (fleet-movement "Stop In Place
// Commits a Velocity-Nulling Burn").
func (h *Handler) Stop(c *gin.Context) {
	fleetId, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	f, err := h.svc.Stop(c.Request.Context(), fleetId)
	h.respondWithStrandingWarning(c, f, err)
}

// Jump handles POST /v1/fleets/:fleetId/jump {laneId} (fleet-movement "Lane
// Jump From a Docked Gate").
func (h *Handler) Jump(c *gin.Context) {
	fleetId, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	var req JumpRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	f, err := h.svc.Jump(c.Request.Context(), fleetId, req.LaneId)
	h.respond(c, f, err)
}

// Scan handles POST /v1/fleets/:fleetId/scan {hostId} (focused-scan "A
// Focused Sweep Commits On the Sensor Channel").
func (h *Handler) Scan(c *gin.Context) {
	fleetId, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	var req ScanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	f, err := h.svc.Scan(c.Request.Context(), fleetId, req.HostId)
	h.respond(c, f, err)
}

// Hold handles POST /v1/fleets/:fleetId/hold (fleet-movement
// "Station-Keeping Hold and Release Are Fleet Verbs") — instant, like
// cut-drive: no action, no channel slot, no ETA. Ownership-gated through the
// same commandedFleetId seam every other fleet command uses: an unchecked
// hold would let a foreign corporation park another corporation's fleet into
// a continuous fuel drain it never chose.
func (h *Handler) Hold(c *gin.Context) {
	fleetId, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	f, err := h.svc.Hold(c.Request.Context(), fleetId)
	h.respond(c, f, err)
}

// Release handles POST /v1/fleets/:fleetId/release — hold's instant inverse,
// gated identically: an unchecked release would let a foreign corporation
// force another corporation's fleet off a deliberately held position.
func (h *Handler) Release(c *gin.Context) {
	fleetId, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	f, err := h.svc.Release(c.Request.Context(), fleetId)
	h.respond(c, f, err)
}

// orderStrandingWarningDTO wraps the ordinary fleetDTO with the burn-
// commit-response-only `strandingWarning` field (add-fuel-as-cargo,
// fleet-movement "A Burn Commit Warns, But Does Not Block, When It Would
// Leave the Fleet Unable to Reach a Station or Gate"). Deliberately NOT on
// fleetDTO itself — the persistent, per-read signal is Roster.Stranded;
// this one-shot field exists only on the response of the commit that
// created the condition, never on an ordinary read (json:",omitempty" on a
// bool omits it entirely when false).
type orderStrandingWarningDTO struct {
	fleetDTO
	StrandingWarning bool `json:"strandingWarning,omitempty"`
}

// respondWithStrandingWarning is Order/Stop's own response path: identical
// to respond's error mapping, but on success it adds the transient,
// commit-response-only stranding-warning field Fleet.StrandingWarning
// carries (never persisted, never present on an ordinary read).
func (h *Handler) respondWithStrandingWarning(c *gin.Context, f *Fleet, err error) {
	if err != nil {
		h.respond(c, nil, err)
		return
	}
	dto, posErr := h.toDTO(c, f)
	if posErr != nil {
		h.respond(c, nil, posErr)
		return
	}
	c.JSON(http.StatusOK, orderStrandingWarningDTO{fleetDTO: dto, StrandingWarning: f.StrandingWarning})
}

func (h *Handler) respond(c *gin.Context, f *Fleet, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case errors.Is(err, ErrEmptyOrder), errors.Is(err, ErrAmbiguousOrder):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrAccelBelowFloor), errors.Is(err, ErrAccelAboveCeiling):
		// DRIFT REPAIR (add-stationkeep-hold-verb task 5.2; write-up:
		// docs/plans/continous_space/handoffs/drift-fleet-wrong-state-500.md).
		// Both were unwired and fell through to a bodyless 500, violating
		// two live fleet-movement scenarios ("A commanded acceleration below
		// the disclosure floor is rejected", "...above the ceiling is
		// rejected"). 400: a commanded acceleration outside the disclosed
		// band is a malformed request, not a state conflict. The two carry
		// their own distinct messages — "rejected by name" is unsatisfiable
		// through one generic rejection.
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrNotBurning):
		// DRIFT REPAIR (task 5.1): cut-drive's own wrong-effective-state
		// rejection, likewise unwired and likewise a bodyless 500, against
		// the live "Cutting a parked, drifting, or in-transit fleet is
		// rejected by name". 409 is this capability's convention for a
		// state-precondition rejection, and this message is distinct from
		// the already-arrived rejection's.
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, space.ErrCutAfterArrival):
		// DRIFT REPAIR (task 5.4): cut-drive's OTHER wrong-state rejection —
		// the burn already reached its stored arrival, so the arrival was
		// resolved instead and there is no live burn left to cut. Reaches
		// here on two paths (Service.CutDrive returns it directly once
		// settleIfDue reports the arrival due, and space.CutDrive propagates
		// it), and until now neither was wired: both fell through to the
		// bodyless 500, which cannot satisfy the live "Cutting an
		// already-arrived burn resolves the arrival instead" ("rejected with
		// its own named reason"). 409, this capability's state-precondition
		// status, with a message distinct from every other wrong-state
		// rejection this switch serves — ErrNotBurning's above in
		// particular, whose own scenario names it "distinct from the
		// already-arrived rejection".
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, ErrNotOrbiting), errors.Is(err, ErrNotStationKeeping),
		errors.Is(err, ErrHoldWithoutFuel):
		// The three station-keeping rejections, served as 409 with pairwise
		// distinct reasons (fleet-movement "Station-Keeping Hold and Release
		// Are Fleet Verbs": "the three reasons being pairwise distinct ...
		// None of the three rejections above SHALL be served as a bodyless
		// 5xx"). 409 is the status this capability's command surface already
		// uses for its five wired state-precondition and
		// resource-insufficiency rejections.
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, ErrFleetInTransit):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "fleet is in lane transit"})
	case errors.Is(err, ErrJumpNotAttached):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, ErrScanHostUnresolved):
		// A hostId naming a foreign fleet is rejected through this exact
		// same branch as an unresolvable one — same status, same body, no
		// distinguishing field (focused-scan "A Foreign Fleet's Id Is
		// Rejected Identically To An Unresolvable One").
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, disclosure.ErrScanOutOfRange), errors.Is(err, disclosure.ErrScanOccluded):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, action.ErrActiveActionExists):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, ErrInsufficientFuel):
		// A named reason distinct from the persistent stranded indication
		// (fleet-movement "A Burn Commit Is Rejected When Its Fuel Cost
		// Exceeds Available Fuel..."): this specific commit is unaffordable,
		// never "this fleet cannot move to anything reachable at all".
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, ErrHoldExpiredMidCommit):
		// The in-transaction past-dry-instant guard aborted this commit on
		// its OWN re-read (fleet-movement "Every Decision Reading Fuel
		// Settles a Past-Dry-Instant Hold First": "the burn commit and the
		// refuel surface it as a RETRYABLE failure that applies nothing,
		// whose retry issues a fresh preceding settlement write"). Served
		// with a reason, on the same retryable status ErrDestinationNotReady
		// already uses for this capability's other apply-nothing refusal —
		// never the bodyless 5xx below, which is the defect this change's
		// own section-5 tasks repair for three sibling sentinels. `hold`
		// never reaches here: it surfaces its own guard as
		// ErrHoldWithoutFuel, above.
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
	case errors.Is(err, ErrDestinationNotReady):
		// A distinguishable, retryable rejection — never the bodyless 5xx
		// below — per design.md Decision 28 (replace-observation-with-
		// sightings, tasks.md 10.13): the jump commit failed closed because
		// the destination's lane horizon could not be materialized.
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
	case errors.Is(err, galaxy.ErrLaneNotFound):
		// A laneId not incident to the fleet's current system is a pure
		// client error — a reason-bearing 404, never the bodyless 5xx below,
		// and never conflated with ErrNotFound's deliberately bodyless 404
		// (task 10.15, replace-observation-with-sightings).
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("fleet operation failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		dto, posErr := h.toDTO(c, f)
		if posErr != nil {
			h.respond(c, nil, posErr)
			return
		}
		c.JSON(http.StatusOK, dto)
	}
}

// fleetDTO is the read shape: the kinematic state plus the computed live
// position and worldTime, so the client can render immediately. `own` tells
// the client whether it may drive this fleet.
type fleetDTO struct {
	Id            string          `json:"id"`
	CorporationId string          `json:"corporationId"`
	SystemId      string          `json:"systemId"`
	State         space.ShipState `json:"state"`
	AttachedTo    string          `json:"attachedTo,omitempty"`
	// LaneId names the lane of the gate this fleet is attached to, if any
	// (fleet-movement "Fleet Read Serves the Attached Gate's Lane Id").
	// Derived purely from f.SystemId and AttachedTo's "gate-"+destSystemId
	// convention (system.gateId) via galaxy.LaneIdBetween — deliberately NOT
	// sourced from the corporation's charted-lane set (GET /v1/galaxy's
	// links[] is charted-filtered and therefore empty for a fresh
	// attachment). Empty when the fleet is unattached or attached to a
	// non-gate body.
	LaneId    string             `json:"laneId,omitempty"`
	Jump      *JumpTransit       `json:"jump,omitempty"`
	Position  space.Vec3         `json:"position"`
	Own       bool               `json:"own"`
	WorldTime common.WorldMillis `json:"worldTime"`
	// Roster is the owner-only ships/cargo/derived-capacity surface (#0010
	// "Fleet Read Surfaces Roster, Cargo, and Derived Capacity"). nil for a
	// foreign fleet — omitted from the JSON entirely (`omitempty`).
	Roster *rosterDTO `json:"roster,omitempty"`
}

// rosterDTO is the roster/cargo/derived-capacity read shape — populated only
// for the requester's own fleet.
type rosterDTO struct {
	Ships         []ShipEntry        `json:"ships"`
	Cargo         map[string]float64 `json:"cargo"`
	CargoCapacity float64            `json:"cargoCapacity"`
	FreeHold      float64            `json:"freeHold"`
	MiningRate    float64            `json:"miningRate"`
	// EstimatedRange, Stranded, and FuelPricePerTon are add-fuel-as-cargo's
	// own owner-only fields (fleet-movement "Fleet Read Reports an
	// Estimated Maximum Range From Current Fuel", "A Fleet's Read Reports a
	// Persistent Stranded Indication, Computed at the Acceleration Floor",
	// "Fleet Read Serves the Configured Fuel Price, Never Duplicated
	// Client-Side"). A foreign fleet never carries a rosterDTO at all, so
	// there is no foreign-fleet response for these fields to appear on.
	EstimatedRange  float64 `json:"estimatedRange"`
	Stranded        bool    `json:"stranded"`
	FuelPricePerTon float64 `json:"fuelPricePerTon"`
}

// fuelStatusSource is the optional capability the handler probes for via a
// type assertion, rather than widening ServiceInterface (which
// handler_test.go's hand-written fakeFleetSvc would then also have to grow
// to keep satisfying) — implemented by the concrete *Service.
type fuelStatusSource interface {
	FuelStatus(ctx context.Context, f *Fleet) (estimatedRange float64, stranded bool, err error)
	FuelPricePerTon() float64
}

// rosterFieldsFor builds the owner-only roster/cargo DTO, or nil for a
// foreign fleet.
func rosterFieldsFor(f *Fleet, own bool, estimatedRange float64, stranded bool, fuelPricePerTon float64) *rosterDTO {
	if !own {
		return nil
	}
	stats := DefaultClassStats()
	return &rosterDTO{
		Ships:           effectiveRoster(*f),
		Cargo:           f.Cargo,
		CargoCapacity:   DerivedCapacity(*f, stats),
		FreeHold:        FreeHold(*f, stats),
		MiningRate:      DerivedMiningRate(*f, stats),
		EstimatedRange:  estimatedRange,
		Stranded:        stranded,
		FuelPricePerTon: fuelPricePerTon,
	}
}

// gateBodyPrefix is system.gateId's own naming convention ("gate-"+
// destSystemId), mirrored here rather than imported since system does not
// export gateId (also mirrored independently by charts.gateBodyPrefix and
// fleet's own resolver.go homeGateId construction).
const gateBodyPrefix = "gate-"

// attachedGateLaneId derives the lane id of the gate f is attached to, or ""
// if f is unattached or attached to a non-gate body. Pure: no Firestore
// read, no dependency on any corporation's charted-lane set.
func attachedGateLaneId(f *Fleet) string {
	destSystemId, ok := strings.CutPrefix(f.AttachedTo, gateBodyPrefix)
	if !ok {
		return ""
	}
	return galaxy.LaneIdBetween(f.SystemId, destSystemId)
}

// toDTO resolves the fleet's position (through its own system's body table)
// and shapes the read DTO. A mid-jump fleet's position resolves to the zero
// vector with no error surfaced to the caller — Jump being set is itself the
// disclosed fact; ErrFleetInTransit is an internal signal, not an HTTP
// failure. A stored `attachedTo` the body table no longer resolves
// (space.ErrUnknownBody — e.g. a belt-member index a retuned
// AsteroidsPerBelt no longer derives, or a lane gate a degraded gate read
// omits) degrades the same way: no position reported, the fleet still
// returned with its unresolved `attachedTo` unchanged, the host id logged
// (re-express-economy-positions tasks.md 3.8 — "A fleet attached to a body
// the table no longer resolves degrades, never panics").
func (h *Handler) toDTO(c *gin.Context, f *Fleet) (fleetDTO, error) {
	requesterCid := common.ActorCorp(c)
	own := requesterCid != "" && f.CorporationId == requesterCid

	var pos space.Vec3
	if resolved, err := h.svc.PositionOf(c.Request.Context(), f); err == nil {
		pos = resolved
	} else if errors.Is(err, space.ErrUnknownBody) {
		log.Warn().Ctx(c).Str("fleetId", f.Id).Str("attachedTo", f.AttachedTo).
			Msg("fleet attached to a body the table no longer resolves; degrading read")
	} else if !errors.Is(err, ErrFleetInTransit) {
		return fleetDTO{}, err
	}

	// Owner-only fuel status (add-fuel-as-cargo) — probed via an optional
	// capability so ServiceInterface's own contract (satisfied by
	// handler_test.go's hand-written fake) need not grow a method that fake
	// has no reason to implement. A foreign fleet never reaches this at all
	// (own is false), and a lookup failure degrades to the zero values
	// rather than failing the whole read — a fuel-status computation error
	// must never take down an otherwise-servable fleet read.
	var estimatedRange, fuelPricePerTon float64
	var stranded bool
	if own {
		if fs, ok := h.svc.(fuelStatusSource); ok {
			fuelPricePerTon = fs.FuelPricePerTon()
			if r, s, ferr := fs.FuelStatus(c.Request.Context(), f); ferr == nil {
				estimatedRange, stranded = r, s
			} else {
				log.Warn().Ctx(c).Err(ferr).Str("fleetId", f.Id).Msg("fuel-status computation failed; degrading read")
			}
		}
	}

	return fleetDTO{
		Id:            f.Id,
		CorporationId: f.CorporationId,
		SystemId:      f.SystemId,
		State:         f.State,
		AttachedTo:    f.AttachedTo,
		LaneId:        attachedGateLaneId(f),
		Jump:          f.Jump,
		Position:      pos,
		Own:           own,
		WorldTime:     h.clock.Now(),
		Roster:        rosterFieldsFor(f, own, estimatedRange, stranded, fuelPricePerTon),
	}, nil
}
