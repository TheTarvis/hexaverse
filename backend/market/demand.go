package market

import (
	"math"
	"sort"

	"hexaverse/common"
	"hexaverse/stations"
)

// EntrySource names where a demand entry came from. The uniform shape is what
// lets M12's player exchange join the same ordered list without forking the
// settlement path.
type EntrySource string

const (
	// SourceRequest is an NPC premium request — a standing offer above the floor,
	// with a finite remaining quantity.
	SourceRequest EntrySource = "request"
	// SourceFloor is the NPC floor: the entry of LAST RESORT. Unlimited quantity,
	// lowest price priority. It is modelled as an entry rather than a fallback
	// branch precisely so settlement has one rule and no NPC special case.
	SourceFloor EntrySource = "floor"
)

// DemandEntry is one uniform offer to buy at a venue: "I will take up to
// RemainingQuantity tons at UnitPrice."
//
// A venue is an OPAQUE scope key. In this version it is always a station's id,
// but neither the fold below nor the price-board read interprets it as one —
// which is what lets a later global or regional order book key onto the exact
// same rule.
type DemandEntry struct {
	UnitPrice int64       `json:"unitPrice"`
	Source    EntrySource `json:"source"`
	// RemainingQuantity is the tonnage still available. Unlimited for the floor,
	// signalled by Unlimited rather than a magic number.
	RemainingQuantity float64 `json:"remainingQuantity,omitempty"`
	Unlimited         bool    `json:"unlimited,omitempty"`
	// RequestId identifies the underlying NPC request for a request-sourced entry,
	// so settlement knows which one to decrement. Empty for the floor.
	RequestId string `json:"requestId,omitempty"`
}

// Capacity is how much tonnage this entry can still absorb.
func (e DemandEntry) Capacity() float64 {
	if e.Unlimited {
		return math.Inf(1)
	}
	return e.RemainingQuantity
}

// DemandFor builds a venue's ordered demand for one kind: its live premium
// requests plus the floor as the entry of last resort, price-descending.
//
// tradable is false when the region has no configured floor for the kind — that
// kind is simply not tradable at any station in that region, which is reported
// distinguishably and never as a price of zero.
func (p Params) DemandFor(st *stations.Station, region, kind string, now common.WorldMillis) (entries []DemandEntry, tradable bool) {
	floor, ok := p.FloorFor(region, kind)
	if !ok {
		return nil, false
	}

	for i := range st.Requests {
		r := &st.Requests[i]
		if r.Kind != kind {
			continue
		}
		// An expired or exhausted request neither quotes nor fills. Expiry is
		// checked here rather than at write time so a request goes quiet the
		// instant it lapses, with no sweep required.
		if !r.Fillable(now) {
			continue
		}
		entries = append(entries, DemandEntry{
			UnitPrice:         r.UnitPrice,
			Source:            SourceRequest,
			RemainingQuantity: r.RemainingQuantity,
			RequestId:         r.Id,
		})
	}

	entries = append(entries, DemandEntry{
		UnitPrice: floor,
		Source:    SourceFloor,
		Unlimited: true,
	})

	// Price-descending: a seller always fills the best standing demand first.
	// Ties break on source so the order is deterministic across reads (a request
	// priced at the floor still sorts ahead of the floor itself — it has finite
	// quantity, so consuming it first is what keeps the floor the last resort).
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].UnitPrice != entries[j].UnitPrice {
			return entries[i].UnitPrice > entries[j].UnitPrice
		}
		return entries[i].Source == SourceRequest && entries[j].Source == SourceFloor
	})
	return entries, true
}

// Fill is one portion of a settled sale: the tonnage that went to one demand
// entry, and the whole credits it earned.
type Fill struct {
	RequestId string      `json:"requestId,omitempty"`
	Source    EntrySource `json:"source"`
	UnitPrice int64       `json:"unitPrice"`
	Tons      float64     `json:"tons"`
	// Proceeds is this portion's payment, ALREADY rounded down to whole credits.
	Proceeds int64 `json:"proceeds"`
}

// FoldSale folds a sale's tonnage across a venue's ordered demand entries,
// filling each to its remaining quantity before moving to the next.
//
// "Fill the request first, then the floor" is not a code path here — it is
// simply what this one rule produces given this version's entry set.
//
// Rounding is PER PORTION, floored, then summed — never round the pre-summed
// fractional total once. Two reasons: rounding down is the direction that never
// adds to the faucet (this milestone ships no credit sink), and per-portion
// granularity is the number both the settlement and the client's proceeds
// preview compute, pinned by the shared fixture so they cannot diverge.
func FoldSale(entries []DemandEntry, tons float64) (fills []Fill, total int64, unfilled float64) {
	remaining := tons
	for _, e := range entries {
		if remaining <= 0 {
			break
		}
		take := math.Min(remaining, e.Capacity())
		if take <= 0 {
			continue
		}
		proceeds := int64(math.Floor(take * float64(e.UnitPrice)))
		fills = append(fills, Fill{
			RequestId: e.RequestId,
			Source:    e.Source,
			UnitPrice: e.UnitPrice,
			Tons:      take,
			Proceeds:  proceeds,
		})
		total += proceeds
		remaining -= take
	}
	return fills, total, remaining
}

// FirstTonPrice is the price the server would apply to the FIRST ton of a sale —
// the figure the price board showed the player moments earlier, and what the
// optional slippage guard compares against. Zero when there is no demand at all.
func FirstTonPrice(entries []DemandEntry) int64 {
	for _, e := range entries {
		if e.Capacity() > 0 {
			return e.UnitPrice
		}
	}
	return 0
}
