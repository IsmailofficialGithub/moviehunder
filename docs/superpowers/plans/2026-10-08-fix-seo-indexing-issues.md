# SEO & Indexing Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all Google Search Console indexing issues for offstream.co: fix `robots.txt` blocking for `/login`, remove conflicting root canonical tags, exclude `/play` from indexing, enable search crawler discovery for catalog/movie pages, and prevent soft 404s.

**Architecture:** 
1. Allow crawling of auth pages in `robots.js` while explicitly serving `noindex` metadata on `/login` and `/signup` so Googlebot cleanly deindexes them without warnings.
2. Remove the catch-all homepage canonical from root `layout.js` so subpages do not falsely claim to be alternates of the homepage.
3. Exclude video playback query pages (`/play`) from indexation with `noindex`.
4. Allow public read-only access to catalog browsing (`/movies`, `/tv-series`, etc.) and movie detail pages (`/title/[slug]`) so Googlebot and guests can view movie metadata, while keeping playback strictly paywalled.
5. Return real HTTP 404 (`notFound()`) for non-existent title slugs instead of HTTP 200 soft 404s.

**Tech Stack:** Next.js 15+ (App Router), React, Node.js, ESLint.

**Spec:** Google Search Console Diagnostic Report (Conversation b2541f42-e32c-4582-bc0a-d5ea4d9f4a06).

## Global Constraints

- Do not break existing user authentication or playback subscription protection.
- Preserve all existing styling, design tokens, and components.
- Run `npm run lint` in `web/` after all changes to ensure zero ESLint errors.

## Review Focus

1. `/login` and `/signup` must render `<meta name="robots" content="noindex, nofollow">` in their SSR HTML.
2. Root `layout.js` must not emit `<link rel="canonical" href="https://offstream.co">` for subpages that do not declare canonicals.
3. `/title/[slug]` must return full HTML metadata and synopsis for search engines without executing client-side redirect to `/`.
4. `/play` must have `robots: { index: false, follow: false }` to prevent query string pollution in search results.
5. Invalid slugs on `/title/[slug]` must invoke Next.js `notFound()`.

---

### Task 1: Fix `robots.js` & Add `noindex` to Auth & Account Pages

**Files:**
- Modify: `web/app/robots.js`
- Create: `web/app/login/layout.js`
- Create: `web/app/signup/layout.js`
- Create: `web/app/settings/layout.js`
- Create: `web/app/profiles/layout.js`
- Create: `web/app/history/layout.js`

**Interfaces:**
- `robots()` in `web/app/robots.js` returns rules object.
- Each `layout.js` exports `metadata = { robots: { index: false, follow: false } }`.

- [ ] **Step 1: Update `web/app/robots.js`**
  Remove `"/login"` and `"/signup"` from `disallow: [...]`. Keep private endpoints like `/api/`, `/settings/`, `/profiles/`, `/history/`, `/auth/` disallowed. Disallow `/play` so crawlers do not waste budget on video streams.
- [ ] **Step 2: Add metadata layouts for `/login` and `/signup`**
  Since `login/page.js` and `signup/page.js` are `"use client"` components, create `layout.js` in each directory exporting `metadata` with `robots: { index: false, follow: false }` and descriptive titles.
- [ ] **Step 3: Add metadata layouts for `/settings`, `/profiles`, and `/history`**
  Create or update `layout.js` for each of these user-specific routes ensuring `robots: { index: false, follow: false }`.
- [ ] **Step 4: Verify robots.txt generation**
  Run test/lint to ensure valid syntax.

---

### Task 2: Fix Root Canonical Tag & Page-Specific Canonicals

**Files:**
- Modify: `web/app/layout.js:50-54`
- Modify: `web/app/play/page.js`
- Create: `web/app/support/layout.js`
- Modify: `web/app/support/page.js`
- Modify: `web/app/terms/page.js`

**Interfaces:**
- `layout.js` metadata does not set default canonical to `siteUrl`.
- `web/app/support/layout.js` sets canonical to `https://offstream.co/support`.
- `web/app/play/page.js` sets `robots: { index: false, follow: false }`.

- [ ] **Step 1: Remove `alternates.canonical` from root `web/app/layout.js`**
  Root `layout.js` should specify `metadataBase: new URL(siteUrl)` but not a static `canonical: siteUrl`.
- [ ] **Step 2: Add `noindex` to `web/app/play/page.js`**
  Update metadata in `web/app/play/page.js` to include `robots: { index: false, follow: false }`.
- [ ] **Step 3: Create `web/app/support/layout.js` & fix placeholder support email**
  Export metadata in `web/app/support/layout.js` with `alternates: { canonical: "https://offstream.co/support" }` and title "Support · Offstream". In `support/page.js` and `terms/page.js`, replace placeholder `support@moviehunter.example.com` with `support@offstream.co`.

---

### Task 3: Enable Public Catalog & Title Metadata Discovery (Fix 633 titles)

**Files:**
- Modify: `web/app/title/[slug]/page.js`
- Modify: `web/components/CategoryView.js`

**Interfaces:**
- `TitlePage` renders `DetailClient` without `<SubscriptionGate>` blocking public view.
- `CategoryView` renders catalog rows and grids without wrapping them in `<SubscriptionGate>`.
- Video playback remains gated at `/play` and when clicking play in `DetailClient`.

- [ ] **Step 1: Remove `<SubscriptionGate>` wrapper from `CategoryView.js`**
  Allow guest visitors and search engines to browse movies in `/movies`, `/tv-series`, `/animation`, `/ranking`, `/songs`.
- [ ] **Step 2: Remove `<SubscriptionGate>` wrapper from `TitlePage`**
  Allow search crawlers to see the movie title, synopsis, poster, cast, and schema.org data.
- [ ] **Step 3: Handle title not found with `notFound()` in `TitlePage`**
  When `getDetail(slug)` fails or returns null/empty, call `notFound()` from `next/navigation` to return an official HTTP 404 rather than an empty 200 soft 404.

---

### Task 4: Verify and Lint

**Files:**
- Run: `npm run lint` in `web/`

- [ ] **Step 1: Run `npm run lint` in `web/`**
  Verify that all files pass lint without errors.
- [ ] **Step 2: Build verification**
  Run `npm run build` in `web/` to ensure all routes and metadata compile cleanly.
