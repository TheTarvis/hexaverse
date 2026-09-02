package refuel

import (
	"encoding/json"
	"reflect"
	"testing"

	"hexaverse/common"
)

// TestRequest_SchemaHasNoSystemOrStationOrCorporationField pins
// fuel-purchase "A refuel request carries no system id or station
// identifier" and request-authorization "The Sell and Refuel Endpoints
// Ignore a Client-Supplied Corporation Id": the ONLY way the latter is
// airtight is if the request shape has no such field to ignore. This is a
// structural test — model.go is the whole of the schema's authority, so a
// field-by-field walk over the declared struct is exactly right.
func TestRequest_SchemaHasNoSystemOrStationOrCorporationField(t *testing.T) {
	typ := reflect.TypeOf(Request{})
	forbidden := []string{"systemid", "systemId", "stationid", "stationId", "featureid", "featureId", "corporationid", "corporationId"}
	for i := 0; i < typ.NumField(); i++ {
		name := typ.Field(i).Name
		for _, f := range forbidden {
			if equalFold(name, f) {
				t.Errorf("Request declares a field %q — fuel-purchase requires no system, station, or corporation identifier in this schema", name)
			}
		}
	}
}

// TestRequest_SchemaIsExactlyTonsAndOperationKey: the positive half of the
// same requirement — the schema names ONLY the two fields the spec allows
// (the fleet id itself travels in the URL path, not the body).
func TestRequest_SchemaIsExactlyTonsAndOperationKey(t *testing.T) {
	typ := reflect.TypeOf(Request{})
	if typ.NumField() != 2 {
		t.Fatalf("Request has %d fields, want exactly 2 (Tons, OperationKey)", typ.NumField())
	}
	if _, ok := typ.FieldByName("Tons"); !ok {
		t.Error("Request has no Tons field")
	}
	if _, ok := typ.FieldByName("OperationKey"); !ok {
		t.Error("Request has no OperationKey field")
	}
}

// TestRequest_JSONRoundTrips exercises the actual wire encoding a client's
// body and the handler's ShouldBindJSON both depend on.
func TestRequest_JSONRoundTrips(t *testing.T) {
	req := Request{Tons: 12.5, OperationKey: "sdet-model-roundtrip-0001"}
	raw, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}
	if _, ok := decoded["tons"]; !ok {
		t.Error("encoded JSON has no \"tons\" key")
	}
	if _, ok := decoded["operationKey"]; !ok {
		t.Error("encoded JSON has no \"operationKey\" key")
	}

	var back Request
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatalf("unmarshal back to Request: %v", err)
	}
	if back != req {
		t.Errorf("round trip = %+v, want %+v", back, req)
	}
}

// TestRequest_UnknownExtraFieldIsIgnoredNotRejected: the handler's
// ShouldBindJSON does not reject unknown keys, so a client-supplied
// "corporationId" in the raw body — request-authorization's own scenario —
// silently has no effect rather than erroring; this pins that at the
// decode boundary, one layer beneath the handler's own e2e coverage.
func TestRequest_UnknownExtraFieldIsIgnoredNotRejected(t *testing.T) {
	raw := []byte(`{"tons":5,"operationKey":"sdet-model-extra-0001","corporationId":"corp-attacker"}`)
	var req Request
	if err := json.Unmarshal(raw, &req); err != nil {
		t.Fatalf("unmarshal with an extra unknown field: %v", err)
	}
	if req.Tons != 5 || req.OperationKey != "sdet-model-extra-0001" {
		t.Errorf("decoded = %+v, want Tons=5 OperationKey=sdet-model-extra-0001", req)
	}
}

// TestResult_SchemaCarriesNoActionOrEtaField pins fuel-purchase "Instant,
// Not an Action": "the response includes no action id and no ETA" is only
// true if the settled Result shape never declares such a field.
func TestResult_SchemaCarriesNoActionOrEtaField(t *testing.T) {
	typ := reflect.TypeOf(Result{})
	forbidden := []string{"actionid", "actionId", "eta", "etaMs"}
	for i := 0; i < typ.NumField(); i++ {
		name := typ.Field(i).Name
		for _, f := range forbidden {
			if equalFold(name, f) {
				t.Errorf("Result declares a field %q — fuel-purchase's \"Instant, Not an Action\" forbids an action id or ETA on this response", name)
			}
		}
	}
}

// TestResult_JSONRoundTrips exercises the shape the handler's c.JSON(200,
// res) actually serves.
func TestResult_JSONRoundTrips(t *testing.T) {
	res := Result{
		Cost:      42,
		Cargo:     map[string]float64{"fuel": 137.5},
		Balance:   958,
		WorldTime: common.WorldMillis(1000),
	}
	raw, err := json.Marshal(res)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var back Result
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if back.Cost != res.Cost || back.Balance != res.Balance || back.WorldTime != res.WorldTime {
		t.Errorf("round trip = %+v, want %+v", back, res)
	}
	if back.Cargo["fuel"] != 137.5 {
		t.Errorf("cargo.fuel = %v, want 137.5", back.Cargo["fuel"])
	}
}

func equalFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	lower := func(r byte) byte {
		if r >= 'A' && r <= 'Z' {
			return r + 32
		}
		return r
	}
	for i := 0; i < len(a); i++ {
		if lower(a[i]) != lower(b[i]) {
			return false
		}
	}
	return true
}
