package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTemplateResolver_Resolve(t *testing.T) {
	t.Run("empty template", func(t *testing.T) {
		result, err := DefaultResolver.Resolve("", map[string]interface{}{})
		require.NoError(t, err)
		assert.Equal(t, "", result)
	})

	t.Run("no placeholders", func(t *testing.T) {
		result, err := DefaultResolver.Resolve("hello world", map[string]interface{}{})
		require.NoError(t, err)
		assert.Equal(t, "hello world", result)
	})

	t.Run("flat field lookup", func(t *testing.T) {
		record := map[string]interface{}{
			"name":  "Alice",
			"email": "alice@example.com",
		}
		result, err := DefaultResolver.Resolve("Hello {{name}}, your email is {{email}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Hello Alice, your email is alice@example.com", result)
	})

	t.Run("namespaced resolve", func(t *testing.T) {
		record := map[string]interface{}{
			"source-a": map[string]interface{}{
				"email": "a@example.com",
			},
			"source-b": map[string]interface{}{
				"email": "b@example.com",
			},
		}
		result, err := DefaultResolver.Resolve("A: {{source-a:email}}, B: {{source-b:email}}", record)
		require.NoError(t, err)
		assert.Equal(t, "A: a@example.com, B: b@example.com", result)
	})

	t.Run("namespaced with flat fallback", func(t *testing.T) {
		// nodeId namespace doesn't exist, but fieldName exists at top level
		record := map[string]interface{}{
			"email": "flat@example.com",
		}
		result, err := DefaultResolver.Resolve("Email: {{node-123:email}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Email: flat@example.com", result)
	})

	t.Run("lenient mode leaves unresolved", func(t *testing.T) {
		record := map[string]interface{}{
			"name": "Alice",
		}
		result, err := DefaultResolver.Resolve("Hello {{name}}, missing {{unknown}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Hello Alice, missing {{unknown}}", result)
	})

	t.Run("strict mode errors on missing", func(t *testing.T) {
		record := map[string]interface{}{
			"name": "Alice",
		}
		_, err := StrictResolver.Resolve("Hello {{name}}, missing {{unknown}}", record)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "field 'unknown' not found in record")
	})

	t.Run("strict mode succeeds when all fields present", func(t *testing.T) {
		record := map[string]interface{}{
			"name": "Alice",
			"age":  float64(30),
		}
		result, err := StrictResolver.Resolve("{{name}} is {{age}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Alice is 30", result)
	})

	t.Run("nil values render as empty string", func(t *testing.T) {
		record := map[string]interface{}{
			"name": nil,
		}
		result, err := DefaultResolver.Resolve("Hello {{name}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Hello ", result)
	})

	t.Run("numeric values", func(t *testing.T) {
		record := map[string]interface{}{
			"count": float64(42),
			"price": 19.99,
		}
		result, err := DefaultResolver.Resolve("Count: {{count}}, Price: {{price}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Count: 42, Price: 19.99", result)
	})

	t.Run("boolean values", func(t *testing.T) {
		record := map[string]interface{}{
			"active": true,
		}
		result, err := DefaultResolver.Resolve("Active: {{active}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Active: true", result)
	})

	t.Run("join records with same field name", func(t *testing.T) {
		record := map[string]interface{}{
			"customers": map[string]interface{}{
				"email": "customer@example.com",
				"name":  "Customer Corp",
			},
			"orders": map[string]interface{}{
				"email": "orders@example.com",
				"total": float64(100),
			},
		}
		result, err := DefaultResolver.Resolve(
			"Customer: {{customers:email}}, Order: {{orders:email}}, Total: {{orders:total}}",
			record,
		)
		require.NoError(t, err)
		assert.Equal(t, "Customer: customer@example.com, Order: orders@example.com, Total: 100", result)
	})

	t.Run("flat and namespaced mixed", func(t *testing.T) {
		record := map[string]interface{}{
			"greeting": "Hello",
			"source-1": map[string]interface{}{
				"name": "Alice",
			},
		}
		result, err := DefaultResolver.Resolve("{{greeting}} {{source-1:name}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Hello Alice", result)
	})

	t.Run("repeated placeholder", func(t *testing.T) {
		record := map[string]interface{}{
			"name": "Alice",
		}
		result, err := DefaultResolver.Resolve("{{name}} is {{name}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Alice is Alice", result)
	})

	t.Run("dot notation nested field", func(t *testing.T) {
		record := map[string]interface{}{
			"ai_response": map[string]interface{}{
				"subject": "Re: Hello",
				"body":    "Hi there!",
			},
			"from": "alice@example.com",
		}
		result, err := DefaultResolver.Resolve("Subject: {{ai_response.subject}}", record)
		require.NoError(t, err)
		assert.Equal(t, "Subject: Re: Hello", result)
	})

	t.Run("dot notation with namespaced fallback", func(t *testing.T) {
		record := map[string]interface{}{
			"ai_response": map[string]interface{}{
				"subject": "Re: Hello",
				"body":    "Hi there!",
			},
			"from": "alice@example.com",
		}
		// nodeId doesn't exist in record, so falls back to flat dot-notation
		result, err := DefaultResolver.Resolve(
			"To: {{node-123:from}}, Subject: {{node-123:ai_response.subject}}",
			record,
		)
		require.NoError(t, err)
		assert.Equal(t, "To: alice@example.com, Subject: Re: Hello", result)
	})

	t.Run("dot notation strict mode errors on missing nested", func(t *testing.T) {
		record := map[string]interface{}{
			"ai_response": map[string]interface{}{
				"subject": "Re: Hello",
			},
		}
		_, err := StrictResolver.Resolve("{{ai_response.missing_field}}", record)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found in record")
	})
}
