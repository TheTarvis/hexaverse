package config

import "testing"

func TestLocalTuningRequiresLocalEnvironmentAndLoopbackEmulator(t *testing.T) {
	old := ServiceConfig.Env
	t.Cleanup(func() { ServiceConfig.Env = old })
	for _, test := range []struct {
		env, host string
		want      bool
	}{{"LOCAL", "127.0.0.1:8080", true}, {"LOCAL", "localhost:8080", true}, {"TEST", "127.0.0.1:8080", false}, {"PROD", "127.0.0.1:8080", false}, {"LOCAL", "", false}, {"LOCAL", "firestore.example.com:8080", false}} {
		ServiceConfig.Env = test.env
		t.Setenv("FIRESTORE_EMULATOR_HOST", test.host)
		if got := LocalTuningAllowed(); got != test.want {
			t.Fatalf("%s %s: %v", test.env, test.host, got)
		}
	}
}
