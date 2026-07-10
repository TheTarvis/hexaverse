# Backend Makefile

.PHONY: help test test-unit test-integration test-all clean build run emulators emulators-bg ensure-emulators stop-emulators check-emulators postgres

help:
	@echo "Available targets:"
	@echo "  test            - Run local unit tests only (fast, no emulators needed)"
	@echo "  test-full       - Run full test suite (unit tests, then integration if unit pass)"
	@echo "  test-unit       - Run unit tests only (alias for test)"
	@echo "  test-integration - Run E2E integration tests only (requires emulators + postgres)"
	@echo "  emulators       - Start Firebase emulators"
	@echo "  emulators-bg    - Start Firebase emulators in background"
	@echo "  postgres        - Start PostgreSQL via docker-compose"
	@echo "  postgres-stop   - Stop PostgreSQL"
	@echo "  postgres-logs   - View PostgreSQL logs"
	@echo "  check-services  - Check if all required services are running"
	@echo "  build           - Build the backend service"
	@echo "  run             - Run the backend service locally"
	@echo "  clean           - Clean build artifacts"
	@echo "  generate        - Generate mocks and swagger docs"

# Test targets
test:
	@echo "Running local unit tests only (fast)..."
	@go test ./... -short -count=1

test-unit:
	@echo "Running unit tests..."
	@go test ./... -short -count=1

test-full:
	@echo "Running full test suite (unit + integration)..."
	@echo "Step 1: Running unit tests..."
	@go test ./... -short -count=1 || (echo "Unit tests failed. Skipping integration tests." && exit 1)
	@echo ""
	@echo "Unit tests passed! ✅"
	@echo ""
	@echo "Step 2: Checking required services..."
	@make check-services
	@echo ""
	@echo "Step 3: Running E2E integration tests..."
	FIRESTORE_EMULATOR_HOST=localhost:9100 \
	FIREBASE_AUTH_EMULATOR_HOST=localhost:10109 \
	PUBSUB_EMULATOR_HOST=localhost:9106 \
	go test ./e2e/... -tags=integration -v -run TestIndependentFlows -count=1
	@echo ""
	@echo "All tests passed! ✅"

test-integration: check-services
	@echo "Running E2E integration tests only..."
	FIRESTORE_EMULATOR_HOST=localhost:9100 \
	FIREBASE_AUTH_EMULATOR_HOST=localhost:10109 \
	PUBSUB_EMULATOR_HOST=localhost:9106 \
	go test ./e2e/... -tags=integration -v -run TestIndependentFlows -count=1

test-integration-verbose: check-services
	@echo "Running E2E integration tests with verbose output..."
	FIRESTORE_EMULATOR_HOST=localhost:9100 \
	FIREBASE_AUTH_EMULATOR_HOST=localhost:10109 \
	PUBSUB_EMULATOR_HOST=localhost:9106 \
	go test ./e2e/... -tags=integration -v -run TestIndependentFlows -count=1

test-all: test-full

# Emulator management
# firebase.test.json lives at the repo root, and --project hexaverse-emulator is
# required: without it the auth emulator namespaces users under the firebase
# CLI's active project alias and e2e auth setup fails.
emulators:
	@echo "Starting Firebase test emulators..."
	@echo "Press Ctrl+C to stop"
	cd .. && firebase emulators:start --only firestore,auth,pubsub --config firebase.test.json --project hexaverse-emulator

emulators-bg: ensure-emulators

ensure-emulators:
	@bash ../scripts/dev/ensure-test-emulators.sh

# Only stops the TEST emulator set (firebase.test.json — ports 9100/10109/9106).
# A dev emulator started with `npm run firebase:emulators` (default ports
# 8090/9109/…) is left alone: we match the CLI process by its --config arg,
# then reap any leftover child emulators still holding the test ports.
stop-emulators:
	@echo "Stopping test emulators (dev emulators untouched)..."
	@pkill -f "firebase.test.json" || true
	@for i in $$(seq 1 10); do \
		nc -z localhost 9100 2>/dev/null || break; \
		sleep 1; \
	done
	@for port in 9100 10109 9106; do \
		pids=$$(lsof -ti tcp:$$port 2>/dev/null || true); \
		if [ -n "$$pids" ]; then \
			echo "Force-killing leftover emulator process on :$$port"; \
			kill -9 $$pids 2>/dev/null || true; \
		fi; \
	done
	@echo "Test emulators stopped"

check-emulators:
	@echo "Checking if Firebase emulators are running..."
	@nc -z localhost 9100 || (echo "Firestore emulator not running on port 9100. Run 'make ensure-emulators' first" && exit 1)
	@nc -z localhost 10109 || (echo "Auth emulator not running on port 10109. Run 'make ensure-emulators' first" && exit 1)
	@echo "Emulators are running"

check-postgres:
	@echo "Checking if PostgreSQL is running..."
	@nc -z localhost 5432 || (echo "PostgreSQL not running on port 5432. Run 'docker-compose up -d postgres' first" && exit 1)
	@echo "PostgreSQL is running"

check-services: check-emulators check-postgres
	@echo "All required services are running ✅"

# Build and run
build:
	@echo "Building backend service..."
	go build -o bin/backend .

run:
	@echo "Running backend service..."
	go run .

# Galaxy seeding (#0001)
seed:
	@echo "Seeding the live galaxy (uses Firestore/emulator)..."
	go run ./cmd/seed

seed-start-area:
	@echo "Regenerating the frozen start-area static asset..."
	go run ./cmd/seed start-area

run-with-emulators:
	@echo "Running backend with emulators..."
	FIRESTORE_EMULATOR_HOST=localhost:9100 \
	FIREBASE_AUTH_EMULATOR_HOST=localhost:10109 \
	go run .

# Code generation
generate:
	@echo "Generating mocks..."
	go generate ./...
	@echo "Generating swagger docs..."
	swag init || echo "Swagger generation skipped (swag not installed)"

# Clean
clean:
	@echo "Cleaning build artifacts..."
	rm -rf bin/
	rm -f emulator.log
	go clean -testcache

# Development workflow
dev: emulators-bg
	@sleep 3
	@make run-with-emulators

dev-test: emulators-bg
	@sleep 3
	@make test-integration
	@make stop-emulators

# Quick test for CI/CD
ci-test:
	@echo "Running CI tests..."
	go test ./... -v -short -race -coverprofile=coverage.out
	go tool cover -html=coverage.out -o coverage.html

# Install dependencies
deps:
	@echo "Installing dependencies..."
	go mod download
	go mod tidy
	@echo "Installing tools..."
	go install github.com/golang/mock/mockgen@latest
	go install github.com/swaggo/swag/cmd/swag@latest
	npm install -g firebase-tools

# Database operations
db-seed:
	@echo "Seeding test data..."
	go run scripts/seed_test_data.go

db-clean:
	@echo "Cleaning test data..."
	go run scripts/clean_test_data.go

# PostgreSQL management
postgres:
	@echo "Starting PostgreSQL test database..."
	@docker-compose up -d postgres
	@echo "Waiting for PostgreSQL to be ready..."
	@sleep 3
	@docker exec flywheel-postgres pg_isready -U testuser -d testdb || (echo "PostgreSQL failed to start" && exit 1)
	@echo "PostgreSQL is ready ✅"

postgres-stop:
	@echo "Stopping PostgreSQL..."
	@docker-compose stop postgres

postgres-logs:
	@docker logs -f flywheel-postgres

postgres-reset:
	@echo "Resetting PostgreSQL (removing data volume)..."
	@docker-compose stop postgres
	@rm -rf postgres-data
	@make postgres