package common

import (
	"fmt"
	"regexp"
	"strings"
)

// TemplateResolver resolves {{nodeId:fieldName}} and {{fieldName}} placeholders
// in template strings using record data.
type TemplateResolver struct {
	// StrictMode controls behavior for unresolved placeholders.
	// When true, returns an error if any placeholder cannot be resolved.
	// When false, leaves unresolved placeholders as-is.
	StrictMode bool
}

// DefaultResolver resolves templates leniently — unresolved tokens are left as-is.
// Suitable for AI enrichment where the model can handle literal placeholder text.
var DefaultResolver = &TemplateResolver{StrictMode: false}

// StrictResolver resolves templates strictly — returns an error on missing fields.
// Suitable for user-facing output like tweets where unresolved tokens are visible.
var StrictResolver = &TemplateResolver{StrictMode: true}

// templatePattern matches both {{nodeId:fieldName}} and {{fieldName}}.
var templatePattern = regexp.MustCompile(`\{\{([^}]+)\}\}`)

// Resolve replaces template placeholders with values from the record.
//
// Resolution order for {{nodeId:fieldName}}:
//  1. record[nodeId].(map)["fieldName"] — namespaced (join records)
//  2. record["fieldName"] — flat fallback (single-source records)
//
// Legacy {{fieldName}} format uses flat lookup only.
func (r *TemplateResolver) Resolve(template string, record map[string]interface{}) (string, error) {
	if template == "" {
		return "", nil
	}

	matches := templatePattern.FindAllStringSubmatch(template, -1)
	if len(matches) == 0 {
		return template, nil
	}

	result := template
	for _, match := range matches {
		placeholder := match[0]                  // e.g., "{{nodeId:fieldName}}" or "{{fieldName}}"
		tokenBody := strings.TrimSpace(match[1]) // e.g., "nodeId:fieldName" or "fieldName"

		value, found := r.resolveToken(tokenBody, record)

		if !found {
			if r.StrictMode {
				return "", fmt.Errorf("field '%s' not found in record", tokenBody)
			}
			// Lenient: leave placeholder as-is
			continue
		}

		// Convert value to string
		strValue := formatValue(value)
		result = strings.ReplaceAll(result, placeholder, strValue)
	}

	return result, nil
}

// resolveToken resolves a single token body (without braces).
func (r *TemplateResolver) resolveToken(token string, record map[string]interface{}) (interface{}, bool) {
	// Check for namespaced format: "nodeId:fieldName"
	if colonIdx := strings.Index(token, ":"); colonIdx > 0 {
		nodeId := token[:colonIdx]
		fieldName := token[colonIdx+1:]

		// Try namespaced lookup: record[nodeId].(map)[fieldName]
		if nsData, ok := record[nodeId]; ok {
			if nsMap, ok := nsData.(map[string]interface{}); ok {
				if val, ok := nsMap[fieldName]; ok {
					return val, true
				}
				// Try dot-notation within namespace: record[nodeId].(map)[a].(map)[b]
				if val, ok := resolveNestedField(nsMap, fieldName); ok {
					return val, true
				}
			}
		}

		// Flat fallback: record[fieldName]
		if val, ok := record[fieldName]; ok {
			return val, true
		}
		// Flat fallback with dot-notation: record[a].(map)[b]
		if val, ok := resolveNestedField(record, fieldName); ok {
			return val, true
		}

		return nil, false
	}

	// Legacy format: "fieldName" — flat lookup, then dot-notation
	if val, ok := record[token]; ok {
		return val, ok
	}
	return resolveNestedField(record, token)
}

// resolveNestedField resolves dot-notation field paths like "ai_response.subject"
// by traversing nested maps: record["ai_response"].(map)["subject"].
func resolveNestedField(record map[string]interface{}, fieldPath string) (interface{}, bool) {
	parts := strings.Split(fieldPath, ".")
	if len(parts) <= 1 {
		return nil, false
	}

	var current interface{} = record
	for _, part := range parts {
		m, ok := current.(map[string]interface{})
		if !ok {
			return nil, false
		}
		current, ok = m[part]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

// formatValue converts an arbitrary value to its string representation.
func formatValue(value interface{}) string {
	if value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return v
	default:
		return fmt.Sprintf("%v", v)
	}
}
