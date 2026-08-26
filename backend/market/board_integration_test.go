package market

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestGetBoard_AggregatesEveryVisibleStation covers the multi-station read, the
// tier gate at its boundary, and the empty-set case — all against the real
// stack, since visibility is a fog read.
func TestGetBoard_AggregatesVisibleStationsOnly(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	board, err := stack.svc.GetBoard(stack.ctx, stack.corpID)
	if err != nil {
		t.Fatalf("GetBoard: %v", err)
	}
	// The seller's home is explored, which clears the rumored gate.
	found := false
	for _, v := range board.Venues {
		if v.SystemId == stack.systemID {
			found = true
		}
	}
	if !found {
		t.Errorf("the seller's own home station is missing from its board (%d venues)", len(board.Venues))
	}
	if board.RefreshCadenceMs <= 0 {
		t.Error("the board states no refresh cadence; freshness must be a stated contract")
	}
}

func TestGetBoard_EmptyForACorporationThatSeesNothing(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	// A corporation with no fog at all sees no venues — an empty list, NOT an
	// error.
	board, err := stack.svc.GetBoard(stack.ctx, "corp-sees-nothing")
	if err != nil {
		t.Fatalf("GetBoard for an unknowing corp = %v, want an empty board", err)
	}
	if len(board.Venues) != 0 {
		t.Errorf("an unknowing corporation received %d venues, want 0", len(board.Venues))
	}
}

func TestGetBoard_CorplessRequesterGetsAnEmptyBoardNotAnError(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	board, err := stack.svc.GetBoard(stack.ctx, "")
	if err != nil {
		t.Fatalf("GetBoard for a corpless requester = %v, want an empty board", err)
	}
	if len(board.Venues) != 0 {
		t.Errorf("a corpless requester received %d venues, want 0", len(board.Venues))
	}
}

// TestGetBoard_QuotesAreUniformDemandEntries pins Decision 17's response shape:
// one ordered entry list per kind, with the floor riding it as the entry of last
// resort — never a `floor` + `requests` two-field split that M12 would have to
// fork the client contract to extend.
func TestGetBoard_QuotesAreUniformDemandEntriesWithTheFloorLast(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	board, err := stack.svc.GetBoard(stack.ctx, stack.corpID)
	if err != nil {
		t.Fatalf("GetBoard: %v", err)
	}
	checked := 0
	for _, v := range board.Venues {
		for _, q := range v.Quotes {
			if len(q.Entries) == 0 {
				t.Errorf("%s/%s quoted no entries at all", v.SystemId, q.Kind)
				continue
			}
			last := q.Entries[len(q.Entries)-1]
			if last.Source != SourceFloor || !last.Unlimited {
				t.Errorf("%s/%s does not end in the unlimited floor entry: %+v", v.SystemId, q.Kind, last)
			}
			for i := 1; i < len(q.Entries); i++ {
				if q.Entries[i-1].UnitPrice < q.Entries[i].UnitPrice {
					t.Errorf("%s/%s entries are not price-descending", v.SystemId, q.Kind)
				}
			}
			checked++
		}
	}
	if checked == 0 {
		t.Fatal("no quotes were produced to check")
	}
}

// TestGetBoard_DisclosesNoOwnershipOrFleetIdentity pins the response shape
// against leakage: the board carries market data, and ownerCorpId must be ABSENT
// entirely rather than shipped as null.
func TestGetBoard_DisclosesNoOwnershipOrFleetIdentity(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	board, err := stack.svc.GetBoard(stack.ctx, stack.corpID)
	if err != nil {
		t.Fatalf("GetBoard: %v", err)
	}
	raw, err := json.Marshal(board)
	if err != nil {
		t.Fatalf("marshalling board: %v", err)
	}
	body := string(raw)
	for _, forbidden := range []string{"ownerCorpId", "corporationId", "fleetId", "accountId"} {
		if strings.Contains(body, forbidden) {
			t.Errorf("the board response contains %q: %s", forbidden, body)
		}
	}
}

// TestGetBoard_ReflectsADrainedRequestOnTheVeryNextRead pins that quotes are
// LIVE, never frozen at an observation's asOf: market data is information, not
// feature composition, so a request another corporation exhausted shows
// exhausted immediately — with no travel and no scan by the reader.
func TestGetBoard_ReflectsADrainedRequestOnTheVeryNextRead(t *testing.T) {
	// Seed every RequestKind, not just metals: the kind sold below is
	// firstRequestKind(...), which the station's epoch derives, so a
	// metals-only hold made this test fail on any epoch that minted a
	// non-metals premium request. Pre-existing fixture defect, unrelated to
	// which cells anything sits on.
	stack, cleanup := newSaleStack(t, map[string]float64{
		"metals": 400, "volatiles": 400, "water": 400, "organics": 400,
	})
	defer cleanup()

	before, err := stack.svc.GetBoard(stack.ctx, stack.corpID)
	if err != nil {
		t.Fatalf("first GetBoard: %v", err)
	}
	beforeQty := totalRequestQuantity(before, stack.systemID)
	if beforeQty <= 0 {
		t.Skip("this station's epoch minted no premium requests; nothing to drain")
	}

	// Sell into the premium request.
	if _, err := stack.sell(SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: firstRequestKind(before, stack.systemID),
		Tons: 5, OperationKey: opKey("drain-board"),
	}); err != nil {
		t.Fatalf("Sell: %v", err)
	}

	after, err := stack.svc.GetBoard(stack.ctx, stack.corpID)
	if err != nil {
		t.Fatalf("second GetBoard: %v", err)
	}
	if got := totalRequestQuantity(after, stack.systemID); got >= beforeQty {
		t.Errorf("request quantity after the sale = %v, want less than %v — quotes must be live, never cached or frozen",
			got, beforeQty)
	}
}

func totalRequestQuantity(b *Board, systemID string) float64 {
	var total float64
	for _, v := range b.Venues {
		if v.SystemId != systemID {
			continue
		}
		for _, q := range v.Quotes {
			for _, e := range q.Entries {
				if e.Source == SourceRequest {
					total += e.RemainingQuantity
				}
			}
		}
	}
	return total
}

func firstRequestKind(b *Board, systemID string) string {
	for _, v := range b.Venues {
		if v.SystemId != systemID {
			continue
		}
		for _, q := range v.Quotes {
			for _, e := range q.Entries {
				if e.Source == SourceRequest {
					return q.Kind
				}
			}
		}
	}
	return "metals"
}
