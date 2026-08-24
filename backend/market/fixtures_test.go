package market

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"
)

// The shared Go/TS golden. The TS proceeds preview asserts the SAME file, so the
// number a player is shown before committing and the number that settles cannot
// silently diverge — the cross-stack rule docs/plans/build-order.md already
// established with fixtures/board/cases.json.
type marketFixture struct {
	Fold []struct {
		Name          string        `json:"name"`
		Entries       []DemandEntry `json:"entries"`
		Tons          float64       `json:"tons"`
		Fills         []Fill        `json:"fills"`
		TotalProceeds int64         `json:"totalProceeds"`
	} `json:"fold"`
	FirstTonPrice []struct {
		Name          string        `json:"name"`
		Entries       []DemandEntry `json:"entries"`
		FirstTonPrice int64         `json:"firstTonPrice"`
	} `json:"firstTonPrice"`
}

func loadMarketFixture(t *testing.T) marketFixture {
	t.Helper()
	path := filepath.Join("..", "..", "fixtures", "market", "cases.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	var f marketFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("parsing %s: %v", path, err)
	}
	if len(f.Fold) == 0 {
		t.Fatalf("%s carries no fold cases", path)
	}
	return f
}

func TestFoldSale_MatchesTheSharedFixture(t *testing.T) {
	fx := loadMarketFixture(t)
	for _, c := range fx.Fold {
		t.Run(c.Name, func(t *testing.T) {
			fills, total, unfilled := FoldSale(c.Entries, c.Tons)

			if total != c.TotalProceeds {
				t.Errorf("total proceeds = %d, want %d", total, c.TotalProceeds)
			}
			if unfilled > 1e-9 {
				t.Errorf("%.4f tons went unfilled; every fixture case has enough demand", unfilled)
			}
			if len(fills) != len(c.Fills) {
				t.Fatalf("produced %d fills, want %d", len(fills), len(c.Fills))
			}
			for i, want := range c.Fills {
				got := fills[i]
				if got.Source != want.Source {
					t.Errorf("fill %d source = %q, want %q", i, got.Source, want.Source)
				}
				if got.UnitPrice != want.UnitPrice {
					t.Errorf("fill %d unitPrice = %d, want %d", i, got.UnitPrice, want.UnitPrice)
				}
				if math.Abs(got.Tons-want.Tons) > 1e-9 {
					t.Errorf("fill %d tons = %v, want %v", i, got.Tons, want.Tons)
				}
				if got.Proceeds != want.Proceeds {
					t.Errorf("fill %d proceeds = %d, want %d", i, got.Proceeds, want.Proceeds)
				}
				if got.RequestId != want.RequestId {
					t.Errorf("fill %d requestId = %q, want %q", i, got.RequestId, want.RequestId)
				}
			}
		})
	}
}

func TestFirstTonPrice_MatchesTheSharedFixture(t *testing.T) {
	fx := loadMarketFixture(t)
	for _, c := range fx.FirstTonPrice {
		t.Run(c.Name, func(t *testing.T) {
			if got := FirstTonPrice(c.Entries); got != c.FirstTonPrice {
				t.Errorf("first-ton price = %d, want %d", got, c.FirstTonPrice)
			}
		})
	}
}

// TestFoldSale_RoundsPerPortionNotOnTheTotal makes the rounding granularity its
// own explicit assertion rather than leaving it implicit in the fixture: a case
// where the two strategies genuinely disagree.
func TestFoldSale_RoundsPerPortionNotOnTheTotal(t *testing.T) {
	entries := []DemandEntry{
		{UnitPrice: 3, Source: SourceRequest, RemainingQuantity: 1.5, RequestId: "r"},
		{UnitPrice: 3, Source: SourceFloor, Unlimited: true},
	}
	// Per portion: floor(1.5*3)=4 and floor(1.5*3)=4 ⇒ 8.
	// On the pre-summed total: floor(3.0*3)=9. The two differ, and 8 is the
	// milestone's answer — the direction that never adds to the faucet.
	_, total, _ := FoldSale(entries, 3.0)
	if total != 8 {
		t.Errorf("total = %d, want 8 (per-portion flooring); 9 would mean the total was rounded once", total)
	}
}
