package devtools

import (
	"cloud.google.com/go/firestore"
	"context"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"hexaverse/tuning"
	"net"
	"os"
	"testing"
)

func TestCatalogueDefaultsValidate(t *testing.T) {
	fields := Catalogue()
	p := tuning.Profile{Version: 1, Values: map[string]float64{}}
	for _, f := range fields {
		if _, exists := p.Values[f.Key]; exists {
			t.Fatalf("duplicate field %s", f.Key)
		}
		p.Values[f.Key] = f.Default
	}
	if err := tuning.Validate(p, fields); err != nil {
		t.Fatal(err)
	}
}
func TestClearGameplayPreservesAccountsAndDeletesOrphanedSubcollections(t *testing.T) {
	if testing.Short() {
		t.Skip("requires isolated Firestore emulator project")
	}
	host, _, err := net.SplitHostPort(os.Getenv("FIRESTORE_EMULATOR_HOST"))
	if err != nil || (host != "localhost" && net.ParseIP(host) != nil && !net.ParseIP(host).IsLoopback()) {
		t.Skip("requires loopback emulator")
	}
	if host != "localhost" && (net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback()) {
		t.Skip("requires loopback emulator")
	}
	ctx := context.Background()
	// A separate project keeps this whole-world operation away from other tests.
	client, err := firestore.NewClient(ctx, "hexaverse-local-tuning-test")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	account := client.Collection("accounts").Doc("pilot")
	_, err = account.Set(ctx, map[string]any{"email": "pilot@example.invalid"})
	if err != nil {
		t.Fatal(err)
	}
	fleet := client.Collection("fleets").Doc("ship")
	_, err = fleet.Set(ctx, map[string]any{"id": "ship"})
	if err != nil {
		t.Fatal(err)
	}
	orphan := client.Collection("corporations").Doc("missing-parent").Collection("charts").Doc("chart")
	_, err = orphan.Set(ctx, map[string]any{"known": true})
	if err != nil {
		t.Fatal(err)
	}
	if err = NewDao(client).ClearGameplay(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = account.Get(ctx); err != nil {
		t.Fatalf("account was deleted: %v", err)
	}
	for _, ref := range []*firestore.DocumentRef{fleet, orphan} {
		if _, err = ref.Get(ctx); status.Code(err) != codes.NotFound {
			t.Fatalf("gameplay survived: %s (%v)", ref.Path, err)
		}
	}
	_, _ = account.Delete(ctx)
}
