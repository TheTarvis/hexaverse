package fleet

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"hexaverse/common"
)

func TestFleetReadPreservesStoredNameAndLegacyAbsence(t *testing.T) {
	for _, name := range []string{"Peregrine", ""} {
		f := &Fleet{Id: "f1", Name: name, CorporationId: "corp-user1", SystemId: "s1"}
		for _, path := range []string{"/fleets/f1", "/fleets?systemId=s1", "/fleets?mine=true"} {
			t.Run(path+name, func(t *testing.T) {
				r := newFleetRouter(&fakeFleetSvc{fleet: f, list: []Fleet{*f}})
				w := httptest.NewRecorder()
				r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
				if w.Code != http.StatusOK {
					t.Fatalf("status %d: %s", w.Code, w.Body.String())
				}
				var body map[string]json.RawMessage
				if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
					t.Fatal(err)
				}
				if data, ok := body["fleets"]; ok {
					var rows []map[string]json.RawMessage
					if err := json.Unmarshal(data, &rows); err != nil {
						t.Fatal(err)
					}
					if len(rows) != 1 {
						t.Fatalf("want one own fleet, got %d", len(rows))
					}
					body = rows[0]
				}
				if name == "" {
					if _, ok := body["name"]; ok {
						t.Fatal("legacy unnamed fleet must omit name")
					}
					return
				}
				var got string
				if err := json.Unmarshal(body["name"], &got); err != nil {
					t.Fatal(err)
				}
				if got != name {
					t.Fatalf("name %q, want stored %q", got, name)
				}
			})
		}
	}
}

func TestFleetReadDoesNotDiscloseNameToForeignRequester(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/fleets/f1", nil)
	c.Set(common.CorpIdKey, "corp-user1")
	h := NewHandlerWith(&fakeFleetSvc{}, &fakeClock{})
	dto, err := h.toDTO(c, &Fleet{Id: "f1", Name: "Private name", CorporationId: "other", SystemId: "s1"})
	if err != nil {
		t.Fatal(err)
	}
	if dto.Name != "" {
		t.Fatal("foreign response disclosed fleet name")
	}
	data, err := json.Marshal(dto)
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(data, &body); err != nil {
		t.Fatal(err)
	}
	if _, ok := body["name"]; ok {
		t.Fatal("foreign name must be omitted")
	}
}
