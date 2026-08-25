# Backend service image (Cloud Run). Built by CI's build-backend job
# (docker build -f backend/Dockerfile, context = repo root's backend/).

# Build stage
FROM golang:1.26 AS builder

WORKDIR /src

# Dependencies first, for layer caching
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# The deployed build target is a COMMITTED, PINNED value — not whatever the
# build image's toolchain defaults to (openspec cross-stack-determinism,
# "An unpinned GOAMD64 build target is out of compliance"). GOAMD64=v1 is the
# non-contracting level: v3+ emits fused multiply-add on amd64, which would
# silently turn production into a contracting target and fork its arithmetic
# from the golden fixtures and the JS mirror. Verified non-contracting via
# `go build -gcflags=-S` (zero FMADDD/FMSUBD; see check-fma-contraction.sh).
# Do not bump GOAMD64 without re-verifying and updating that check.
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOAMD64=v1

RUN go build -o /out/server .

# Production stage — static binary, minimal surface
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /out/server /server

# Cloud Run injects PORT; config.go defaults to 8080
EXPOSE 8080

ENTRYPOINT ["/server"]
