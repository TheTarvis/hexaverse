package discovery

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

func Canonical(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(norm.NFC.String(s)), " "))
}

// Whole tokens and exact reserved phrases avoid innocent substring matches.
var prohibited = map[string]bool{"fuck": true, "shit": true, "cunt": true, "nigger": true, "faggot": true, "admin": true, "administrator": true, "moderator": true, "hexaverse": true, "system message": true, "official support": true}

func ValidateName(input string) (string, error) {
	name := strings.Join(strings.Fields(norm.NFC.String(input)), " ")
	if n := utf8.RuneCountInString(name); n < 3 || n > 40 {
		return "", fmt.Errorf("%w: use 3–40 characters", ErrInvalid)
	}
	for _, r := range name {
		if !(unicode.Is(unicode.Latin, r) || r >= '0' && r <= '9' || r == ' ' || r == '\'' || r == '-') {
			return "", fmt.Errorf("%w: use Latin letters, numbers, spaces, apostrophes or hyphens", ErrInvalid)
		}
	}
	key := Canonical(name)
	if prohibited[key] {
		return "", fmt.Errorf("%w: reserved or prohibited term", ErrInvalid)
	}
	for _, word := range strings.FieldsFunc(key, func(r rune) bool { return r == ' ' || r == '-' || r == '\'' }) {
		if prohibited[word] {
			return "", fmt.Errorf("%w: reserved or prohibited term", ErrInvalid)
		}
	}
	return name, nil
}
