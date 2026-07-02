package common

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"cloud.google.com/go/pubsub"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestWrapPushHandler_DecodesMessage(t *testing.T) {
	gin.SetMode(gin.TestMode)

	originalData := `{"test": "hello"}`
	encoded := base64.StdEncoding.EncodeToString([]byte(originalData))

	var receivedMsg *pubsub.Message
	handler := func(ctx context.Context, msg *pubsub.Message) {
		receivedMsg = msg
	}

	body := PushRequestBody{
		Message: PushMessage{
			Data:       encoded,
			Attributes: map[string]string{"type": "test.event", "orgId": "org-123"},
			MessageID:  "msg-456",
		},
		Subscription: "projects/my-project/subscriptions/test-sub",
	}

	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/push/test", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router := gin.New()
	router.POST("/push/test", WrapPushHandler(handler))
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.NotNil(t, receivedMsg)
	assert.Equal(t, originalData, string(receivedMsg.Data))
	assert.Equal(t, "test.event", receivedMsg.Attributes["type"])
	assert.Equal(t, "org-123", receivedMsg.Attributes["orgId"])
	assert.Equal(t, "msg-456", receivedMsg.ID)
}

func TestWrapPushHandler_InvalidJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := func(ctx context.Context, msg *pubsub.Message) {
		t.Fatal("handler should not be called on invalid JSON")
	}

	req := httptest.NewRequest(http.MethodPost, "/push/test", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router := gin.New()
	router.POST("/push/test", WrapPushHandler(handler))
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestWrapPushHandler_InvalidBase64(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := func(ctx context.Context, msg *pubsub.Message) {
		t.Fatal("handler should not be called on invalid base64")
	}

	body := PushRequestBody{
		Message: PushMessage{
			Data:      "not-valid-base64!!!",
			MessageID: "msg-789",
		},
	}

	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/push/test", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router := gin.New()
	router.POST("/push/test", WrapPushHandler(handler))
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestWrapPushHandler_EmptyData(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var receivedMsg *pubsub.Message
	handler := func(ctx context.Context, msg *pubsub.Message) {
		receivedMsg = msg
	}

	body := PushRequestBody{
		Message: PushMessage{
			Data:       "",
			Attributes: map[string]string{"type": "test.event"},
			MessageID:  "msg-000",
		},
	}

	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/push/test", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router := gin.New()
	router.POST("/push/test", WrapPushHandler(handler))
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.NotNil(t, receivedMsg)
	assert.Empty(t, receivedMsg.Data)
	assert.Equal(t, "test.event", receivedMsg.Attributes["type"])
}

func TestWrapPushHandler_AckNackAreNoOps(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := func(ctx context.Context, msg *pubsub.Message) {
		// These should not panic — they're no-ops on a zero-value message
		msg.Ack()
		msg.Nack()
	}

	body := PushRequestBody{
		Message: PushMessage{
			Data:      base64.StdEncoding.EncodeToString([]byte("test")),
			MessageID: "msg-ack",
		},
	}

	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/push/test", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router := gin.New()
	router.POST("/push/test", WrapPushHandler(handler))
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}
