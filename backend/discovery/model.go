package discovery

import "hexaverse/common"

type Attribution struct {
	CorporationId string             `json:"corporationId" firestore:"corporationId"`
	At            common.WorldMillis `json:"at" firestore:"at"`
}

type PlayerName struct {
	CorporationId string             `json:"corporationId" firestore:"corporationId"`
	At            common.WorldMillis `json:"at" firestore:"at"`
	Name          string             `json:"name" firestore:"name"`
}

type Record struct {
	GalaxyId        string       `json:"galaxyId" firestore:"galaxyId"`
	SystemId        string       `json:"systemId" firestore:"systemId"`
	BodyId          string       `json:"bodyId" firestore:"bodyId"`
	OwnerCorpId     string       `json:"ownerCorpId,omitempty" firestore:"ownerCorpId,omitempty"`
	Name            string       `json:"name,omitempty" firestore:"name,omitempty"`
	GeneratedName   string       `json:"generatedName,omitempty" firestore:"generatedName,omitempty"`
	EntitledCorpId  string       `json:"-" firestore:"entitledCorpId,omitempty"`
	FirstSurvey     *Attribution `json:"firstSurvey,omitempty" firestore:"firstSurvey,omitempty"`
	FirstArrival    *Attribution `json:"firstArrival,omitempty" firestore:"firstArrival,omitempty"`
	FirstPlayerName *PlayerName  `json:"firstPlayerName,omitempty" firestore:"firstPlayerName,omitempty"`
}

type Target struct {
	GalaxyId, SystemId, BodyId, Kind, Name, GeneratedName, CatalogueRef string
	Protected                                                           bool
}

func Eligible(kind string) bool {
	switch kind {
	case "star", "rocky", "gas_giant", "ice", "moon":
		return true
	}
	return false
}
