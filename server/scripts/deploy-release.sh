#!/bin/bash
set -euo pipefail

# Fail loud if DEPLOY_PATH is not set — prevents dangerous rm -rf on unset paths
: "${DEPLOY_PATH:?DEPLOY_PATH must be set}"

BACKUP_BASE="$DEPLOY_PATH/backups"
SERVER_DIR="$DEPLOY_PATH/server"
TRANSFER_DIR="$DEPLOY_PATH/transfer"
GIT_SHA="${GIT_SHA:-$(date +%s)}"
TS=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE/release_${TS}_${GIT_SHA}"

echo "========================================="
echo " Starting Backend Deployment"
echo " Deploy Path: $DEPLOY_PATH"
echo " Commit SHA:  $GIT_SHA"
echo " Timestamp:   $TS"
echo "========================================="

mkdir -p "$BACKUP_DIR/code" "$BACKUP_BASE" "$TRANSFER_DIR"

# 1. Snapshot database before running any migrations
echo "[1/7] Snapshotting pre-migration database..."
if docker ps --format '{{.Names}}' | grep -q "^moviehunter-postgres$"; then
  docker exec moviehunter-postgres pg_dump -U postgres Test_movies | gzip > "$BACKUP_DIR/pre_migration_db.sql.gz"
  echo "Database snapshot saved: $BACKUP_DIR/pre_migration_db.sql.gz"
else
  echo "WARNING: moviehunter-postgres container not found, skipping db snapshot"
fi

# 2. Snapshot current working code and env
echo "[2/7] Backing up current code and .env..."
if [ -d "$SERVER_DIR" ]; then
  rsync -a --exclude 'node_modules' --exclude '.wrangler' "$SERVER_DIR/" "$BACKUP_DIR/code/"
  echo "Code snapshot saved to: $BACKUP_DIR/code"
fi

# 3. Prune old backups (Keep strictly the newest 10 backups sorted lexicographically)
echo "[3/7] Pruning backups (retention: 10)..."
mapfile -t old_backups < <(find "$BACKUP_BASE" -mindepth 1 -maxdepth 1 -type d -name "release_*" | sort -r | tail -n +11)
if [ ${#old_backups[@]} -gt 0 ]; then
  for old in "${old_backups[@]}"; do
    echo "Pruning older backup: $old"
    rm -rf "$old"
  done
else
  echo "No backups need pruning (currently <= 10)."
fi

# Function to execute rollback
rollback() {
  echo "========================================="
  echo " [ROLLBACK] Deployment failed! Rolling back..."
  echo "========================================="

  if [ -d "$BACKUP_DIR/code" ]; then
    echo "[ROLLBACK] Restoring code and env from $BACKUP_DIR/code..."
    rsync -a "$BACKUP_DIR/code/" "$SERVER_DIR/"
  fi

  if [ -f "$BACKUP_DIR/pre_migration_db.sql.gz" ]; then
    echo "[ROLLBACK] Restoring database schema and data..."
    gunzip -c "$BACKUP_DIR/pre_migration_db.sql.gz" | docker exec -i moviehunter-postgres psql -U postgres -d Test_movies || true
  else
    echo "[ROLLBACK] No database snapshot to restore"
  fi

  echo "[ROLLBACK] Regenerating Prisma and restarting PM2..."
  cd "$SERVER_DIR"
  npx prisma generate || true
  sudo /usr/bin/pm2 restart moviehunter-api moviehunter-relay --update-env || true

  echo "========================================="
  echo " [ROLLBACK] Rollback completed. System restored."
  echo "========================================="
  exit 1
}

# 4. Unpack new release and apply validated .env
echo "[4/7] Unpacking release and placing environment..."
if [ -f "$TRANSFER_DIR/release.tar.gz" ]; then
  tar -xzf "$TRANSFER_DIR/release.tar.gz" -C "$SERVER_DIR"
else
  echo "ERROR: $TRANSFER_DIR/release.tar.gz not found!"
  rollback
fi

if [ -f "$TRANSFER_DIR/.env" ]; then
  cp "$TRANSFER_DIR/.env" "$SERVER_DIR/.env"
  cp "$TRANSFER_DIR/.dev.vars" "$SERVER_DIR/.dev.vars"
else
  echo "ERROR: $TRANSFER_DIR/.env not found!"
  rollback
fi

# 5. Install dependencies and run migrations
echo "[5/7] Installing dependencies & running database migrations..."
cd "$SERVER_DIR"
if ! npm ci --production=false; then
  echo "ERROR: npm ci failed"
  rollback
fi

if ! npx prisma generate; then
  echo "ERROR: prisma generate failed"
  rollback
fi

if ! npx prisma migrate deploy; then
  echo "ERROR: prisma migrate deploy failed"
  rollback
fi

# 6. Restart PM2 processes gracefully
echo "[6/7] Reloading PM2 processes..."
if ! (sudo /usr/bin/pm2 reload moviehunter-api moviehunter-relay --update-env || sudo /usr/bin/pm2 restart moviehunter-api moviehunter-relay --update-env); then
  echo "ERROR: PM2 restart failed"
  rollback
fi

# 7. Health Check (3 retries, 5s delay)
echo "[7/7] Running post-deploy health checks (3 attempts)..."
health_passed=false

for attempt in 1 2 3; do
  echo "Health check attempt $attempt/3..."
  sleep 5

  # Check local Worker port 8787
  code_api=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:8787/api || echo "000")
  # Check local Relay port 8788
  code_relay=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:8788/play_replay/ || echo "000")
  # Check public Cloudflare Edge
  code_edge=$(curl -s -o /dev/null -w "%{http_code}" -m 8 https://api.offstream.co/api || echo "000")

  echo "  - Local API (8787):    HTTP $code_api"
  echo "  - Local Relay (8788):  HTTP $code_relay"
  echo "  - Public Edge HTTPS:   HTTP $code_edge"

  if [ "$code_api" = "200" ] && [ "$code_relay" = "200" ] && [ "$code_edge" = "200" ]; then
    health_passed=true
    break
  fi
done

if [ "$health_passed" = true ]; then
  echo "========================================="
  echo " Deployment SUCCESSFUL! Health check passed."
  echo " Release: release_${TS}_${GIT_SHA}"
  echo "========================================="
  # Clean up transfer files
  rm -f "$TRANSFER_DIR/release.tar.gz" "$TRANSFER_DIR/.env" "$TRANSFER_DIR/.dev.vars"
  exit 0
else
  echo "ERROR: Health check failed on all 3 attempts!"
  rollback
fi
