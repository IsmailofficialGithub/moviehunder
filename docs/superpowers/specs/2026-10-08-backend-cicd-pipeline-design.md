# Architecture Design: Backend CI/CD Pipeline with Automated Rollback (V2)

## 1. Overview & Objective
Automate deployment of the MovieHunter backend to the production server (`ammarco`) via GitHub Actions with enterprise-grade resilience, zero-downtime, and automatic recovery.

### Key Refinements (V2 Improvements)
1. **Zero Sudo Password in Pipeline**:
   - Filesystem ownership of `/srv/ismail_data/movie_hunder` belongs to `deployer:deployer`.
   - `/etc/sudoers.d/deployer-pm2` restricts passwordless sudo strictly to `pm2 restart/reload moviehunter-api moviehunter-relay --update-env`.
   - `SSH_SUDO_PASS` is eliminated from GitHub Action secrets.
2. **True Database Rollback Story**:
   - Before applying migrations, an automated snapshot is generated via `docker exec moviehunter-postgres pg_dump -U postgres Test_movies | gzip > .../pre_migration_db.sql.gz`.
   - If health check fails after 3 tries, rollback restores both the previous code/env **and** restores the pre-migration database snapshot.
3. **Robust Backup Sorting & Pruning**:
   - Directories named `release_YYYYMMDD_HHMMSS_<sha>` are sorted lexicographically by directory name (not fragile filesystem mtimes).
   - Only the latest 10 releases are preserved; older ones are pruned safely.
4. **Concrete Secret Format Validation**:
   - A dedicated Node.js script validates keys structurally (regex, minimum lengths, URL schemes) to catch truncation or bad secrets prior to packaging.
5. **Concurrency Control in GitHub Actions**:
   - `concurrency: { group: moviehunter-deploy, cancel-in-progress: false }` queues consecutive deployments safely.
6. **Ephemeral PostgreSQL in CI Tests**:
   - CI runs an isolated `postgres:16-alpine` service container, ensuring tests run against a real, live database without touching production.

---

## 2. Architecture & Workflow

```mermaid
graph TD
    A[Git Push to main in server/**] --> B[GitHub Actions Runner]
    B --> C[CI Job: Ephemeral Postgres 16 Container]
    C --> D[Run Prisma Generate & Migration on Test DB]
    D --> E[Run Node Test Runner: node --test test/*.test.js]
    E --> F[Generate & Validate .env via format checks]
    F --> G[Package Release Artifact]
    G --> H[SSH to Contabo Server as deployer user]
    H --> I[Snapshot Pre-Migration DB via pg_dump]
    I --> J[Snapshot Current Code to backups/release_YYYYMMDD_HHMMSS_sha]
    J --> K[Prune Backups keeping last 10 sorted by name]
    K --> L[Deploy New Code & Run prisma migrate deploy]
    L --> M[PM2 reload/restart --update-env moviehunter only]
    M --> N{Health Check 3 Attempts}
    N -- Pass --> O[Deployment Succeeded]
    N -- 3 Fails --> P[Automated Rollback: Code, .env, DB Snapshot]
    P --> Q[PM2 reload previous & Exit with Code 1]
```

---

## 3. Component Details

### 3.1. Secret Validation & Safe Synthesis (`server/scripts/generate-env.mjs`)
- Reads raw environment variables passed directly into Node.js (bypassing bash string interpolation).
- Synthesizes identical `.env` and `.dev.vars` files.
- Enforces strict validation rules:
  - `DATABASE_URL`: matches `^postgres(ql)?:\/\/.+`
  - `AUTH_JWT_SECRET`: length >= 32
  - `GOOGLE_REDIRECT_URI`: valid URL matching `^https:\/\/api\.offstream\.co\/api\/auth\/google\/callback`
  - `APP_PUBLIC_URL`: valid URL `^https:\/\/offstream\.co`
  - `CORS_ALLOWED_ORIGIN_SUFFIXES`: contains `offstream.co`
  - Rejects empty values, unescaped newlines, or malformed lines.

### 3.2. Server Pre-requisites & Security Whitelist
- Run once on server:
  ```bash
  # 1. Directory ownership
  chown -R deployer:deployer /srv/ismail_data/movie_hunder
  usermod -aG docker deployer

  # 2. Scoped passwordless PM2
  cat << "EOF" > /etc/sudoers.d/deployer-pm2
  deployer ALL=(root) NOPASSWD: /usr/bin/pm2 restart moviehunter-api moviehunter-relay --update-env, /usr/bin/pm2 reload moviehunter-api moviehunter-relay --update-env, /usr/bin/pm2 status
  EOF
  chmod 440 /etc/sudoers.d/deployer-pm2
  ```

### 3.3. Server Deployment Engine (`server/scripts/deploy-release.sh`)
Execution flow:
1. **Directory Setup**:
   - Target release directory: `/srv/ismail_data/movie_hunder/backups/release_$(date +%Y%m%d_%H%M%S)_${GIT_SHA}`.
2. **Database Snapshot**:
   - `docker exec moviehunter-postgres pg_dump -U postgres Test_movies | gzip > "$BACKUP_DIR/pre_migration_db.sql.gz"`.
3. **Code Backup**:
   - Copies existing `server/` code and `.env` into `$BACKUP_DIR/code/`.
4. **Pruning (Strict 10 Releases)**:
   - Lists directories in `/srv/ismail_data/movie_hunder/backups/release_*` sorted in reverse order.
   - Safely removes any beyond the newest 10 releases.
5. **Code & Migration Application**:
   - Unpacks incoming release.
   - Runs `npm ci --production=false` (or fast cache).
   - Runs `npm run prisma:generate`.
   - Runs `npx prisma migrate deploy`.
6. **Graceful Process Restart**:
   - Runs `sudo /usr/bin/pm2 reload moviehunter-api moviehunter-relay --update-env || sudo /usr/bin/pm2 restart moviehunter-api moviehunter-relay --update-env`.
7. **Health Check (3 Retries)**:
   - Polls `http://127.0.0.1:8787/api`, `http://127.0.0.1:8788/play_replay/`, and `https://api.offstream.co/api`.
   - 3 retries, 5s delay.
8. **Rollback Action**:
   - If health checks fail:
     - Restores code from `$BACKUP_DIR/code/`.
     - Restores DB from `$BACKUP_DIR/pre_migration_db.sql.gz`:
       `gunzip -c "$BACKUP_DIR/pre_migration_db.sql.gz" | docker exec -i moviehunter-postgres psql -U postgres -d Test_movies`.
     - Reloads PM2: `sudo /usr/bin/pm2 restart moviehunter-api moviehunter-relay --update-env`.
     - Emits `[ROLLBACK COMPLETED]` and exits with code 1.

---

## 4. GitHub Actions Workflow (`.github/workflows/deploy-backend.yml`)

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths:
      - 'server/**'
      - '.github/workflows/deploy-backend.yml'
  workflow_dispatch:

concurrency:
  group: moviehunter-deploy
  cancel-in-progress: false

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: testpassword
          POSTGRES_DB: Test_movies
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: server/package-lock.json

      - name: Install dependencies & Prisma Generate
        working-directory: server
        env:
          DATABASE_URL: postgresql://postgres:testpassword@127.0.0.1:5432/Test_movies?schema=public
        run: |
          npm ci
          npx prisma generate
          npx prisma migrate deploy

      - name: Run Test Suite
        working-directory: server
        env:
          DATABASE_URL: postgresql://postgres:testpassword@127.0.0.1:5432/Test_movies?schema=public
        run: node --test test/*.test.js

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Generate & Validate .env Artifact
        working-directory: server
        env:
          RAW_ENV_FILE: ${{ secrets.BACKEND_ENV_FILE }}
        run: node scripts/generate-env.mjs

      - name: Package Release
        run: |
          tar -czf release.tar.gz -C server .

      - name: Transfer & Execute Deploy on Server
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SSH_HOST }}
          port: ${{ secrets.SSH_PORT }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            mkdir -p /srv/ismail_data/movie_hunder/transfer
            # deploy script handles unpacking, db backup, migration, pm2, and 3-try rollback
```

---

## 5. GitHub CLI (`gh`) Secrets Configuration

Secrets configured via `gh secret set`:
- `SSH_HOST`: `[SERVER_IP]`
- `SSH_PORT`: `[SERVER_PORT]`
- `SSH_USER`: `deployer`
- `SSH_PRIVATE_KEY`: ed25519 private key (passphrase-less)
- `BACKEND_ENV_FILE`: Server's verified production `.env`
*(Notice: `SSH_SUDO_PASS` is completely removed!)*
