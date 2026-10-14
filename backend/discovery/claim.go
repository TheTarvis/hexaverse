package discovery

import (
	"context"
	"sort"

	"hexaverse/action"
	"hexaverse/common"
)

type SurveyCandidate struct {
	ActionId, CorporationId string
	At                      common.WorldMillis
}

// Award prepares the claim effect inside the action's own transaction. Every
// valid contender completing by this action's ETA participates, including an
// earlier action not yet read by its owner. Reading the record transactionally
// makes competing resolve requests converge on one permanent winner.
func (s *Service) Award(_ context.Context, r action.Resolution, target Target, cid string, candidates []SurveyCandidate) (action.ResolveResult, error) {
	release := map[string]interface{}{"survey": nil, "updatedAt": int64(r.At)}
	result := action.ResolveResult{ActorState: release, Outcome: "Survey complete: existing claim preserved", ReasonCode: "alreadyOwned"}
	path := []string{Collection, Key(target.GalaxyId, target.SystemId, target.BodyId)}
	record := Record{GalaxyId: target.GalaxyId, SystemId: target.SystemId, BodyId: target.BodyId, GeneratedName: target.GeneratedName}
	if _, err := r.ReadDocument(path, &record); err != nil {
		return result, err
	}
	if target.Protected {
		result.Outcome = "Survey complete: protected place"
		result.ReasonCode = "protected"
		result.ActorState["lastSurveyOutcome"] = result.Outcome
		return result, nil
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].At != candidates[j].At {
			return candidates[i].At < candidates[j].At
		}
		return candidates[i].ActionId < candidates[j].ActionId
	})
	for _, candidate := range candidates {
		if record.OwnerCorpId != "" && record.OwnerCorpId != candidate.CorporationId {
			continue
		}
		if record.FirstSurvey != nil {
			break
		}
		record.OwnerCorpId = candidate.CorporationId
		record.EntitledCorpId = candidate.CorporationId
		record.FirstSurvey = &Attribution{candidate.CorporationId, candidate.At}
		result.Writes = []action.DocWrite{{Path: path, Data: map[string]interface{}{"galaxyId": record.GalaxyId, "systemId": record.SystemId, "bodyId": record.BodyId, "ownerCorpId": record.OwnerCorpId, "entitledCorpId": record.EntitledCorpId, "firstSurvey": *record.FirstSurvey, "generatedName": target.GeneratedName}}}
		break
	}
	if record.OwnerCorpId == cid && record.FirstSurvey != nil {
		result.Outcome = "Survey complete: naming entitlement earned"
		result.ReasonCode = "claimed"
	}
	if record.OwnerCorpId != "" && record.OwnerCorpId != cid {
		result.Outcome = "Survey complete: another corporation owns this place"
		result.ReasonCode = "alreadyOwned"
	}
	result.ActorState["lastSurveyOutcome"] = result.Outcome
	return result, nil
}
