#!/bin/sh
set -e

echo "=== 8os Frontend Startup ==="

# Apply database migrations using psql (more reliable than prisma CLI in standalone)
if [ -n "$DATABASE_URL" ] && [ -f "/app/prisma/migrations/0_init/migration.sql" ]; then
  echo "Applying database schema..."
  # Strip the "Loaded Prisma config" prefix line if present, then apply SQL
  grep -v "^Loaded Prisma config" /app/prisma/migrations/0_init/migration.sql | \
    psql "$DATABASE_URL" --quiet --set ON_ERROR_STOP=off 2>&1 | grep -v "already exists" | head -20 || true
  echo "Schema ready."
else
  echo "Skipping migrations."
fi

echo "Starting Next.js on port ${PORT:-3000}..."
exec node server.js
