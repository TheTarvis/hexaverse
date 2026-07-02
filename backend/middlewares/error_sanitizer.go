package middlewares

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"{{PROJECT_SLUG}}/common"
	apiconfig "{{PROJECT_SLUG}}/config"

	"github.com/gin-gonic/gin"
)

// sanitizingWriter buffers JSON response bodies so the ErrorSanitizer middleware
// can inspect the status code and either flush verbatim or replace with a generic
// error. Streaming responses (detected by Content-Type) are passed through without
// buffering so SSE endpoints are unaffected.
type sanitizingWriter struct {
	gin.ResponseWriter
	body      *bytes.Buffer
	status    int
	streaming bool
	started   bool
}

func (w *sanitizingWriter) WriteHeader(code int) {
	// Defer the real WriteHeader until the middleware decides the final body.
	w.status = code
}

func (w *sanitizingWriter) Write(b []byte) (int, error) {
	if w.streaming {
		return w.ResponseWriter.Write(b)
	}
	if !w.started {
		w.started = true
		// First write — check if this is a streaming response. SSE handlers set
		// Content-Type before writing, so we can detect them here and switch to
		// pass-through mode. Anything else we buffer for possible sanitization.
		ct := w.ResponseWriter.Header().Get("Content-Type")
		if strings.Contains(ct, "text/event-stream") || strings.Contains(ct, "application/octet-stream") {
			w.streaming = true
			w.ResponseWriter.WriteHeader(w.status)
			return w.ResponseWriter.Write(b)
		}
	}
	return w.body.Write(b)
}

func (w *sanitizingWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

func (w *sanitizingWriter) Status() int {
	if w.status == 0 {
		return http.StatusOK
	}
	return w.status
}

// ErrorSanitizer replaces 5xx JSON error bodies with a generic message + trace ID
// in production. Handlers already log the full error before responding, so the
// detail is preserved in logs and the trace ID lets support look it up.
// Local/test environments pass through unchanged so developers see real errors.
//
// CASA Tier 3 / OWASP ASVS V7.4.1: error handling must not leak sensitive
// information (stack traces, internal paths, database driver messages) to
// unauthenticated clients.
func ErrorSanitizer() gin.HandlerFunc {
	return func(c *gin.Context) {
		if apiconfig.IsLocal() {
			c.Next()
			return
		}

		sw := &sanitizingWriter{
			ResponseWriter: c.Writer,
			body:           &bytes.Buffer{},
		}
		c.Writer = sw

		c.Next()

		if sw.streaming {
			return
		}

		body := sw.body.Bytes()
		contentType := sw.ResponseWriter.Header().Get("Content-Type")

		if sw.status >= 500 && strings.Contains(contentType, "application/json") {
			tracer := c.GetString(common.TracerKey)
			sanitized, _ := json.Marshal(gin.H{
				"error": "Internal server error. Contact support if this persists.",
				"trace": tracer,
			})
			body = sanitized
			sw.ResponseWriter.Header().Set("Content-Length", strconv.Itoa(len(body)))
		}

		status := sw.status
		if status == 0 {
			status = http.StatusOK
		}
		sw.ResponseWriter.WriteHeader(status)
		if len(body) > 0 {
			_, _ = sw.ResponseWriter.Write(body)
		}
	}
}
