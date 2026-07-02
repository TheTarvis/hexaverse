# Backend

Go (1.24+) HTTP API on Gin, Firestore for storage, Pub/Sub for events.

## Layout

```
backend/
├── account/          # User identity (Firebase Auth → Account record)
├── common/           # Shared infrastructure (Firestore, Pub/Sub, helpers)
├── middlewares/      # Gin middleware (auth, rate limit, tracing, OIDC)
├── sse/              # Server-Sent Events — broadcasts to logical channels
├── health/           # Liveness probe
├── config/           # Env-based config loader
├── main.go           # Entrypoint (Firebase init, router, server start)
├── router.go         # Route registration (handlers wired here)
└── go.mod
```

User-defined domains (e.g. `widgets/`, `posts/`) sit alongside `account/`. Scaffold them with `/new-domain <name>` — see `.claude/skills/new-domain/`.

## Domain package shape

Every domain follows the same six-file layout. The canonical templates live at `.claude/skills/new-domain/templates/backend/`:

```
<plural>/
├── model.go         # Types: <Singular>, CreateRequest, UpdateRequest
├── dao.go           # Firestore I/O. Interface + impl. //go:generate mockgen here.
├── dao_mock.go      # Generated. `go generate ./<plural>/...`
├── service.go       # Business logic. Returns sentinel errors (ErrNotFound, ErrForbidden).
├── service_test.go
└── handler.go       # HTTP. Maps URL → service call, errors → status codes.
```

Add a new domain via `/new-domain <singular> [plural]`, then apply the wiring snippets the script prints (router.go, common/pubsub.go, query-keys.ts, services/index.ts).

## Patterns to follow

> Code examples below use a `widget` domain. Run `/new-domain widget` if you want to follow along — `account/` is the only baseline domain in this skeleton, and it's identity-specific, so it doesn't show the full CRUD pattern.

**Edge → service → DAO.** Handlers parse input and format output. Services hold business logic. DAOs do Firestore I/O. Never put logic in handlers; never let handlers call DAOs directly.

**Cross-domain calls go through services, not DAOs.** If `billing` needs an account, inject `account.ServiceInterface` — not `account.Dao`. A DAO is private to its owning service.

**Auth: `common.Actor(c)`** returns the authenticated account ID from the gin context. The `FirebaseJWTVerification` middleware sets it. Don't read Firebase claims directly.

**Path params: `common.RequiredHttpParam(c, "widgetId")`.** Aborts with 400 if missing. Don't call `c.Param()` directly.

**Events: builder + topic constant.**
```go
envelope := common.NewEvent(ctx, common.WidgetCreated).
    WithSource("widgets-service").
    WithTypedPayload(map[string]any{"widgetId": widget.Id}).
    Build()
common.PubSub().PublishWithContext(ctx, common.TopicWidgetEvents, envelope)
```
Add new event types and topic constants to `common/pubsub.go`. Never publish with string literals.

**Service constructors: two of them.**
```go
func NewService() *Service { return &Service{dao: NewDao()} }
func NewServiceWithDao(dao Dao) *Service { return &Service{dao: dao} }  // for tests
```

## Testing

- Unit tests next to the file (`service_test.go`). Use `gomock` for the DAO.
- Integration tests use the Firestore emulator via `common.SetupFirestoreTestDAO(t)`.
- New collections must be added to `CleanupFirestoreTestData()` in `common/firestore_test_helpers.go` so emulator state doesn't leak between tests.
- Run: `go test -short ./...` (unit), `go test ./...` (full, needs emulators).

## Errors

Use `fmt.Errorf("doing X: %w", err)` so callers can `errors.Is`. Sentinel errors at the top of `service.go`:
```go
var ErrNotFound = errors.New("widget not found")
var ErrForbidden = errors.New("forbidden")
```
Handlers map them to HTTP status:
```go
switch {
case errors.Is(err, ErrNotFound):  c.AbortWithStatus(http.StatusNotFound)
case errors.Is(err, ErrForbidden): c.AbortWithStatus(http.StatusForbidden)
case err != nil:                   c.AbortWithStatus(http.StatusInternalServerError)
default:                           c.JSON(http.StatusOK, widget)
}
```

## Gotchas

- **First `go build` after `/new-domain` will fail until you wire pubsub.** The scaffolded `service.go` references `common.<Singular>Created/Updated/Deleted` and `common.Topic<Singular>Events`, which don't exist until you apply the printed wiring snippet to `common/pubsub.go`. Apply all four wiring edits before building.
- **Firestore document size limit**: 1 MB. Don't store blobs.
- **Firestore batch limit**: 500 writes. Chunk if you exceed.
- **Context.** Always pass `ctx` through every call. The tracer middleware puts a request-scoped logger in it; downstream `log.Ctx(ctx)` uses it.
- **`go generate` after editing a DAO interface** — otherwise the mock is stale and tests compile but lie.
