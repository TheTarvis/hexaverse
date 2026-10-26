package fleet

import (
	"context"
	"errors"
	"fmt"
	"hexaverse/rules"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/discovery"
	"hexaverse/space"
	"hexaverse/system"
)

const surveyType = "survey"
const DefaultSurveyDuration common.WorldMillis = 30000

var ErrSurveyTarget = errors.New("survey requires an eligible celestial body within range")
var ErrSurveyTargetNotFound = errors.New("survey target does not exist in this system")

type SurveySegment struct {
	From  common.WorldMillis     `json:"-" firestore:"from"`
	To    common.WorldMillis     `json:"-" firestore:"to"`
	State map[string]interface{} `json:"-" firestore:"state"`
}
type SurveyWindow struct {
	BodyId        string             `json:"bodyId" firestore:"bodyId"`
	DepartMs      common.WorldMillis `json:"departMs" firestore:"departMs"`
	ArriveMs      common.WorldMillis `json:"arriveMs" firestore:"arriveMs"`
	LastMotionAt  common.WorldMillis `json:"-" firestore:"lastMotionAt"`
	History       []SurveySegment    `json:"-" firestore:"history"`
	InvalidReason string             `json:"invalidReason,omitempty" firestore:"invalidReason,omitempty"`
}

type DiscoverySource interface {
	Targets(context.Context, string) ([]discovery.Target, error)
	Target(context.Context, string, string) (*discovery.Target, error)
	Award(context.Context, action.Resolution, discovery.Target, string, []discovery.SurveyCandidate) (action.ResolveResult, error)
}

func (s *Service) WithDiscovery(d DiscoverySource) *Service {
	s.discovery = d
	s.surveyDuration = DefaultSurveyDuration
	return s
}
func (s *Service) WithSurveyDuration(duration common.WorldMillis) *Service {
	if duration > 0 {
		s.surveyDuration = duration
	}
	return s
}

func (s *Service) Survey(ctx context.Context, id, bodyID string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	if f.Jump != nil {
		return nil, ErrFleetInTransit
	}
	target, err := s.discovery.Target(ctx, f.SystemId, bodyID)
	if errors.Is(err, discovery.ErrNotFound) {
		return nil, ErrSurveyTargetNotFound
	}
	if err != nil {
		return nil, err
	}
	if !discovery.Eligible(target.Kind) || target.Protected {
		return nil, ErrSurveyTarget
	}
	bodies, err := s.bodiesFor(ctx, f.SystemId)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	from, err := space.StatePosition(bodies, f.State, now)
	if err != nil {
		return nil, err
	}
	to, err := space.Position(bodies, bodyID, now)
	if err != nil {
		return nil, ErrSurveyTarget
	}
	if from.Sub(to).Length() > rules.TunedFocusedScanRange() {
		return nil, ErrSurveyTarget
	}
	duration := s.surveyDuration
	if duration <= 0 {
		duration = DefaultSurveyDuration
	}
	window := SurveyWindow{BodyId: bodyID, DepartMs: now, ArriveMs: now + duration, LastMotionAt: now}
	a, err := s.actions.Commit(ctx, action.CommitSpec{Type: surveyType, Actor: id, ActorCollection: actorCollection, Scope: f.SystemId, Slot: action.SlotSensor, Eta: window.ArriveMs, Params: map[string]interface{}{"bodyId": bodyID, "galaxyId": target.GalaxyId}, ActorStateFunc: func(data map[string]interface{}) (map[string]interface{}, error) {
		if data["systemId"] != f.SystemId || data["jump"] != nil {
			return nil, ErrFleetInTransit
		}
		raw, _ := data["state"].(map[string]interface{})
		state, e := DecodeKinematicState(bodies, raw, surveyType, "")
		if e != nil {
			return nil, e
		}
		p, e := space.StatePosition(bodies, state, now)
		if e != nil || p.Sub(to).Length() > rules.TunedFocusedScanRange() {
			return nil, ErrSurveyTarget
		}
		return map[string]interface{}{"survey": window, "updatedAt": int64(now), "lastSurveyOutcome": ""}, nil
	}})
	if err != nil {
		return nil, err
	}
	f.Survey = &window
	f.ActiveScanId = a.Id
	return f, nil
}

func surveyValid(bt *system.BodyTable, f *Fleet, a action.Action) bool {
	w := f.Survey
	if w == nil || w.InvalidReason != "" || (w.LastMotionAt < a.Eta && (f.Jump != nil || f.SystemId != a.Scope)) {
		return false
	}
	body, _ := a.Params["bodyId"].(string)
	if body != w.BodyId {
		return false
	}
	for _, segment := range w.History {
		state, err := DecodeKinematicState(bt, segment.State, surveyType, a.Id)
		if err != nil || !space.StaysWithinRange(bt, state, body, segment.From, min(segment.To, a.Eta), rules.TunedFocusedScanRange()) {
			return false
		}
	}
	if w.LastMotionAt >= a.Eta {
		return true
	}
	state, err := DecodeKinematicState(bt, f.StateDoc, surveyType, a.Id)
	return err == nil && space.StaysWithinRange(bt, state, body, w.LastMotionAt, a.Eta, rules.TunedFocusedScanRange())
}

func RegisterSurveyResolver(a *action.Service, bodies BodySource, claims DiscoverySource) {
	RegisterSurveyHistory(a)
	a.RegisterCancelProducer(surveyType, func(map[string]interface{}) (map[string]interface{}, error) {
		return map[string]interface{}{"survey": nil, "lastSurveyOutcome": "Survey cancelled"}, nil
	})
	a.RegisterResolver(surveyType, action.KindMutating, func(ctx context.Context, r action.Resolution) (action.ResolveResult, error) {
		var f Fleet
		if err := r.DecodeActor(&f); err != nil {
			return action.ResolveResult{}, err
		}
		release := action.ResolveResult{ActorState: map[string]interface{}{"survey": nil, "lastSurveyOutcome": "Survey cancelled: left range, departed, or target unavailable"}, Outcome: "Survey cancelled: left range, departed, or target unavailable", ReasonCode: "invalidSurvey"}
		bt, err := bodies.BodyTable(ctx, r.Action.Scope)
		if err != nil {
			return release, nil
		}
		if !surveyValid(bt, &f, r.Action) {
			return release, nil
		}
		body, _ := r.Action.Params["bodyId"].(string)
		target, err := claims.Target(ctx, r.Action.Scope, body)
		if err != nil {
			return release, nil
		}
		gid, _ := r.Action.Params["galaxyId"].(string)
		if gid != target.GalaxyId {
			return release, nil
		}
		actions, err := r.ScopeActions()
		if err != nil {
			return action.ResolveResult{}, err
		}
		candidates := []discovery.SurveyCandidate{}
		for _, other := range actions {
			if other.Type != surveyType || other.Status != action.StatusRunning || other.Eta > r.At || other.Params["bodyId"] != body || other.Params["galaxyId"] != gid {
				continue
			}
			var contender Fleet
			if other.Id == r.Action.Id {
				contender = f
			} else {
				found, e := r.ReadDocument([]string{actorCollection, other.Actor}, &contender)
				if e != nil {
					return action.ResolveResult{}, fmt.Errorf("reading survey contender: %w", e)
				}
				if !found {
					continue
				}
			}
			if surveyValid(bt, &contender, other) {
				candidates = append(candidates, discovery.SurveyCandidate{ActionId: other.Id, CorporationId: contender.CorporationId, At: other.Eta})
			}
		}
		return claims.Award(ctx, r, *target, f.CorporationId, candidates)
	})
}
