# PostgreSQL Test Database - Quick Start Guide

This guide walks through building and using the custom PostgreSQL test database for Flywheel.

## Prerequisites

- Docker installed and running
- GCP access for pushing to Artifact Registry (for CI/CD use)
- From repository root directory

## Option 1: Local Development (Fastest)

### Build the Image Locally

```bash
# From repository root
docker build -f infra/docker/postgres-test.Dockerfile -t flywheel-postgres-test:latest .
```

### Start PostgreSQL with docker-compose

```bash
# Navigate to backend directory
cd backend

# Start postgres (and other services if needed)
docker-compose up -d postgres

# Verify postgres is running and healthy
docker ps | grep postgres
docker logs flywheel-postgres

# Check health
docker exec flywheel-postgres pg_isready -U testuser -d testdb
```

Expected output:
```
/var/lib/postgresql/data:5432 - accepting connections
```

### Connect and Explore

```bash
# Connect to postgres CLI
docker exec -it flywheel-postgres psql -U testuser -d testdb

# Once connected, try these commands:
\dn                          # List all schemas
\dt sales.*                  # List tables in sales schema
SELECT * FROM sales.orders LIMIT 5;
SELECT * FROM sales.order_summary LIMIT 5;
\q                           # Quit
```

### Test with Backend API

```bash
# Start backend server (requires Firebase emulators running)
cd backend
go run .

# In another terminal, test postgres endpoints
# (Note: Replace {orgId} and {connId} with actual values from your test)
curl http://localhost:20201/v1/connections/{orgId}/{connId}/postgres/schemas
```

---

## Option 2: Build and Push to GCP (For CI/CD)

### Build All CI/CD Images

This builds the postgres-test image along with other CI/CD images and pushes to GCP Artifact Registry:

```bash
# From repository root
cd infra/docker
./build-all-runners.sh
```

This will:
1. Authenticate to GCP Artifact Registry
2. Build 6 images including postgres-test **and** test-runner (with PostgreSQL client)
3. Push all images to `us-central1-docker.pkg.dev/flywheel-etl-prod/flywheel-ci/`

**Important**: After updating `test-runner.Dockerfile` to include `postgresql-client`, you **must** rebuild and push the image:
```bash
cd infra/docker
./build-all-runners.sh
```

### GitLab CI Configuration

The `.gitlab-ci.yml` is already configured to use Postgres as a sidecar service:

```yaml
test-backend:
  image: ${TEST_RUNNER_IMAGE}  # Includes pg_isready for health checks
  services:
    - name: us-central1-docker.pkg.dev/flywheel-etl-prod/flywheel-ci/postgres-test:latest
      alias: postgres  # Accessible at postgres:5432
  variables:
    POSTGRES_HOST: "postgres"
    POSTGRES_PORT: "5432"
    POSTGRES_DB: "testdb"
    POSTGRES_USER: "testuser"
    POSTGRES_PASSWORD: "testpass"
```

The CI pipeline will:
1. Start Postgres service container (with pre-seeded data)
2. Wait for Postgres to be ready (using `pg_isready`)
3. Start Firebase emulators
4. Run all backend tests (including Postgres e2e tests)

---

## Verifying Test Data

### Check Record Counts

```bash
docker exec -it flywheel-postgres psql -U testuser -d testdb -c "
SELECT
  'orders' as table_name, COUNT(*) as count FROM sales.orders
  UNION ALL
  SELECT 'products', COUNT(*) FROM sales.products
  UNION ALL
  SELECT 'order_items', COUNT(*) FROM sales.order_items
  UNION ALL
  SELECT 'campaigns', COUNT(*) FROM marketing.campaigns
  UNION ALL
  SELECT 'leads', COUNT(*) FROM marketing.leads
  UNION ALL
  SELECT 'page_views', COUNT(*) FROM analytics.page_views
  UNION ALL
  SELECT 'events', COUNT(*) FROM analytics.events;
"
```

Expected output:
```
 table_name  | count
-------------+-------
 orders      |    15
 products    |    15
 order_items |    35
 campaigns   |     6
 leads       |    20
 page_views  |  1000
 events      |    10
```

### Inspect Sample Data

```bash
# View sample orders with details
docker exec -it flywheel-postgres psql -U testuser -d testdb -c "
SELECT
  order_number,
  customer_name,
  order_date,
  total_amount,
  status
FROM sales.orders
ORDER BY order_date
LIMIT 5;
"
```

---

## Troubleshooting

### Issue: Port 20250 already in use

**Problem**: Local PostgreSQL is already running
```
Error: bind: address already in use
```

**Solutions**:
```bash
# Option 1: Stop local PostgreSQL
brew services stop postgresql

# Option 2: Change docker-compose.yml port
# Change ports: "5433:5432" instead of "5432:5432"
```

### Issue: Database not initializing

**Problem**: Old data volume exists
```bash
# Remove old data and restart
cd backend
docker-compose down
rm -rf postgres-data
docker-compose up -d postgres
```

### Issue: Permission denied errors

**Problem**: Volume permissions
```bash
# Give Docker permission to create volumes
# On Mac: System Preferences → Privacy & Security → Files and Folders → Docker
# Or run with sudo (not recommended)
```

### Issue: Image not found

**Problem**: Image not built
```bash
# Build the image first
docker build -f infra/docker/postgres-test.Dockerfile -t flywheel-postgres-test:latest .

# Check if image exists
docker images | grep postgres-test
```

### Issue: Health check failing

**Problem**: Database still initializing
```bash
# Check logs for initialization progress
docker logs flywheel-postgres

# Wait for message:
# "PostgreSQL Test Database Initialized"
# "database system is ready to accept connections"

# Manual health check
docker exec flywheel-postgres pg_isready -U testuser -d testdb
```

---

## Development Workflow

### Making Changes to Test Data

1. **Edit SQL files**:
   ```bash
   # Edit initialization scripts
   vim infra/docker/postgres-init/01-init-schemas.sql
   vim infra/docker/postgres-init/02-seed-data.sql
   ```

2. **Rebuild image**:
   ```bash
   docker build -f infra/docker/postgres-test.Dockerfile -t flywheel-postgres-test:latest .
   ```

3. **Reset database**:
   ```bash
   cd backend
   docker-compose down
   rm -rf postgres-data
   docker-compose up -d postgres
   ```

4. **Verify changes**:
   ```bash
   docker logs flywheel-postgres
   docker exec -it flywheel-postgres psql -U testuser -d testdb
   ```

### Testing E2E Flows

```bash
# Start all required services
cd backend
docker-compose up -d

# Start Firebase emulators (in separate terminal)
firebase emulators:start --only firestore,auth,pubsub --config firebase.test.json

# Run backend server (in another terminal)
cd backend
go run .

# Run e2e tests (in another terminal)
cd backend
FIRESTORE_EMULATOR_HOST=localhost:20242 \
PUBSUB_EMULATOR_HOST=localhost:20244 \
go test -v -run TestIndependentFlows/PostgresImport
```

---

## Docker Commands Reference

```bash
# Start postgres
docker-compose up -d postgres

# Stop postgres
docker-compose stop postgres

# Remove postgres (keeps data)
docker-compose rm -f postgres

# View logs
docker logs flywheel-postgres
docker logs -f flywheel-postgres  # Follow logs

# Execute commands
docker exec flywheel-postgres psql -U testuser -d testdb -c "SELECT version();"

# Interactive shell
docker exec -it flywheel-postgres bash
docker exec -it flywheel-postgres psql -U testuser -d testdb

# Check container status
docker ps | grep postgres
docker inspect flywheel-postgres

# Remove everything (including data)
docker-compose down
rm -rf postgres-data
```

---

## Connection Details

Use these credentials for connecting to the test database:

| Parameter | Value |
|-----------|-------|
| Host | `localhost` (or `flywheel-postgres` from other containers) |
| Port | `5432` |
| Database | `testdb` |
| Username | `testuser` |
| Password | `testpass` |
| SSL Mode | `disable` |

### Connection String

```
postgresql://testuser:testpass@localhost:20250/testdb?sslmode=disable
```

### psql Command

```bash
psql postgresql://testuser:testpass@localhost:20250/testdb
```

---

## Performance Tips

### Fast Rebuild

If you only changed data (not schema):
```bash
# Quick rebuild - reuses cached layers
docker build --cache-from flywheel-postgres-test:latest \
  -f infra/docker/postgres-test.Dockerfile \
  -t flywheel-postgres-test:latest .
```

### Keep Running

Leave postgres running between tests:
```bash
# Don't stop postgres between test runs
docker-compose up -d postgres
# Run tests multiple times
# ...
# Only stop when done for the day
docker-compose stop postgres
```

### Clean Data Volume

Fresh start without rebuilding image:
```bash
docker-compose stop postgres
rm -rf postgres-data
docker-compose up -d postgres
# Waits for init scripts to run (~5 seconds)
```

---

## Next Steps

1. ✅ **Built image** - You have a working postgres test database
2. 📝 **Add subscriptions** - Create `backend/postgres/subscriptions.go`
3. 🔌 **Register routes** - Update `backend/router.go`
4. 🧪 **Write e2e tests** - Create `backend/e2e/flow_postgres_import_test.go`
5. 🚀 **Run tests** - Test complete postgres connector flow

See the main implementation plan in the repository for detailed next steps.

---

## Resources

- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [docker-compose.yml](../../backend/docker-compose.yml)
- [Test Data README](postgres-init/README.md)
- [Build Script](build-all-runners.sh)
