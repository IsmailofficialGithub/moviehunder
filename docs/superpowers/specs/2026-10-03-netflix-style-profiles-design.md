# Specification: Netflix-Style Profiles, Plan Limits & Per-Profile Watch Isolation

**Date**: 2026-10-03  
**Status**: Draft  
**Scope**: Backend API & Database Schema, Plan Entitlements, Per-Profile Watch Progress Isolation, and Frontend Profile Experience.

---

## 1. Problem Statement & Goals

Currently, the `/profiles` page in the web client renders hardcoded dummy profiles ("Justin", "Guest", "Kids") and mock alert buttons for adding and managing profiles. There is no backend persistence for profiles, no link to user accounts or plan limits, and watch history is globally shared across the entire user account.

### Goals
1. **Real Profile Management (CRUD)**:
   - Provide persistent profiles stored in PostgreSQL via Prisma.
   - Support adding, editing (name, avatar, kids mode), and deleting profiles.
   - Provide a curated avatar library + dynamic avatar generator (DiceBear).
2. **Plan-Based Screen & Profile Limits**:
   - Enforce profile creation limits according to the user's plan tier:
     - **Basic / Standard with Ads (1 screen)**: 2 profiles included.
     - **Standard (2 screens)**: 4 profiles included.
     - **Premium (4 screens)**: 5 profiles included.
   - Allow account owners to add/purchase extra profile slots when the package limit is reached.
3. **Per-Profile Watch History & Content Isolation**:
   - Isolate `WatchProgress` ("Continue Watching") per active profile.
   - Automatic child-friendly safe content filtering when an `isKids` profile is active.
4. **Seamless Netflix-Style UX**:
   - "Who's watching?" selection screen upon login (`/profiles`).
   - Quick-switch profile menu in the navigation bar header (`SiteHeader.js`).
   - Dedicated "Manage Profiles" mode with visual edit badges.

---

## 2. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                       Web Frontend                          │
│                                                             │
│   /profiles (Who's watching?)    SiteHeader Profile Switcher │
│       │                                │                    │
│       └──────────────┬─────────────────┘                    │
│                      ▼                                      │
│             web/lib/profiles.js                             │
│       (Active profile state, localStorage, API client)      │
│                      │                                      │
│                      ▼                                      │
│             web/lib/sync.js                                 │
│     (Watch progress scoped to activeProfileId)              │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼ HTTP Requests (Bearer JWT + X-Profile-Id)
┌─────────────────────────────────────────────────────────────┐
│                Cloudflare Worker & Node API                 │
│                                                             │
│   Worker Proxy (nodeProxy.js) ──► Node Router (nodeApi.js)  │
│                                           │                 │
│                 ┌─────────────────────────┴─────────┐       │
│                 ▼                                   ▼       │
│       server/src/profiles.js               server/src/sync.js
│     (CRUD, limits, extra slots)         (Scoped watch progress)
└─────────────────┼───────────────────────────────────┼───────┘
                  │                                   │
                  ▼                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Prisma)                      │
│                                                             │
│    User ──► Account (tier, extraProfilesPurchased)          │
│      │                                                      │
│      ├──► Profile (name, avatarUrl, isKids, isPrimary)      │
│      │      │                                               │
│      └──────┴──► WatchProgress (progressKey, profileId)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema Changes (`server/prisma/schema.prisma`)

### 3.1 `Account`
Add profile slot tracking to the existing `Account` model:
```prisma
model Account {
  id                     String    @id @default(cuid())
  ownerUserId            String    @unique @map("owner_user_id")
  tier                   PlanTier  @default(STANDARD)
  extraProfilesPurchased Int       @default(0) @map("extra_profiles_purchased")
  
  owner                  User      @relation(fields: [ownerUserId], references: [id])
  members                AccountMember[]
  households             Household[]

  @@map("accounts")
}
```

### 3.2 `Profile`
Enhance the existing `Profile` model with `isPrimary` flag and relation to `WatchProgress`:
```prisma
model Profile {
  id            String          @id @default(cuid())
  userId        String          @map("user_id")
  name          String
  avatarUrl     String?         @map("avatar_url")
  isKids        Boolean         @default(false)
  isPrimary     Boolean         @default(false) @map("is_primary")
  createdAt     DateTime        @default(now()) @map("created_at")
  updatedAt     DateTime        @updatedAt @map("updated_at")
  
  user          User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  watchProgress WatchProgress[]
  
  @@index([userId])
  @@map("profiles")
}
```

### 3.3 `WatchProgress`
Associate progress items with `profileId`:
```prisma
model WatchProgress {
  id          String   @id @default(cuid())
  userId      String   @map("user_id")
  profileId   String?  @map("profile_id")
  progressKey String   @map("progress_key")
  position    Float    @default(0)
  duration    Float    @default(0)
  title       String?
  subjectId   String?  @map("subject_id")
  detailPath  String?  @map("detail_path")
  se          String?
  ep          String?
  poster      String?
  kind        String?
  completed   Boolean  @default(false)
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdAt   DateTime @default(now()) @map("created_at")

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  profile Profile? @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([userId, progressKey, profileId])
  @@index([userId, profileId, updatedAt(sort: Desc)])
  @@map("watch_progress")
}
```

---

## 4. Plan Limits & Entitlement Logic

### Plan Tier Configuration:
| Tier | Screens (Concurrency) | Included Profiles | Max Extra Add-on Profiles |
| :--- | :---: | :---: | :---: |
| `STANDARD_ADS` (Basic with Ads) | 1 | 2 | 1 |
| `STANDARD` (Standard HD) | 2 | 4 | 2 |
| `PREMIUM` (Premium 4K) | 4 | 5 | 4 |

### Calculation Rules:
1. `allowedProfiles = tierIncludedProfiles + account.extraProfilesPurchased`
2. When creating a profile:
   - If `currentProfileCount >= allowedProfiles`, reject with `403 PROFILE_LIMIT_REACHED` and include limit metadata.
3. When purchasing/adding an extra profile slot:
   - Check if `extraProfilesPurchased < maxExtraProfilesForTier`.
   - Increment `extraProfilesPurchased` on the user's `Account`.

---

## 5. API Endpoints

All endpoints require `Authorization: Bearer <access_token>`.

### 5.1 `GET /api/profiles`
- Returns all profiles for the authenticated user and plan limit information.
- **Auto-seed**: If user has 0 profiles (new user or legacy account), automatically creates a default primary profile using `user.displayName || user.email.split("@")[0]` and a default avatar.
- **Response**:
  ```json
  {
    "ok": true,
    "profiles": [
      {
        "id": "cuid_1",
        "name": "Justin",
        "avatarUrl": "https://api.dicebear.com/7.x/avataaars/svg?seed=Justin&backgroundColor=e50914",
        "isKids": false,
        "isPrimary": true
      }
    ],
    "limits": {
      "tier": "STANDARD",
      "screens": 2,
      "includedProfiles": 4,
      "extraProfilesPurchased": 0,
      "totalAllowedProfiles": 4,
      "currentCount": 1,
      "canAddMore": true,
      "canPurchaseExtra": true
    }
  }
  ```

### 5.2 `POST /api/profiles`
- **Request Body**:
  ```json
  {
    "name": "Sarah",
    "avatarUrl": "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah&backgroundColor=38bdf8",
    "isKids": false
  }
  ```
- **Validation**:
  - Name is required (1-30 chars).
  - Profile count must be `< totalAllowedProfiles`.
- **Response**: `201 Created` with created profile object and updated `limits`.

### 5.3 `PUT /api/profiles/:id`
- **Request Body**: `{ "name"?: string, "avatarUrl"?: string, "isKids"?: boolean }`
- **Validation**: User must own the profile.
- **Response**: `200 OK` with updated profile.

### 5.4 `DELETE /api/profiles/:id`
- **Validation**:
  - User must own the profile.
  - Cannot delete if it is the only remaining profile or the primary profile when other profiles exist (must transfer or edit instead).
- **Behavior**: Deletes profile and all cascading `WatchProgress` records.
- **Response**: `200 OK` with `{ "ok": true }`.

### 5.5 `POST /api/profiles/extra-slot`
- **Request Body**: `{ "action": "purchase" }`
- **Behavior**: Increments `extraProfilesPurchased` on user's `Account` (creating Account if not existing).
- **Response**: `200 OK` with updated `limits`.

### 5.6 Updates to `GET /api/sync/watch-progress` & `PUT /api/sync/watch-progress`
- Reads `X-Profile-Id` header (or `?profileId=` query param).
- Filters/stores `watch_progress` rows scoped by `profileId`.

---

## 6. Frontend Implementation Details

### 6.1 Profile Client Library (`web/lib/profiles.js`)
- Methods: `fetchProfiles()`, `createProfile()`, `updateProfile()`, `deleteProfile()`, `buyExtraSlot()`.
- Active Profile State Management:
  - Stored in `localStorage.getItem("mh.active_profile")`.
  - Dispatches custom browser event `mh:profile_changed` when active profile changes so the navbar and continue watching rows update instantly.

### 6.2 "Who's watching?" Page (`web/app/profiles/page.js`)
- **Normal Mode**:
  - Grid of profile avatar cards with names and "KIDS" badge.
  - "Add Profile" card with slot count badge (e.g. `2/4`).
  - Clicking a profile sets active profile and navigates to `/`.
  - "Manage Profiles" button toggles management mode.
- **Manage Profiles Mode**:
  - Darkened profile cards with pencil/edit icons overlay.
  - "Done" button returns to normal mode.
  - Clicking any card opens the **Edit Profile Modal** (rename, pick new avatar, toggle Kids, or click "Delete Profile" button).
- **Add Profile Modal**:
  - Name input.
  - Avatar preview & selection grid (curated Netflix-style colorways + DiceBear seed generator).
  - "Kid's Profile?" checkbox/toggle.
  - Slot counter: If limit reached, shows "Plan limit reached" banner with an "Add Extra Profile Slot (+1)" button.

### 6.3 Site Header Quick Switcher (`web/components/SiteHeader.js`)
- Replaces generic account icon with the **Active Profile Avatar**:
  - Round avatar with profile color badge.
  - Clicking reveals a dropdown menu:
    - List of other profiles (click to switch immediately without full page reload).
    - "Manage Profiles" link (`/profiles?manage=true`).
    - "Account & Plan" link (`/settings`).
    - "Sign Out" button.

### 6.4 Per-Profile Watch Progress Isolation (`web/lib/sync.js`)
- LocalStorage cache key updated: `mh.watch.cache.v2.<userId>.<profileId>`.
- Network calls send `X-Profile-Id: <active_profile_id>`.
- Switching profiles flushes and reloads the Continue Watching row for the new active profile.

---

## 7. Testing & Verification Plan

1. **Backend Integration Tests**:
   - Test profile auto-seeding on fresh user.
   - Test CRUD operations (create, read, update, delete).
   - Test limit enforcement: verify 403 when exceeding plan allowance.
   - Test extra slot purchase increases limit and allows adding additional profile.
   - Test watch progress isolation: Profile A's progress is not returned when querying Profile B.
2. **Frontend UI Verification**:
   - Verify `/profiles` displays real profiles from API.
   - Verify creating a profile adds it to the grid.
   - Verify editing a profile name/avatar updates live.
   - Verify deleting a profile removes it.
   - Verify switching profiles updates the header avatar and switches watch progress.
