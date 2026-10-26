package devtools

import (
	"bytes"
	"cloud.google.com/go/firestore"
	"context"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"hexaverse/config"
	"hexaverse/fleet"
	"hexaverse/refuel"
	"hexaverse/tuning"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type noFleetTools struct{}

func (noFleetTools) TrimCargoForTuning(context.Context, string) error { return nil }

func TestRoutesAbsentOutsideLocal(t *testing.T) {
	old := config.ServiceConfig.Env
	defer func() { config.ServiceConfig.Env = old }()
	config.ServiceConfig.Env = "PROD"
	r := gin.New()
	RegisterRoutes(r.Group("/v1"), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/v1/dev/tuning", nil))
	if w.Code != 404 {
		t.Fatalf("nonlocal tuning route returned %d", w.Code)
	}
}

func TestLocalTuningHTTPRoundTrip(t *testing.T) {
	if testing.Short() || os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires emulator")
	}
	old := config.ServiceConfig.Env
	defer func() { config.ServiceConfig.Env = old }()
	config.ServiceConfig.Env = "LOCAL"
	if !config.LocalTuningAllowed() {
		t.Skip("requires loopback emulator")
	}
	fields := Catalogue()
	if err := tuning.Initialize(filepath.Join(t.TempDir(), "state.json"), fields, time.Now(), 1); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "hexaverse-local-tuning-api-test")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	svc := NewService(NewDao(client), noFleetTools{})
	router := gin.New()
	RegisterRoutes(router.Group("/v1"), svc)
	// A constructed service must observe later Apply edits as well as new services.
	refuelSvc := refuel.NewService(fleet.DefaultFuelParams(), nil, nil, nil, nil)
	p := tuning.Get().Profile
	p.Values["world.speed"] = 4
	p.Values["hulls.acceleration"] = 12
	p.Values["fuel.pricePerTon"] = 25
	body, _ := json.Marshal(p)
	w := httptest.NewRecorder()
	request := httptest.NewRequest("PUT", "/v1/dev/tuning", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, request)
	if w.Code != 200 {
		t.Fatalf("Apply: %d %s", w.Code, w.Body.String())
	}
	if fleet.DefaultClassStats()[fleet.ClassSeed].Accel != 12 || refuelSvc.PricePerTon() != 25 || tuning.ClockScale() != 4 {
		t.Fatal("existing consumers did not observe live tuning")
	}
	p.Values["world.speed"] = 8
	body, _ = json.Marshal(p)
	w = httptest.NewRecorder()
	request = httptest.NewRequest("POST", "/v1/dev/tuning/import", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, request)
	if w.Code != 200 || tuning.ClockScale() != 4 || tuning.Get().Profile.Values["world.speed"] != 8 {
		t.Fatalf("import was not staged: %d %s", w.Code, w.Body.String())
	}
}

func TestSSESubscriptionDoesNotBlockLocalMaintenance(t *testing.T) {
	old := config.ServiceConfig.Env
	defer func() { config.ServiceConfig.Env = old }()
	config.ServiceConfig.Env = "LOCAL"
	t.Setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:1")
	if err := tuning.Initialize(filepath.Join(t.TempDir(), "state.json"), Catalogue(), time.Now(), 1); err != nil {
		t.Fatal(err)
	}
	entered, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	router := gin.New()
	router.Use(Gate())
	router.GET("/v1/channels/test/stream", func(c *gin.Context) { close(entered); <-release; c.Status(200) })
	go func() {
		defer close(finished)
		router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/v1/channels/test/stream", nil))
	}()
	defer func() { close(release); <-finished }()
	<-entered
	maintenance := make(chan struct{})
	go func() { gate.Lock(); gate.Unlock(); close(maintenance) }()
	select {
	case <-maintenance:
	case <-time.After(time.Second):
		t.Fatal("open SSE subscription blocked Apply/reset")
	}
}
