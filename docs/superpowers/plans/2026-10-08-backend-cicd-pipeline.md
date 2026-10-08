# Backend CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a secure GitHub Actions CI/CD pipeline that tests, verifies, securely generates `.env`, deploys to the Contabo server (`ammarco`), retains the last 10 backups, and executes automated 3-try rollbacks on health check failure.

**Architecture:** GitHub Actions runs isolated tests against an ephemeral PostgreSQL service container, validates secrets into verified `.env` artifacts without shell expansion, transmits releases over SSH, and triggers a server-side deployment engine. The server engine snapshots the DB and code before running migrations, reloads PM2 gracefully, and automatically rolls back DB + code if health checks fail.

**Tech Stack:** GitHub Actions, Node.js (`node:test`, `wrangler`, `prisma`), PostgreSQL (`pg_dump`), PM2, Bash, OpenSSH (`ed25519`), GitHub CLI (`gh`).

**Spec:** [`docs/superpowers/specs/2026-10-08-backend-cicd-pipeline-design.md`](file:///home/justin/Documents/coding/moviesHunder/docs/superpowers/specs/2026-10-08-backend-cicd-pipeline-design.md)

## Global Constraints
- Target server: `SSH_HOST` port `SSH_PORT`, user `deployer`, ed25519 key.
- Production isolation: Never restart, touch, or alter non-moviehunter PM2 apps or databases.
- Zero sudo password: `deployer` must never require interactive sudo passwords in the pipeline.
- Backup limit: Exactly the newest 10 backups must be kept in `/srv/ismail_data/movie_hunder/backups/`.
- Concurrency: Deployments must be serialized via `group: moviehunter-deploy, cancel-in-progress: false`.

## Review Focus
1. Password corruption: Variables containing `$` (e.g. `[PASSWORD]`) or quotes must remain literal and never be expanded.
2. Failed migration rollback: If health check fails after migration, database schema/data must restore cleanly from the pre-migration snapshot.
3. Backup directory sorting: Directories named `release_YYYYMMDD_HHMMSS_<sha>` must be sorted by name, not filesystem mtime.
4. Ephemeral DB isolation: CI test suite must run against GitHub Actions PostgreSQL service, never touching the production server.
5. PM2 non-root execution: PM2 restart must only affect `moviehunter-api` and `moviehunter-relay`.

---

### Task 1: Server Hardening & Zero-Sudo Setup

**Files:**
- Modify server: `/etc/sudoers.d/deployer-pm2`
- Modify server: User groups for `deployer`
- Modify server: Ownership of `/srv/ismail_data/movie_hunder`

**Interfaces:**
- Consumes: Existing root access via `sudo -S` with sudo password.
- Produces: Passwordless execution of PM2 commands and docker pg_dump for user `deployer`.

- [ ] **Step 1: Apply server configuration**
  Run over SSH as root:
  - `chown -R deployer:deployer /srv/ismail_data/movie_hunder`
  - `usermod -aG docker deployer`
  - Install `/etc/sudoers.d/deployer-pm2` with `deployer ALL=(root) NOPASSWD: /usr/bin/pm2 restart moviehunter-api moviehunter-relay --update-env, /usr/bin/pm2 reload moviehunter-api moviehunter-relay --update-env, /usr/bin/pm2 status`
  - `chmod 440 /etc/sudoers.d/deployer-pm2`

- [ ] **Step 2: Verify zero-sudo access from client**
  Run: `ssh -i ~/.ssh/deploy_key -p SSH_PORT deployer@SSH_HOST "sudo -n /usr/bin/pm2 status && docker exec moviehunter-postgres pg_isready"`
  Expected: Both succeed with exit code 0 and zero password prompt.

---

### Task 2: Sync GitHub Secrets using `gh`

**Files:**
- Create: `scripts/sync-github-secrets.mjs`

**Interfaces:**
- Consumes: Server `/srv/ismail_data/movie_hunder/server/.env`, client SSH ed25519 private key.
- Produces: GitHub Action secrets (`SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, `BACKEND_ENV_FILE`).

- [ ] **Step 1: Write secret sync script `scripts/sync-github-secrets.mjs`**
  Fetch production `.env` from server and register all 5 secrets via `gh secret set`.

- [ ] **Step 2: Run script to register secrets**
  Run: `node scripts/sync-github-secrets.mjs`
  Expected: All 5 secrets created successfully.

- [ ] **Step 3: Verify secrets registered in GitHub**
  Run: `gh secret list`
  Expected: Lists `BACKEND_ENV_FILE`, `SSH_HOST`, `SSH_KEY`, `SSH_PORT`, `SSH_USER`.

---

### Task 3: Safe .env Generator with Concrete Format Validation

**Files:**
- Create: `server/scripts/generate-env.mjs`
- Create: `server/test/generate-env.test.js`

**Interfaces:**
- Consumes: `process.env.RAW_ENV_FILE`.
- Produces: Validated `.env` and `.dev.vars` files.

- [ ] **Step 1: Write failing test in `server/test/generate-env.test.js`**
  Test validation logic:
  - Validates `DATABASE_URL` format.
  - Validates `AUTH_JWT_SECRET` min-length.
  - Validates preservation of special characters (e.g. `[PASSWORD]`, quotes).
  - Rejects truncated or empty files.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test server/test/generate-env.test.js`
  Expected: FAIL with "generate-env.mjs not found".

- [ ] **Step 3: Implement `server/scripts/generate-env.mjs`**
  Implement format validation and write both `.env` and `.dev.vars`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test server/test/generate-env.test.js`
  Expected: PASS.

---

### Task 4: Server-Side Deployment & Rollback Engine

**Files:**
- Create: `server/scripts/deploy-release.sh`

**Interfaces:**
- Consumes: Incoming `release.tar.gz` and validated `.env` in `/srv/ismail_data/movie_hunder/transfer/`.
- Produces: Deployed release, snapshot in `backups/`, or automated rollback.

- [ ] **Step 1: Write `server/scripts/deploy-release.sh`**
  Implement:
  1. Capture DB snapshot via `docker exec moviehunter-postgres pg_dump -U postgres Test_movies | gzip > ...`.
  2. Backup current code to `backups/release_$(date +%Y%m%d_%H%M%S)_${GIT_SHA}`.
  3. Prune `backups/` keeping only newest 10 (sorted by directory name).
  4. Unpack new release, run `npm ci --production=false`, `npx prisma generate`, `npx prisma migrate deploy`.
  5. Reload PM2: `sudo /usr/bin/pm2 reload moviehunter-api moviehunter-relay --update-env || sudo /usr/bin/pm2 restart moviehunter-api moviehunter-relay --update-env`.
  6. Health check: 3 attempts with 5s sleep.
  7. Rollback: If all 3 fail, restore code from backup, restore DB from `pg_dump`, restart PM2, exit 1.

- [ ] **Step 2: Test deployment script syntax and dry run**
  Run: `bash -n server/scripts/deploy-release.sh`
  Expected: Syntax OK.

---

### Task 5: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/deploy-backend.yml`

**Interfaces:**
- Consumes: GitHub Secrets, code on `main`.
- Produces: Automated build, test with ephemeral postgres, transfer, and deploy.

- [ ] **Step 1: Write `.github/workflows/deploy-backend.yml`**
  Include:
  - `concurrency: { group: moviehunter-deploy, cancel-in-progress: false }`
  - `test` job with `services: postgres:16-alpine`.
  - `deploy` job using `generate-env.mjs`, packaging `release.tar.gz`, SSH deployment via ed25519 key.

- [ ] **Step 2: Validate YAML syntax**
  Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-backend.yml'))"`
  Expected: Valid YAML.

---

### Task 6: Commit, Push & End-to-End Verification

- [ ] **Step 1: Commit and push changes to `main`**
  Run: `git add . && git commit -m "feat(ci): add backend deployment pipeline with automated rollback and 10-backup retention" && git push origin main`

- [ ] **Step 2: Monitor GitHub Actions run**
  Run: `gh run list --limit 1` and `gh run watch`
  Expected: Workflow runs, passes test suite, deploys to server, passes health checks.

- [ ] **Step 3: Verify server state post-deploy**
  Run: `ssh -p SSH_PORT deployer@SSH_HOST "sudo -n /usr/bin/pm2 status && ls -la /srv/ismail_data/movie_hunder/backups"`
  Expected: `moviehunter-api` and `moviehunter-relay` online; newest backup created; exactly <= 10 backups stored.

- [ ] **Step 4: Verify live HTTPS health**
  Run: `curl -I https://api.offstream.co/api`
  Expected: HTTP/2 200.
