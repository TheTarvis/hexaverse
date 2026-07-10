package galaxy

import (
	"fmt"
	"strings"
)

var (
	nameOnsets = []string{
		"Ax", "Vel", "Cor", "Thal", "Zor", "Nyx", "Kel", "Dra", "Ser", "Oph",
		"Myr", "Tal", "Vor", "Qua", "Rho", "Lyr", "Ith", "Bel", "Cae", "Xan",
	}
	nameNuclei = []string{"a", "e", "i", "o", "u", "ae", "io", "ou", "ei", "y"}
	nameCodas  = []string{
		"ion", "ux", "or", "eth", "is", "ara", "en", "os", "yr", "ax",
		"une", "ella", "ix", "orn", "ade", "ub", "esh", "ai", "on", "ur",
	}
	// A sparse catalog suffix on some systems, the way real star catalogs read.
	nameSuffixes = []string{"", "", "", "", " Prime", " Minor", " II", " III", " Nexus"}
)

// systemName builds a deterministic, pronounceable name from the galaxy seed and
// the system index. Same seed → same name.
func systemName(seed int64, index int) string {
	mix := uint64(seed) ^ (uint64(index+1) * 0x9E3779B97F4A7C15)
	r := newRand(int64(mix))
	var b strings.Builder
	b.WriteString(nameOnsets[r.Intn(len(nameOnsets))])
	b.WriteString(nameNuclei[r.Intn(len(nameNuclei))])
	b.WriteString(nameCodas[r.Intn(len(nameCodas))])
	// Onsets are already capitalized and the rest lowercase — no re-casing needed.
	return fmt.Sprintf("%s%s", b.String(), nameSuffixes[r.Intn(len(nameSuffixes))])
}
