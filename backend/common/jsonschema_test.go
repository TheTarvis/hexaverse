package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewObjectSchema(t *testing.T) {
	schema := NewObjectSchema("Test Schema", "A test description")

	// Verify basic properties
	assert.Equal(t, "Test Schema", schema.Title)
	assert.Equal(t, "A test description", schema.Description)
	assert.Equal(t, "object", schema.Type)

	// Verify schema URL
	assert.Equal(t, "https://json-schema.org/draft/2020-12/schema", schema.Schema)

	// Verify properties map is initialized
	assert.NotNil(t, schema.Properties)
	assert.Empty(t, schema.Properties)

	// Verify required is initialized as empty
	assert.NotNil(t, schema.Required)
	assert.Empty(t, schema.Required)

	// Verify additional properties is true by default
	assert.Equal(t, true, schema.AdditionalProperties)
}

func TestNewObjectSchema_EmptyValues(t *testing.T) {
	schema := NewObjectSchema("", "")

	assert.Equal(t, "", schema.Title)
	assert.Equal(t, "", schema.Description)
	assert.Equal(t, "object", schema.Type)
}

func TestJSONSchemaProperty_TypeVariants(t *testing.T) {
	// Test that Type can be string
	prop := &JSONSchemaProperty{
		Type: "string",
	}
	assert.Equal(t, "string", prop.Type)

	// Test that Type can be array of strings
	prop2 := &JSONSchemaProperty{
		Type: []string{"string", "null"},
	}
	typeArr, ok := prop2.Type.([]string)
	assert.True(t, ok)
	assert.Contains(t, typeArr, "string")
	assert.Contains(t, typeArr, "null")
}

func TestJSONSchemaProperty_Metadata(t *testing.T) {
	isIdentifier := true

	prop := &JSONSchemaProperty{
		Title:        "Email",
		Description:  "User email address",
		IsIdentifier: &isIdentifier,
		Format:       "email",
	}

	assert.Equal(t, "Email", prop.Title)
	assert.Equal(t, "User email address", prop.Description)
	assert.True(t, *prop.IsIdentifier)
	assert.Equal(t, "email", prop.Format)
}
