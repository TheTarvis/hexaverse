package common

// JSONSchemaProperty represents a property in a JSON Schema (Draft 2020-12)
type JSONSchemaProperty struct {
	// Core validation
	Type  interface{}   `json:"type,omitempty" firestore:"type,omitempty"`   // string, []string, or nil
	Const interface{}   `json:"const,omitempty" firestore:"const,omitempty"` // Constant value
	Enum  []interface{} `json:"enum,omitempty" firestore:"enum,omitempty"`   // Enumeration of values

	// String validation
	MinLength *int   `json:"minLength,omitempty" firestore:"minLength,omitempty"`
	MaxLength *int   `json:"maxLength,omitempty" firestore:"maxLength,omitempty"`
	Pattern   string `json:"pattern,omitempty" firestore:"pattern,omitempty"`
	Format    string `json:"format,omitempty" firestore:"format,omitempty"` // email, uri, date, date-time, time, uuid, etc.

	// Number validation
	Minimum          *float64 `json:"minimum,omitempty" firestore:"minimum,omitempty"`
	Maximum          *float64 `json:"maximum,omitempty" firestore:"maximum,omitempty"`
	ExclusiveMinimum *float64 `json:"exclusiveMinimum,omitempty" firestore:"exclusiveMinimum,omitempty"`
	ExclusiveMaximum *float64 `json:"exclusiveMaximum,omitempty" firestore:"exclusiveMaximum,omitempty"`
	MultipleOf       *float64 `json:"multipleOf,omitempty" firestore:"multipleOf,omitempty"`

	// Object validation
	Properties           map[string]*JSONSchemaProperty `json:"properties,omitempty" firestore:"properties,omitempty"`
	PatternProperties    map[string]*JSONSchemaProperty `json:"patternProperties,omitempty" firestore:"patternProperties,omitempty"`
	AdditionalProperties interface{}                    `json:"additionalProperties,omitempty" firestore:"additionalProperties,omitempty"` // bool or JSONSchemaProperty
	Required             []string                       `json:"required,omitempty" firestore:"required,omitempty"`
	MinProperties        *int                           `json:"minProperties,omitempty" firestore:"minProperties,omitempty"`
	MaxProperties        *int                           `json:"maxProperties,omitempty" firestore:"maxProperties,omitempty"`

	// Array validation
	Items       interface{}           `json:"items,omitempty" firestore:"items,omitempty"` // JSONSchemaProperty or []JSONSchemaProperty
	PrefixItems []*JSONSchemaProperty `json:"prefixItems,omitempty" firestore:"prefixItems,omitempty"`
	Contains    *JSONSchemaProperty   `json:"contains,omitempty" firestore:"contains,omitempty"`
	MinItems    *int                  `json:"minItems,omitempty" firestore:"minItems,omitempty"`
	MaxItems    *int                  `json:"maxItems,omitempty" firestore:"maxItems,omitempty"`
	UniqueItems *bool                 `json:"uniqueItems,omitempty" firestore:"uniqueItems,omitempty"`

	// Conditional validation
	If    *JSONSchemaProperty   `json:"if,omitempty" firestore:"if,omitempty"`
	Then  *JSONSchemaProperty   `json:"then,omitempty" firestore:"then,omitempty"`
	Else  *JSONSchemaProperty   `json:"else,omitempty" firestore:"else,omitempty"`
	AllOf []*JSONSchemaProperty `json:"allOf,omitempty" firestore:"allOf,omitempty"`
	AnyOf []*JSONSchemaProperty `json:"anyOf,omitempty" firestore:"anyOf,omitempty"`
	OneOf []*JSONSchemaProperty `json:"oneOf,omitempty" firestore:"oneOf,omitempty"`
	Not   *JSONSchemaProperty   `json:"not,omitempty" firestore:"not,omitempty"`

	// Metadata
	Title        string        `json:"title,omitempty" firestore:"title,omitempty"`
	Description  string        `json:"description,omitempty" firestore:"description,omitempty"`
	Default      interface{}   `json:"default,omitempty" firestore:"default,omitempty"`
	Examples     []interface{} `json:"examples,omitempty" firestore:"examples,omitempty"`
	Deprecated   *bool         `json:"deprecated,omitempty" firestore:"deprecated,omitempty"`
	ReadOnly     *bool         `json:"readOnly,omitempty" firestore:"readOnly,omitempty"`
	WriteOnly    *bool         `json:"writeOnly,omitempty" firestore:"writeOnly,omitempty"`
	IsIdentifier *bool         `json:"isIdentifier,omitempty" firestore:"isIdentifier,omitempty"` // Marks this field as the unique identifier
	// References
	Ref  string                         `json:"$ref,omitempty" firestore:"$ref,omitempty"`
	Defs map[string]*JSONSchemaProperty `json:"$defs,omitempty" firestore:"$defs,omitempty"`

	// Schema metadata
	Schema  string `json:"$schema,omitempty" firestore:"$schema,omitempty"`
	ID      string `json:"$id,omitempty" firestore:"$id,omitempty"`
	Comment string `json:"$comment,omitempty" firestore:"$comment,omitempty"`
}

// JSONSchema represents a complete JSON Schema document (Draft 2020-12)
type JSONSchema struct {
	// Schema metadata
	Schema      string `json:"$schema,omitempty" firestore:"$schema,omitempty"` // Usually "https://json-schema.org/draft/2020-12/schema"
	ID          string `json:"$id,omitempty" firestore:"$id,omitempty"`         // Unique identifier URI for the schema
	Title       string `json:"title,omitempty" firestore:"title,omitempty"`
	Description string `json:"description,omitempty" firestore:"description,omitempty"`

	// Core validation (embedded from JSONSchemaProperty)
	Type  interface{}   `json:"type,omitempty" firestore:"type,omitempty"` // Usually "object" or "array" at root
	Const interface{}   `json:"const,omitempty" firestore:"const,omitempty"`
	Enum  []interface{} `json:"enum,omitempty" firestore:"enum,omitempty"`

	// Object validation (most common for root)
	Properties           map[string]*JSONSchemaProperty `json:"properties,omitempty" firestore:"properties,omitempty"`
	PatternProperties    map[string]*JSONSchemaProperty `json:"patternProperties,omitempty" firestore:"patternProperties,omitempty"`
	AdditionalProperties interface{}                    `json:"additionalProperties,omitempty" firestore:"additionalProperties,omitempty"`
	Required             []string                       `json:"required,omitempty" firestore:"required,omitempty"`
	MinProperties        *int                           `json:"minProperties,omitempty" firestore:"minProperties,omitempty"`
	MaxProperties        *int                           `json:"maxProperties,omitempty" firestore:"maxProperties,omitempty"`

	// Array validation (if root is array)
	Items       interface{}           `json:"items,omitempty" firestore:"items,omitempty"`
	PrefixItems []*JSONSchemaProperty `json:"prefixItems,omitempty" firestore:"prefixItems,omitempty"`
	Contains    *JSONSchemaProperty   `json:"contains,omitempty" firestore:"contains,omitempty"`
	MinItems    *int                  `json:"minItems,omitempty" firestore:"minItems,omitempty"`
	MaxItems    *int                  `json:"maxItems,omitempty" firestore:"maxItems,omitempty"`
	UniqueItems *bool                 `json:"uniqueItems,omitempty" firestore:"uniqueItems,omitempty"`

	// Conditional validation
	If    *JSONSchemaProperty   `json:"if,omitempty" firestore:"if,omitempty"`
	Then  *JSONSchemaProperty   `json:"then,omitempty" firestore:"then,omitempty"`
	Else  *JSONSchemaProperty   `json:"else,omitempty" firestore:"else,omitempty"`
	AllOf []*JSONSchemaProperty `json:"allOf,omitempty" firestore:"allOf,omitempty"`
	AnyOf []*JSONSchemaProperty `json:"anyOf,omitempty" firestore:"anyOf,omitempty"`
	OneOf []*JSONSchemaProperty `json:"oneOf,omitempty" firestore:"oneOf,omitempty"`
	Not   *JSONSchemaProperty   `json:"not,omitempty" firestore:"not,omitempty"`

	// Reusable schema definitions
	Defs map[string]*JSONSchemaProperty `json:"$defs,omitempty" firestore:"$defs,omitempty"`

	// Other metadata
	Default  interface{}   `json:"default,omitempty" firestore:"default,omitempty"`
	Examples []interface{} `json:"examples,omitempty" firestore:"examples,omitempty"`
	Comment  string        `json:"$comment,omitempty" firestore:"$comment,omitempty"`
}

// NewObjectSchema creates a basic object schema
func NewObjectSchema(title, description string) *JSONSchema {
	return &JSONSchema{
		Schema:               "https://json-schema.org/draft/2020-12/schema",
		Title:                title,
		Description:          description,
		Type:                 "object",
		Properties:           make(map[string]*JSONSchemaProperty),
		Required:             []string{},
		AdditionalProperties: true, // Allow additional properties by default for flexibility
	}
}
