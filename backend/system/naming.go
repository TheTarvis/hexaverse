package system

import (
	"fmt"
	"strconv"
	"strings"

	"hexaverse/discovery"
	"hexaverse/galaxy"
)

// Families give a system a shared character without coupling naming draws to
// either of the physical generation streams.
var nameFamilies = [][]string{
	{"Ember", "Cinder", "Copper", "Saffron", "Amber", "Flame"},
	{"Tide", "Pearl", "Coral", "Azure", "Reef", "Mist"},
	{"Grove", "Willow", "Fern", "Moss", "Laurel", "Bloom"},
	{"Frost", "Silver", "Crystal", "Winter", "Glacier", "Snow"},
}

func assignGeneratedNames(seed int64, features []Feature) {
	family := nameFamilies[uint64(seed)%uint64(len(nameFamilies))]
	parents := map[string]string{}
	for i := range features {
		f := &features[i]
		if f.Type == FeatureStar {
			// The materialization boundary supplies the persisted galaxy star name.
			f.Name = "Central Star"
		} else if f.Type == FeatureMoon {
			f.Name = parents[f.Space.ParentId] + " " + family[uint64(galaxy.SystemSeed(seed, f.Id))%uint64(len(family))] + " Moon"
		} else {
			word := family[uint64(galaxy.SystemSeed(seed, f.Id))%uint64(len(family))]
			// Stable local identity disambiguates repeated family words, independent
			// of iteration order or how many other bodies have materialized.
			local := bodyDesignation(f.Id)
			noun := "Haven"
			if !discovery.Eligible(string(f.Type)) {
				noun = strings.ReplaceAll(string(f.Type), "_", " ")
			}
			f.Name = fmt.Sprintf("%s %s %s", word, noun, local)
		}
		f.GeneratedName = f.Name
		parents[f.Id] = f.Name
	}
}

func prepareNames(galaxyID string, node *galaxy.System, gen *GeneratedInterior) {
	for i := range gen.Features {
		f := &gen.Features[i]
		f.CatalogueRef = galaxy.CatalogueReference(galaxyID, node.Id) + " " + bodyDesignation(f.Id)
		if f.Type == FeatureStar {
			f.Name, f.GeneratedName = node.Name, node.GeneratedName
			f.CatalogueRef = galaxy.CatalogueReference(galaxyID, node.Id)
		}
	}
}

func bodyDesignation(id string) string {
	parts := strings.Split(id, "-")
	if len(parts) < 3 {
		return id
	}
	index, err := strconv.Atoi(parts[len(parts)-1])
	if err != nil {
		return id
	}
	numeral := strconv.Itoa(index + 1)
	roman := []string{"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"}
	if index >= 0 && index < len(roman) {
		numeral = roman[index]
	}
	if parts[1] == "body" {
		return numeral
	}
	return strings.ToUpper(parts[1][:1]) + "-" + numeral
}
