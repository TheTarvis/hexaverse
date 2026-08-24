package middlewares

import (
	"net/http"
	"sync"
	"time"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

// CorpWriteQuota is a fixed-window quota keyed on the requester's
// SERVER-RESOLVED corporation id, applied only to credit-mutating routes.
//
// Why this exists alongside the per-IP tiers rather than instead of them: the
// general 600/min/IP limiter's own documented defects make it an insufficient
// sole control for a money-mutating endpoint. It keys on ClientIP() with no
// trusted-proxy configuration, so a spoofed X-Forwarded-For obtains a fresh
// bucket per request, and it is per-instance rather than service-wide, so Cloud
// Run's autoscaling multiplies the effective ceiling by instance count. A limit
// whose own spec admits it cannot reliably bound one caller is not a control a
// balance-mutating route should rest its only quota on.
//
// This quota is orthogonal to both defects: common.ActorCorp is resolved
// server-side from a verified token, and no client-controlled header influences
// it. (It remains per-instance, like the IP tiers — a shared-store limiter is a
// separate concern for both.)
//
// It is deliberately NOT applied to ordinary command endpoints
// (orders/cancel/scan): those mutate no balance, and taxing them would slow
// ordinary play for no security gain.
type CorpWriteQuota struct {
	mu      sync.Mutex
	entries map[string]*quotaEntry
	limit   int
	window  time.Duration
}

type quotaEntry struct {
	count   int
	resetAt time.Time
}

func NewCorpWriteQuota(limit int, window time.Duration) *CorpWriteQuota {
	q := &CorpWriteQuota{
		entries: make(map[string]*quotaEntry),
		limit:   limit,
		window:  window,
	}
	go q.cleanup()
	return q
}

// Middleware enforces the quota.
//
// A corpless requester is NOT rejected here: the route's own auth check owns
// that rejection and reports it with the right reason. Consuming quota for a
// caller with no corporation would also mean bucketing every corpless request
// together under one key.
func (q *CorpWriteQuota) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		corpID := common.ActorCorp(c)
		if corpID == "" {
			c.Next()
			return
		}

		q.mu.Lock()
		entry, exists := q.entries[corpID]
		now := time.Now()
		if !exists || now.After(entry.resetAt) {
			q.entries[corpID] = &quotaEntry{count: 1, resetAt: now.Add(q.window)}
			q.mu.Unlock()
			c.Next()
			return
		}
		entry.count++
		over := entry.count > q.limit
		retryAfter := time.Until(entry.resetAt)
		q.mu.Unlock()

		if over {
			c.Header("Retry-After", strconvSeconds(retryAfter))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "too many credit-mutating requests for this corporation",
			})
			return
		}
		c.Next()
	}
}

func (q *CorpWriteQuota) cleanup() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		q.mu.Lock()
		now := time.Now()
		for k, e := range q.entries {
			if now.After(e.resetAt) {
				delete(q.entries, k)
			}
		}
		q.mu.Unlock()
	}
}

func strconvSeconds(d time.Duration) string {
	secs := int(d.Seconds())
	if secs < 1 {
		secs = 1
	}
	return itoa(secs)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
