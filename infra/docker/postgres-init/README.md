# PostgreSQL Test Database for Flywheel

This directory contains SQL initialization scripts for the PostgreSQL test database used in Flywheel's CI/CD pipeline and local development.

## Overview

The PostgreSQL test database provides a realistic dataset for testing:
- **Import flows** from external data sources
- **Export flows** to external destinations
- **Schema introspection** and table discovery
- **Pagination** with large datasets
- **Complex queries** with joins and aggregations

## Database Schema

### Schemas

1. **`sales`** - E-commerce domain
   - `orders` - Customer orders (15 test records)
   - `products` - Product catalog (15 test records)
   - `order_items` - Order line items (35 test records)
   - Views: `order_summary`, `product_performance`

2. **`marketing`** - Marketing domain
   - `campaigns` - Marketing campaigns with JSONB data (6 test records)
   - `leads` - Sales leads with various statuses (20 test records)

3. **`analytics`** - Analytics domain
   - `page_views` - Website page views (1000 test records for pagination testing)
   - `events` - Custom events with JSONB payloads (10 test records)

### Key Features

- **Primary Keys**: All tables have auto-increment serial primary keys
- **Foreign Keys**: Proper relationships between orders, products, and order_items
- **Indexes**: Strategic indexes on commonly queried columns
- **Triggers**: Auto-updating `updated_at` timestamps
- **Data Types**: Comprehensive coverage (TEXT, INTEGER, DECIMAL, TIMESTAMP, JSONB, INET, etc.)
- **NULL Handling**: Mix of nullable and non-nullable columns for testing data quality
- **Views**: Pre-defined views for testing complex queries

## Test Data Highlights

### Sales Data
- 15 orders from Jan 15-29, 2024
- Various order statuses: `completed`, `pending`, `processing`, `shipped`, `cancelled`
- 15 products across categories: Electronics, Tools, Accessories
- 35 order items with quantity, pricing, and discounts

### Marketing Data
- 6 campaigns with different statuses and JSONB target audiences
- 20 leads with various sources: `website`, `referral`, `trade_show`, `paid_ad`, etc.
- Lead scores ranging from 35-95
- Campaign metrics stored as JSONB

### Analytics Data
- 1000 page views across 30 days (for pagination testing)
- Random distribution of browsers, devices, countries
- 10 custom events with JSONB payloads

## Connection Details

```bash
Host:     localhost
Port:     5432
Database: testdb
Username: testuser
Password: testpass
SSL Mode: disable
```

## Usage

### Local Development

Build and run locally:
```bash
# Build the image (from repo root)
docker build -f infra/docker/postgres-test.Dockerfile -t flywheel-postgres-test:latest .

# Run with docker-compose
cd backend
docker-compose up postgres

# Verify database is ready
docker exec flywheel-postgres pg_isready -U testuser -d testdb
```

### CI/CD

The image is automatically built and pushed to GCP Artifact Registry:
```bash
# Build all CI/CD images including postgres-test
cd infra/docker
./build-all-runners.sh
```

Image location:
```
us-central1-docker.pkg.dev/flywheel-etl-prod/flywheel-ci/postgres-test:latest
```

### Querying Test Data

```bash
# Connect to postgres container
docker exec -it flywheel-postgres psql -U testuser -d testdb

# List all schemas
\dn

# List tables in sales schema
\dt sales.*

# View sample orders
SELECT * FROM sales.orders LIMIT 5;

# View order summary
SELECT * FROM sales.order_summary LIMIT 5;

# Check page view count
SELECT COUNT(*) FROM analytics.page_views;
```

## E2E Testing

The postgres test database is designed for comprehensive e2e testing:

### Import Testing
```go
// Test importing from sales.orders table
importConfig := PostgresImportConfig{
    Schema:    "sales",
    TableName: "orders",
    Limit:     nil, // Import all records
}
```

### Schema Introspection Testing
```go
// List available schemas
GET /v1/connections/{orgId}/{connId}/postgres/schemas

// List tables in schema
GET /v1/connections/{orgId}/{connId}/postgres/tables?schema=sales

// Get table schema
POST /v1/connections/{orgId}/{connId}/postgres/schema
{
    "schema": "sales",
    "tableName": "orders"
}

// Preview table data
POST /v1/connections/{orgId}/{connId}/postgres/preview
{
    "schema": "sales",
    "tableName": "orders",
    "limit": 10
}
```

### Pagination Testing
Use `analytics.page_views` (1000 records) to test:
- Cursor-based pagination
- Chunked imports (ChunkSize = 5000)
- Large dataset handling

### Export Testing
```go
// Test export to postgres
exportConfig := PostgresExportConfig{
    Schema:    "public",
    TableName: "exported_data",
    WriteMode: "INSERT", // or "UPSERT", "TRUNCATE"
}
```

## Data Modifications

The initialization scripts are executed in alphabetical order:
1. `01-init-schemas.sql` - Creates schemas, tables, indexes, views
2. `02-seed-data.sql` - Inserts test data

To add more test data:
1. Create a new file: `03-custom-data.sql`
2. Add your INSERT statements
3. Rebuild the Docker image

## Troubleshooting

### Database not initializing
- Check logs: `docker logs flywheel-postgres`
- Ensure volume is clean: `rm -rf backend/postgres-data`
- Rebuild image: `docker build -f infra/docker/postgres-test.Dockerfile -t flywheel-postgres-test:latest .`

### Permission errors
- Scripts run as `postgres` user
- Tables are owned by `testuser`
- All permissions granted via `GRANT ALL PRIVILEGES`

### Health check failing
```bash
# Check if postgres is running
docker ps | grep postgres

# Check health status
docker inspect flywheel-postgres | grep -A 10 Health

# Manual health check
docker exec flywheel-postgres pg_isready -U testuser -d testdb
```

## Architecture Notes

### Why Custom Image?

1. **Performance**: Pre-seeded data eliminates setup time in CI/CD
2. **Consistency**: Same test data across all environments
3. **Version Control**: Test data changes tracked in git
4. **Simplicity**: Single `docker-compose up` gets full test environment

### Volume Persistence

Data is persisted to `./postgres-data` volume:
- Survives container restarts
- Can be deleted to reset to initial state
- Not committed to git (in .gitignore)

### Init Script Pattern

PostgreSQL's `docker-entrypoint-initdb.d` pattern:
- Scripts run ONLY on first initialization
- Won't run if data volume exists
- To re-run: delete volume and restart container

## Related Documentation

- [Backend CLAUDE.md](../../../backend/CLAUDE.md) - Backend architecture
- [E2E Testing Guide](../../../backend/e2e/CLAUDE.md) - E2E test patterns
- [build-all-runners.sh](../build-all-runners.sh) - CI/CD image builder
