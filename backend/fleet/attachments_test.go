package fleet

// Unit coverage for Attachments (tasks.md 4.1: "Implement a
// disclosure.Attachments adapter over fleet.Fleet.AttachedTo/DockedTo").
// Written directly against the interface disclosure.Attachments declares
// (HostOf, AttachedTo) rather than any disclosure-package fixture, so this
// test would fail to compile if the adapter's method set ever drifted from
// that contract.

import (
	"sort"
	"testing"

	"hexaverse/disclosure"
)

func TestAttachments_SatisfiesDisclosureAttachments(t *testing.T) {
	var _ disclosure.Attachments = Attachments(nil)
}

func TestAttachments_HostOf(t *testing.T) {
	a := Attachments{
		{Id: "docked", AttachedTo: "planet"},
		{Id: "free"},
	}

	if host, ok := a.HostOf("docked"); !ok || host != "planet" {
		t.Errorf("HostOf(docked) = (%q, %v), want (planet, true)", host, ok)
	}
	if _, ok := a.HostOf("free"); ok {
		t.Errorf("HostOf(free) reported attached; a free-flying fleet has no host")
	}
	if _, ok := a.HostOf("unknown"); ok {
		t.Errorf("HostOf(unknown) reported attached; an id absent from the set must report false")
	}
}

func TestAttachments_AttachedToIsStableAndReverse(t *testing.T) {
	a := Attachments{
		{Id: "c", AttachedTo: "planet"},
		{Id: "a", AttachedTo: "planet"},
		{Id: "b", AttachedTo: "other-body"},
		{Id: "free"},
	}

	got := a.AttachedTo("planet")
	want := []string{"a", "c"}
	if !sort.StringsAreSorted(got) || len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("AttachedTo(planet) = %v, want %v in stable sorted order", got, want)
	}

	if got := a.AttachedTo("nobody-docked-here"); len(got) != 0 {
		t.Errorf("AttachedTo(nobody-docked-here) = %v, want empty", got)
	}
}
