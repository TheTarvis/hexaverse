package discovery

import "testing"

func TestCelestialNameValidation(t *testing.T) {
	for _, input := range []string{"Io", "A!pha", "🚀 World", "An Admin Star", "Official Support", "Fuck Haven", "This name is certainly much longer than forty characters"} {
		if _, err := ValidateName(input); err == nil {
			t.Errorf("accepted %q", input)
		}
	}
	for _, input := range []string{"Scunthorpe", "Classical Haven", "O'Neill-7", "Étoile", "Assistant's Reach"} {
		if _, err := ValidateName(input); err != nil {
			t.Errorf("rejected innocent name %q: %v", input, err)
		}
	}
	got, err := ValidateName("  Silver   Haven  ")
	if err != nil || got != "Silver Haven" {
		t.Fatalf("normalization = %q, %v", got, err)
	}
	if Canonical("ÉTOILE") != Canonical("E\u0301toile") {
		t.Fatal("equivalent Latin names have different uniqueness keys")
	}
}
