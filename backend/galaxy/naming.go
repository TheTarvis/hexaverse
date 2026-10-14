package galaxy

import (
	"fmt"
	"strconv"
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
// the system's STABLE FIELD IDENTITY — its cell coordinates, not a generation
// index (D2). Same seed and cell → same name, whenever and in whatever order the
// system materializes.
func systemName(seed int64, cell Cell) string {
	r := newRand(int64(mix(cellHash(seed, cell), 5)))
	var b strings.Builder
	b.WriteString(nameOnsets[r.Intn(len(nameOnsets))])
	b.WriteString(nameNuclei[r.Intn(len(nameNuclei))])
	b.WriteString(nameCodas[r.Intn(len(nameCodas))])
	// Onsets are already capitalized and the rest lowercase — no re-casing needed.
	return fmt.Sprintf("%s%s %s.%s", b.String(), nameSuffixes[r.Intn(len(nameSuffixes))], strconv.FormatInt(int64(cell.X), 36), strconv.FormatInt(int64(cell.Y), 36))
}
