# Netflix-Style Profiles & Plan Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full-stack Netflix-style profile management with plan-tier screen/profile limits, extra profile add-on slots, per-profile watch progress isolation, and custom brand styling (Offstream / Movies Hunder purple palette).

**Architecture:** Node API (play-relay) handles profile CRUD, slot entitlement checks, and scoped watch progress queries backed by PostgreSQL (Prisma). Cloudflare Worker proxies `/api/profiles` to the Node service. The Next.js frontend manages active profile selection, navbar switching, and rich modal management using CSS modules styled with brand tokens (`--primary: #3d0081`, `--accent: #5a00a2`, `--secondary: #bd84db`).

**Tech Stack:** Next.js 14, React 18, Prisma ORM, PostgreSQL, Node.js HTTP router, Vanilla CSS Modules.

**Spec:** [docs/superpowers/specs/2026-10-03-netflix-style-profiles-design.md](file:///home/justin/Documents/coding/moviesHunder/docs/superpowers/specs/2026-10-03-netflix-style-profiles-design.md)

## Global Constraints
- Brand Styling: Use Movies Hunder / Offstream theme variables (`--primary: #3d0081`, `--accent: #5a00a2`, `--secondary: #bd84db`, `--bg: #0c0c0e`, `--panel: #1a1a1f`). Do NOT use generic red.
- Clean Auth: All profile and sync routes require valid Bearer JWT authenticated via `requireUser(request)`.
- Non-breaking fallback: Existing watch progress without `profileId` must still load smoothly if a profile is not yet assigned.
- Safe Deletion: The primary profile cannot be deleted if it is the only profile.

## Review Focus
1. **Plan limit edge case**: User on Standard (4 profiles limit) attempts to create a 5th profile without purchasing an extra slot -> Backend must reject with 403 and `canPurchaseExtra: true`.
2. **Concurrent profile watch progress collision**: Two different profiles on the same account watch the exact same movie -> Progress keys must not overwrite or conflict with each other.
3. **Kids profile safety constraint**: When switching to a profile with `isKids: true`, the content filter must strictly block adult and safe-search restricted queries.
4. **Primary profile deletion protection**: If a user attempts to delete their only profile or the primary profile, the system must block the deletion and return a friendly error.
5. **Session persistence across tab reload**: Active profile must persist in `localStorage` under `mh.active_profile` and restore seamlessly without flashing dummy content.

---

### Task 1: Database Schema & Relations

**Files:**
- Modify: `server/prisma/schema.prisma`
- Test: `server/test/schema.test.js`

**Interfaces:**
- Produces: Updated Prisma Client with `Account.extraProfilesPurchased`, `Profile.isPrimary`, `Profile.createdAt`, `Profile.updatedAt`, and `WatchProgress.profileId`.

- [x] **Step 1: Write verification test for Prisma schema definitions**
Create `server/test/schema.test.js` to assert that `Profile`, `Account`, and `WatchProgress` fields match the specification.

- [x] **Step 2: Run test to verify it fails**
Run: `node --test server/test/schema.test.js`
Expected: FAIL (missing fields on models)

- [x] **Step 3: Update `server/prisma/schema.prisma`**
- Add `extraProfilesPurchased Int @default(0) @map("extra_profiles_purchased")` to `Account`.
- Add `isPrimary Boolean @default(false) @map("is_primary")`, `createdAt DateTime @default(now()) @map("created_at")`, `updatedAt DateTime @updatedAt @map("updated_at")`, and `watchProgress WatchProgress[]` to `Profile`.
- Add `profileId String? @map("profile_id")` and `profile Profile? @relation(fields: [profileId], references: [id], onDelete: Cascade)` to `WatchProgress`.
- Update `WatchProgress` index/uniqueness to support per-profile tracking.

- [x] **Step 4: Generate Prisma Client & verify test**
Run: `npx prisma generate --schema=server/prisma/schema.prisma && node --test server/test/schema.test.js`
Expected: PASS

- [x] **Step 5: Commit**
```bash
git add server/prisma/schema.prisma server/test/schema.test.js
git commit -m "feat(db): update profile, account, and watch progress schema for profile isolation"
```

---

### Task 2: Backend Profiles Management Engine & API Routes

**Files:**
- Create: `server/src/profiles.js`
- Modify: `server/src/nodeApi.js`
- Modify: `server/src/nodeProxy.js`
- Test: `server/test/profiles.test.js`

**Interfaces:**
- Consumes: `requireUser` from `server/src/auth.js`, `getPrisma` from `server/src/db.js`.
- Produces:
  - `handleGetProfiles(request)` -> `{ ok, profiles, limits, activeProfileId }`
  - `handleCreateProfile(request)` -> `{ ok, profile, limits }`
  - `handleUpdateProfile(request, profileId)` -> `{ ok, profile }`
  - `handleDeleteProfile(request, profileId)` -> `{ ok }`
  - `handleBuyExtraSlot(request)` -> `{ ok, limits }`

- [x] **Step 1: Write the failing tests for profile CRUD and plan limits**
Create `server/test/profiles.test.js` to test:
- Auto-seeding a default profile if user has none.
- Enforcing plan tier limits (e.g. 2 for STANDARD_ADS, 4 for STANDARD, 5 for PREMIUM).
- Purchasing extra profile slots.
- Modifying and deleting non-primary profiles.

- [x] **Step 2: Run test to verify it fails**
Run: `node --test server/test/profiles.test.js`
Expected: FAIL (handler not implemented)

- [x] **Step 3: Implement `server/src/profiles.js`**
- Implement `getAccountLimits(userId)`: reads user's `Account`, computes screen concurrency and allowed profile limits based on tier + `extraProfilesPurchased`.
- Implement `handleGetProfiles(request)`: fetches profiles, auto-seeds default profile if empty, returns profiles + limits.
- Implement `handleCreateProfile(request)`: validates name, checks `currentCount < totalAllowedProfiles`, creates profile.
- Implement `handleUpdateProfile(request, profileId)`: updates name, avatarUrl, isKids.
- Implement `handleDeleteProfile(request, profileId)`: guards against deleting only profile, deletes profile.
- Implement `handleBuyExtraSlot(request)`: increments `extraProfilesPurchased` on Account.

- [x] **Step 4: Mount routes in `server/src/nodeApi.js` and proxy in `server/src/nodeProxy.js`**
- Add `/api/profiles` matchers in `server/src/nodeProxy.js`: `p.startsWith("/api/profiles")`.
- Add route dispatching in `server/src/nodeApi.js` for GET, POST, PUT, DELETE under `/api/profiles`.

- [x] **Step 5: Run tests and verify they pass**
Run: `node --test server/test/profiles.test.js`
Expected: PASS

- [x] **Step 6: Commit**
```bash
git add server/src/profiles.js server/src/nodeApi.js server/src/nodeProxy.js server/test/profiles.test.js
git commit -m "feat(api): implement profile CRUD endpoints and plan entitlement checks"
```

---

### Task 3: Backend Watch Progress Isolation per Profile

**Files:**
- Modify: `server/src/sync.js`
- Test: `server/test/sync-profiles.test.js`

**Interfaces:**
- Consumes: `X-Profile-Id` header or `profileId` parameter in `/api/sync/watch-progress`.
- Produces: Scoped watch progress queries and updates where records belong to a specific profile.

- [x] **Step 1: Write test for profile-isolated watch progress**
Create `server/test/sync-profiles.test.js`:
- Saving progress under Profile A does not show in Profile B's GET request.
- Deleting watch progress in Profile A leaves Profile B intact.

- [x] **Step 2: Run test to verify it fails**
Run: `node --test server/test/sync-profiles.test.js`
Expected: FAIL

- [x] **Step 3: Update `server/src/sync.js`**
- Extract `profileId` from `request.headers.get("x-profile-id")` or query param in `handleGetWatchProgress`, `handlePutWatchProgress`, and `handleDeleteWatchProgress`.
- Filter `watchProgress.findMany` by `{ userId, profileId }` (falling back gracefully to `{ userId }` if `profileId` is omitted).
- Upsert `watchProgress` with `profileId`.

- [x] **Step 4: Run tests and verify they pass**
Run: `node --test server/test/sync-profiles.test.js`
Expected: PASS

- [x] **Step 5: Commit**
```bash
git add server/src/sync.js server/test/sync-profiles.test.js
git commit -m "feat(sync): isolate watch progress per profile"
```

---

### Task 4: Frontend Profile Client Library & Active Profile State

**Files:**
- Create: `web/lib/profiles.js`
- Modify: `web/lib/sync.js`
- Test: `web/test/profiles.test.js`

**Interfaces:**
- Produces:
  - `fetchProfiles()`: fetches profiles & plan limits from `/api/profiles`.
  - `createProfile(data)`: creates profile.
  - `updateProfile(id, data)`: updates profile.
  - `deleteProfile(id)`: deletes profile.
  - `buyExtraSlot()`: buys extra profile slot.
  - `getActiveProfile()`: returns stored active profile from `localStorage` (`mh.active_profile`).
  - `setActiveProfile(profile)`: sets active profile, dispatches `mh:profile_changed`.

- [x] **Step 1: Write tests for `web/lib/profiles.js` and scoped cache keys**
Create `web/test/profiles.test.js` to verify active profile getter/setter, storage event dispatching, and cache partitioning.

- [x] **Step 2: Run test to verify it fails**
Run: `node --test web/test/profiles.test.js`
Expected: FAIL

- [x] **Step 3: Implement `web/lib/profiles.js`**
- Implement API client calls using `authFetch` from `web/lib/auth.js`.
- Provide default avatars palette (using DiceBear seed & brand colorways `#3d0081`, `#5a00a2`, `#bd84db`, `#1a1a1f`, `#f5c518`).
- Implement `getActiveProfile()` and `setActiveProfile(profile)`.

- [x] **Step 4: Update `web/lib/sync.js`**
- Modify cache key generator to use `${CACHE_PREFIX}${userId}.${profileId || "default"}`.
- Attach `X-Profile-Id: activeProfile?.id` to `syncPut` and `syncGet` headers.

- [x] **Step 5: Run tests and verify they pass**
Run: `node --test web/test/profiles.test.js`
Expected: PASS

- [x] **Step 6: Commit**
```bash
git add web/lib/profiles.js web/lib/sync.js web/test/profiles.test.js
git commit -m "feat(web): add profile API client, active profile store, and scoped cache"
```

---

### Task 5: "Who's watching?" Profile Page & Modals (Brand-Styled)

**Files:**
- Modify: `web/app/profiles/page.js`
- Modify: `web/app/profiles/profiles.module.css`

**Interfaces:**
- Consumes: `web/lib/profiles.js` (`fetchProfiles`, `createProfile`, `updateProfile`, `deleteProfile`, `setActiveProfile`, `buyExtraSlot`).
- Produces: Complete, interactive Netflix-style "Who's watching?" page styled in brand purple/dark-slate aesthetic.

- [x] **Step 1: Build the Profile Management Modals & Cards**
- "Add Profile" modal:
  - Name input with character counter.
  - Avatar selector carousel with curated brand avatars + randomizer seed button.
  - "Kids Profile" toggle switch with description.
  - Plan limit badge (e.g. `Profiles 2 of 4`).
  - "Upgrade / Buy Extra Slot" button if limit reached.
- "Manage Profiles" mode:
  - Toggle button ("Manage Profiles" / "Done").
  - Hover / edit badge on profile cards.
  - Clicking opens "Edit Profile" modal (rename, avatar change, kids toggle, and "Delete Profile" button with confirmation).

- [x] **Step 2: Apply brand styling in `web/app/profiles/profiles.module.css`**
- Use `--primary` (#3d0081), `--accent` (#5a00a2), `--secondary` (#bd84db), `--panel` (#1a1a1f), `--bg` (#0c0c0e).
- Replace any hardcoded `#e50914` red accents with glowing brand purple borders (`--accent-border`, `--accent`).
- Add smooth scale transitions, glassmorphic modal overlay, and responsive grid layout.

- [x] **Step 3: Connect real data & active profile selection in `web/app/profiles/page.js`**
- Load profiles via `fetchProfiles()`.
- On profile select, call `setActiveProfile(profile)` and navigate to `/`.
- If URL has `?manage=true`, automatically initialize in management mode.

- [x] **Step 4: Verify page build and rendering**
Run: `npm --prefix web run build`
Expected: PASS without compile errors.

- [x] **Step 5: Commit**
```bash
git add web/app/profiles/page.js web/app/profiles/profiles.module.css
git commit -m "feat(web): implement real 'Who's watching?' page with brand styling and CRUD modals"
```

---

### Task 6: Header Active Profile Avatar & 1-Click Switcher Dropdown

**Files:**
- Modify: `web/components/SiteHeader.js`
- Modify: `web/components/SiteHeader.module.css`

**Interfaces:**
- Consumes: `getActiveProfile()`, `setActiveProfile()`, `fetchProfiles()` from `web/lib/profiles.js`.
- Produces: Header avatar button with interactive dropdown showing active profile, other profiles for quick-switch, "Manage Profiles", and "Account".

- [x] **Step 1: Update `web/components/SiteHeader.js`**
- Read active profile on mount and subscribe to `mh:profile_changed` events.
- Render active profile avatar in place of generic user icon when signed in.
- Implement click dropdown menu:
  - Current profile badge with "Active" indicator.
  - List of other account profiles: clicking one switches active profile immediately and re-syncs.
  - "Add Profile" link (`/profiles?add=true`).
  - "Manage Profiles" link (`/profiles?manage=true`).
  - "Account Settings" link (`/settings`).
  - "Sign Out" button.

- [x] **Step 2: Style dropdown in `web/components/SiteHeader.module.css`**
- Glassmorphic dark purple panel (`background: rgba(18, 18, 24, 0.95)`, `border: 1px solid var(--line)`).
- Profile rows with smooth hover states and glowing avatar rings.

- [x] **Step 3: Verify build**
Run: `npm --prefix web run build`
Expected: PASS without compile errors.

- [x] **Step 4: Commit**
```bash
git add web/components/SiteHeader.js web/components/SiteHeader.module.css
git commit -m "feat(web): add header active profile avatar with 1-click switcher dropdown"
```

---

### Task 7: End-to-End Verification & Integration Test

**Files:**
- Create: `test/e2e-profiles-flow.js`

**Interfaces:**
- Verifies full flow: User signup -> auto-seeded profile -> create secondary profile -> limit check -> switch profile -> scoped watch progress -> delete profile.

- [x] **Step 1: Write integration verification script `test/e2e-profiles-flow.js`**
Test the complete API and client flow against the play-relay server.

- [x] **Step 2: Run end-to-end integration test**
Run: `node test/e2e-profiles-flow.js`
Expected: All 6 stages PASS.

- [x] **Step 3: Commit**
```bash
git add test/e2e-profiles-flow.js
git commit -m "test: add end-to-end integration test for profile lifecycle and watch isolation"
```
