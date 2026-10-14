package galaxy

import (
	"encoding/base32"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// CatalogueReference encodes full identity rather than a truncated hash. It
// stays unique across galaxies and across the unbounded coordinate field.
func CatalogueReference(galaxyID, systemID string) string {
	enc := base32.StdEncoding.WithPadding(base32.NoPadding)
	galaxyBytes := []byte(galaxyID)
	if id, err := uuid.Parse(strings.TrimPrefix(galaxyID, "gal_")); err == nil {
		galaxyBytes = id[:]
	}
	if cell, ok := CellForSystemId(systemID); ok {
		return "HX-" + enc.EncodeToString(galaxyBytes) + "." + strconv.FormatInt(int64(cell.X), 36) + "." + strconv.FormatInt(int64(cell.Y), 36)
	}
	return "HX-" + enc.EncodeToString([]byte(galaxyID)) + "." + enc.EncodeToString([]byte(systemID))
}
