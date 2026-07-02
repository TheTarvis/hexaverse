FROM postgres:16-alpine

# Metadata
LABEL maintainer="Flywheel Team"
LABEL description="PostgreSQL test database with pre-seeded data for Flywheel CI/CD"
LABEL version="1.0"

# Copy initialization scripts
# Scripts in docker-entrypoint-initdb.d are executed in alphabetical order
COPY infra/docker/postgres-init/ /docker-entrypoint-initdb.d/

# Fix permissions so postgres user can read the init scripts
RUN chmod -R 755 /docker-entrypoint-initdb.d/ && \
    chmod 644 /docker-entrypoint-initdb.d/*.sql

# Set default environment variables
# These can be overridden in docker-compose.yml or at runtime
ENV POSTGRES_USER=testuser \
    POSTGRES_PASSWORD=testpass \
    POSTGRES_DB=testdb

# Expose PostgreSQL port
EXPOSE 5432

# Health check to ensure database is ready
HEALTHCHECK --interval=5s --timeout=5s --retries=5 \
    CMD pg_isready -U testuser -d testdb || exit 1

# Use default postgres entrypoint
# This will automatically run scripts in /docker-entrypoint-initdb.d/
