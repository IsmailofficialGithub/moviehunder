# OffStream & Movies Hunder Landing Page & Subscription Plan Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the root `/` page into a high-converting OffStream & Movies Hunder landing page that initiates onboarding via email, sends a Netflix-style magic-link account creation email with dynamic lowest plan pricing, routes users through a 3-step onboarding flow (`?accountCreated=success` ➔ Step 2 of 3 ➔ Step 3 of 3 with dynamic DB-backed plans: Mobile PKR 250, Basic PKR 450, Standard PKR 800, Premium PKR 1100), and unlocks the full catalog on `/` once the plan is purchased.

**Architecture:** Node API (play-relay) serves dynamic plans from PostgreSQL (cached in Redis), generates 15-minute magic links for account creation/verification, dispatches customized transactional emails via Nodemailer, and manages subscription activation. Next.js frontend implements the landing page hero email input, the 3-step plan onboarding funnel, simulated instant payment checkout, and client-side access gating for the `/` catalog.

**Tech Stack:** Next.js 15 (Turbopack), React 19, Vanilla CSS Modules, Prisma ORM, PostgreSQL, Redis cache, Nodemailer, Cloudflare Worker proxy, Node.js HTTP router.

**Spec:**
- Root `/` displays a Netflix-style landing page for guests asking for user email.
- Submitting email triggers an account creation / sign-in magic link email:
  - Text: *"Let's create your account / Hey there, We’re excited to have you! Tap the link below to create your account and start watching today’s hottest shows and movies. Plans start at Rs250/month... This link will expire in 15 minutes. No password needed..."*
  - Replaces Netflix branding with OffStream / Movies Hunder.
  - Price is dynamic from DB (`Plans start at Rs{minPrice}/month.`).
- Clicking `[Create Your Account]` logs the user in and redirects to `?accountCreated=success`.
- Step 2 of 3:
  - Header: *"Step 2 of 3 / Choose your plan"*
  - Bullets: *"No commitments, cancel anytime. / Everything on OffStream for one low price. / No ads and no extra fees. Ever."*
  - Action button: *"Next"*
- Step 3 of 3:
  - Header: *"Choose the plan that's right for you"*
  - Dynamic plans from DB & cached in Redis:
    - **Mobile**: PKR 250/mo, 480p, Fair quality, Mobile & tablet, 1 screen, 1 download device.
    - **Basic**: PKR 450/mo, 720p (HD), Good quality, TV/computer/phone/tablet, 1 screen, 1 download device.
    - **Standard (Most Popular)**: PKR 800/mo, 1080p (Full HD), Great quality, TV/computer/phone/tablet, 2 screens, 2 download devices.
    - **Premium**: PKR 1,100/mo, 4K (Ultra HD) + HDR, Best quality, Spatial audio included, TV/computer/phone/tablet, 4 screens, 4 download devices.
- User selects plan and completes simulated card checkout.
- Once paid, user's account is marked `ACTIVE`, unlocking the full movie catalog on `/`.

## Global Constraints
- Brand Styling: OffStream & Movies Hunder dark aesthetic (`--primary: #3d0081`, `--accent: #5a00a2`, `--secondary: #bd84db`, `--bg: #0c0c0e`, `--panel: #1a1a1f`).
- Plan Pricing: Stored in PostgreSQL `SubscriptionPlan` model with PKR currency and cached in Redis. Minimum price dynamically evaluated.
- Email Token Validity: Exactly 15 minutes.
- Auth Integrity: Preserve existing JWT authentication, Google OAuth, session refresh, and token mechanisms intact.
- Gating Rule: Catalog on `/` and video player are strictly gated behind active subscription (`hasActivePlan === true`).

## Review Focus
1. **Dynamic plan starting price**: If DB lowest plan price is updated, magic link email and landing page copy must dynamically reflect `Rs{minPrice}/month` without hardcoding.
2. **15-minute token expiration**: User clicking magic link after 15 minutes -> Must receive friendly expiration notice with a button to resend link.
3. **Magic link auto-login & redirect**: Clicking link signs user in, issues JWT session, and immediately navigates to `/signup/planform?accountCreated=success`.
4. **Step 2 to Step 3 state retention**: User advancing from Step 2 to Step 3 preserves their authenticated session and selected preferences.
5. **Instant catalog unlock**: After simulated payment completes, `hasActivePlan` turns `true` and user is seamlessly shown `/` with all movies and player unlocked.

---

### Task 1: Prisma Schema: `SubscriptionPlan` & `Account` Updates

**Files:**
- Modify: `server/prisma/schema.prisma`
- Test: `server/test/subscription-schema.test.js`

**Interfaces:**
- Produces:
  - `SubscriptionPlan` model (`id`, `name`, `price`, `currency`, `resolution`, `quality`, `screens`, `downloadDevices`, `spatialAudio`, `supportedDevices`, `isPopular`, `sortOrder`, `active`).
  - `Account.planId`, `Account.subscriptionStatus`, `Account.planStartedAt`, `Account.planExpiresAt`.

- [ ] **Step 1: Write failing verification test for Prisma schema**
Create `server/test/subscription-schema.test.js` checking that `SubscriptionPlan` and `Account.subscriptionStatus` exist.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test server/test/subscription-schema.test.js`
Expected: FAIL

- [ ] **Step 3: Update `server/prisma/schema.prisma`**
```prisma
enum SubscriptionStatus {
  INACTIVE
  ACTIVE
  CANCELLED
  PAST_DUE
}

model SubscriptionPlan {
  id               String    @id
  name             String
  price            Int
  currency         String    @default("PKR")
  resolution       String
  quality          String
  screens          Int       @default(1)
  downloadDevices  Int       @default(1) @map("download_devices")
  spatialAudio     Boolean   @default(false) @map("spatial_audio")
  supportedDevices String[]  @map("supported_devices")
  isPopular        Boolean   @default(false) @map("is_popular")
  sortOrder        Int       @default(0) @map("sort_order")
  active           Boolean   @default(true)
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  accounts         Account[]

  @@map("subscription_plans")
}

model Account {
  id                     String             @id @default(cuid())
  ownerUserId            String             @unique @map("owner_user_id")
  planId                 String?            @map("plan_id")
  tier                   PlanTier           @default(STANDARD)
  subscriptionStatus     SubscriptionStatus @default(INACTIVE) @map("subscription_status")
  planStartedAt          DateTime?          @map("plan_started_at")
  planExpiresAt          DateTime?          @map("plan_expires_at")
  extraProfilesPurchased Int                @default(0) @map("extra_profiles_purchased")

  plan                   SubscriptionPlan?  @relation(fields: [planId], references: [id])
  owner                  User               @relation(fields: [ownerUserId], references: [id])
  members                AccountMember[]
  households             Household[]

  @@map("accounts")
}
```

- [ ] **Step 4: Push Prisma schema & run test**
Run: `cd server && npx prisma db push && npx prisma generate`
Run: `node --test server/test/subscription-schema.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add server/prisma/schema.prisma server/test/subscription-schema.test.js
git commit -m "feat(db): add SubscriptionPlan model and Account subscription fields"
```

---

### Task 2: Seed & Cache Dynamic Subscription Plans

**Files:**
- Create: `server/src/plans.js`
- Test: `server/test/plans.test.js`

**Interfaces:**
- Produces:
  - `getPublicPlans(db)` -> `{ plans: SubscriptionPlan[], startingPrice: number, startingPriceText: string }`
  - `seedDefaultPlansIfEmpty(db)` -> Populates Mobile (250), Basic (450), Standard (800), Premium (1100).
  - Uses Redis caching with 1-hour TTL and memory fallback.

- [ ] **Step 1: Write failing test for plans retrieval and seeding**
Create `server/test/plans.test.js` testing:
1. `seedDefaultPlansIfEmpty()` seeds 4 tiers if database is empty.
2. `getPublicPlans()` returns sorted plans and calculates `startingPrice: 250`.
3. Cached responses return identical data.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test server/test/plans.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `server/src/plans.js`**
Write logic for:
- Seeding 4 plans:
  - `mobile`: Name: "Mobile", Price: 250, Resolution: "480p", Quality: "Fair", Screens: 1, Downloads: 1, Devices: ["Mobile phone", "tablet"].
  - `basic`: Name: "Basic", Price: 450, Resolution: "720p (HD)", Quality: "Good", Screens: 1, Downloads: 1, Devices: ["TV", "computer", "mobile phone", "tablet"].
  - `standard`: Name: "Standard", Price: 800, Resolution: "1080p (Full HD)", Quality: "Great", Screens: 2, Downloads: 2, Devices: ["TV", "computer", "mobile phone", "tablet"], `isPopular: true`.
  - `premium`: Name: "Premium", Price: 1100, Resolution: "4K (Ultra HD) + HDR", Quality: "Best", Spatial Audio: true, Screens: 4, Downloads: 4, Devices: ["TV", "computer", "mobile phone", "tablet"].
- Cache results in Redis key `offstream:plans:v1` with in-memory fallback.
- `startingPrice`: `Math.min(...plans.map(p => p.price))`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test server/test/plans.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add server/src/plans.js server/test/plans.test.js
git commit -m "feat(plans): add dynamic subscription plan seeding and Redis caching"
```

---

### Task 3: Magic Link Account Creation Email Flow

**Files:**
- Create: `server/src/emailTemplates.js`
- Modify: `server/src/mail.js`
- Modify: `server/src/auth.js`
- Modify: `server/src/nodeApi.js`
- Modify: `server/src/nodeProxy.js`
- Test: `server/test/magic-link-auth.test.js`

**Interfaces:**
- Produces:
  - `POST /api/auth/start-onboarding` with `{ email }` -> Creates user if new, generates 15-min token, dispatches OffStream formatted email.
  - `GET /api/auth/magic-login?token=...` -> Validates token within 15 mins, verifies email, issues JWT session, redirects to `https://offstream.co/signup/planform?accountCreated=success`.
  - `sendAccountCreationEmail({ to, creationUrl, startingPriceText })`.

- [ ] **Step 1: Write failing test for magic link email & token verification**
Create `server/test/magic-link-auth.test.js` testing:
1. Submitting email creates/finds user and returns `{ ok: true, message: "Check your email" }`.
2. Token expires after 15 minutes.
3. Accessing verification link redirects with 302 to `/signup/planform?accountCreated=success&access_token=...`.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test server/test/magic-link-auth.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `server/src/emailTemplates.js`**
Construct clean HTML matching user's exact specification:
- Header: *"Let's create your account"*
- Body: *"Hey there, We’re excited to have you! Tap the link below to create your account and start watching today’s hottest shows and movies. Plans start at Rs{minPrice}/month."*
- Button: `[Create Your Account]` pointing to `${appPublicUrl()}/api/auth/magic-login?token=${token}`.
- Highlights: *"This link will expire in 15 minutes. / No password needed / Cancel anytime / Unlimited entertainment"*.
- Footer: OffStream branding, Help Center, Terms of Use, Privacy.

- [ ] **Step 4: Implement `startOnboarding` and `handleMagicLogin` in `server/src/auth.js`**
- Set token `expiresAt` to `new Date(Date.now() + 15 * 60 * 1000)` (15 minutes).
- In `handleMagicLogin`, verify token, set `emailVerifiedAt: new Date()`, issue session tokens, and return 302 redirect to `${appPublicUrl()}/signup/planform?accountCreated=success&access_token=...&refresh_token=...`.

- [ ] **Step 5: Run tests and verify they pass**
Run: `node --test server/test/magic-link-auth.test.js`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add server/src/emailTemplates.js server/src/mail.js server/src/auth.js server/src/nodeApi.js server/src/nodeProxy.js server/test/magic-link-auth.test.js
git commit -m "feat(auth): implement 15-min magic link onboarding email flow"
```

---

### Task 4: Subscription Activation & Plans API

**Files:**
- Create: `server/src/subscription.js`
- Modify: `server/src/nodeApi.js`
- Modify: `server/src/nodeProxy.js`
- Test: `server/test/subscription.test.js`

**Interfaces:**
- Produces:
  - `GET /api/plans` -> Returns dynamic plans list and starting price.
  - `GET /api/subscription` -> Returns user's active plan status.
  - `POST /api/subscription/subscribe` with `{ planId, paymentMethod }` -> Activates plan for 30 days, sets `subscriptionStatus: "ACTIVE"`.

- [ ] **Step 1: Write failing test for plan purchase and subscription status**
Create `server/test/subscription.test.js` testing:
1. `GET /api/plans` returns Mobile, Basic, Standard, Premium.
2. Authenticated call to `POST /api/subscription/subscribe` with `{ planId: "standard" }` activates account and sets `subscriptionStatus: ACTIVE`.
3. `GET /api/subscription` confirms active status and expiration.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test server/test/subscription.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `server/src/subscription.js`**
- Query `SubscriptionPlan` by `planId`.
- Set `Account.planId = planId`, `Account.subscriptionStatus = "ACTIVE"`, `planStartedAt = new Date()`, `planExpiresAt = new Date(Date.now() + 30 * 86400000)`.
- Update `handleMe` in `auth.js` to return `hasActivePlan: account?.subscriptionStatus === "ACTIVE"`.

- [ ] **Step 4: Run tests and verify they pass**
Run: `node --test server/test/subscription.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add server/src/subscription.js server/src/nodeApi.js server/src/nodeProxy.js server/test/subscription.test.js
git commit -m "feat(api): implement dynamic plans and subscription activation"
```

---

### Task 5: OffStream & Movies Hunder Guest Landing Page

**Files:**
- Create: `web/components/landing/LandingPage.js`
- Create: `web/components/landing/LandingPage.module.css`
- Create: `web/components/landing/FaqAccordion.js`
- Create: `web/components/landing/FaqAccordion.module.css`
- Modify: `web/lib/api.js` (fetch `/api/plans` for dynamic starting price)

**Interfaces:**
- Consumes: `/api/auth/start-onboarding`, `/api/plans`.
- Produces: Guest landing view on `/` with hero email box and dynamic "Plans start at Rs250/month."

- [ ] **Step 1: Implement `LandingPage.js` with email capture**
- Top Header: OffStream & Movies Hunder logo + "Sign In" button (links to `/login`).
- Hero Section:
  - Headline: *"Unlimited movies, TV shows, and more. Watch anywhere. Cancel anytime."*
  - Dynamic price banner: *"Plans start at Rs{minPrice}/month."*
  - Input field for email + *"Get Started >"* button.
  - Submitting sends email via `POST /api/auth/start-onboarding` and shows a modal/banner: *"Check your email! We sent an account creation link to {email}. Link expires in 15 minutes."*
- Features Grid:
  - Enjoy on your TV (Smart TVs, consoles, streaming sticks).
  - Download shows to watch offline.
  - Watch everywhere on any screen.
  - 100% Ads-free in 4K HDR.
- FAQ Accordion with interactive expand/collapse.
- Bottom email CTA repeating the input.

- [ ] **Step 2: Verify component syntax & styling**
Run: `node -c web/components/landing/LandingPage.js web/components/landing/FaqAccordion.js`

- [ ] **Step 3: Commit**
```bash
git add web/components/landing/
git commit -m "feat(web): build OffStream & Movies Hunder guest landing page with email onboarding"
```

---

### Task 6: 3-Step Plan Onboarding & Checkout Experience

**Files:**
- Create: `web/app/signup/planform/page.js`
- Create: `web/components/onboarding/StepTwoPlanOverview.js`
- Create: `web/components/onboarding/StepTwoPlanOverview.module.css`
- Create: `web/components/onboarding/StepThreePlanSelection.js`
- Create: `web/components/onboarding/StepThreePlanSelection.module.css`
- Create: `web/components/onboarding/PaymentCheckoutModal.js`
- Create: `web/components/onboarding/PaymentCheckoutModal.module.css`

**Interfaces:**
- Consumes: Query param `?accountCreated=success`, `/api/plans`, `POST /api/subscription/subscribe`.
- Produces: The exact 3-step onboarding flow requested by user.

- [ ] **Step 1: Implement `StepTwoPlanOverview.js` ("Step 2 of 3")**
Matches user specification:
- Label: *"STEP 2 OF 3"*
- Heading: *"Choose your plan"*
- Checkmarks:
  - ✓ *No commitments, cancel anytime.*
  - ✓ *Everything on OffStream for one low price.*
  - ✓ *No ads and no extra fees. Ever.*
- Button: *"Next"* (transitions to Step 3).

- [ ] **Step 2: Implement `StepThreePlanSelection.js` ("Step 3 of 3")**
Matches user specification:
- Heading: *"Choose the plan that's right for you"*
- Fetches dynamic plans from `/api/plans`.
- Displays 4 plan cards in grid:
  - **Mobile** (PKR 250 / 480p / Fair quality / Mobile phone, tablet / 1 screen / 1 download device)
  - **Basic** (PKR 450 / 720p HD / Good quality / TV, computer, phone, tablet / 1 screen / 1 download device)
  - **Standard** (PKR 800 / 1080p Full HD / Great quality / TV, computer, phone, tablet / 2 screens / 2 download devices / "Most Popular" badge)
  - **Premium** (PKR 1,100 / 4K + HDR / Best quality / Spatial audio included / TV, computer, phone, tablet / 4 screens / 4 download devices)
- Clicking a plan selects it and highlights differences.
- Button: *"Next / Continue to Payment"*.

- [ ] **Step 3: Implement `PaymentCheckoutModal.js`**
- Displays order summary (e.g. *"Standard Plan · PKR 800/month"*).
- Card details input (Card number, MM/YY, CVC, Name).
- One-click *"Start Membership"* button calling `subscribeToPlan(selectedPlanId)`.
- Updates `AuthProvider` with active subscription and routes directly to `/` with success toast.

- [ ] **Step 4: Verify syntax & build**
Run: `node -c web/app/signup/planform/page.js web/components/onboarding/*.js`

- [ ] **Step 5: Commit**
```bash
git add web/app/signup/planform/ web/components/onboarding/
git commit -m "feat(web): implement Step 2 and Step 3 plan onboarding and checkout"
```

---

### Task 7: Root `/` Dynamic Gateway & Paywall Guards

**Files:**
- Modify: `web/app/page.js`
- Create: `web/components/HomeGateway.js`
- Modify: `web/components/AuthProvider.js` (track `hasActivePlan`)
- Modify: `web/app/play/PlayClient.js` (paywall protection)

**Interfaces:**
- Dynamic gating logic:
  - `!isSignedIn` ➔ `<LandingPage />`
  - `isSignedIn && !hasActivePlan` ➔ Redirect to `/signup/planform?step=2`
  - `isSignedIn && hasActivePlan` ➔ Full unlocked catalog (`<CatalogRows />`, Continue Watching, Hero, Player)

- [ ] **Step 1: Create `HomeGateway.js`**
Checks `isSignedIn` and `hasActivePlan` from `useAuth()`. Renders `<LandingPage />` or `<CatalogDashboard />`.

- [ ] **Step 2: Update `web/app/page.js`**
Wrap catalog in `<HomeGateway sections={data.sections} />`.

- [ ] **Step 3: Add paywall guard in `PlayClient.js`**
If accessed without `hasActivePlan`, display paywall prompt redirecting to `/signup/planform`.

- [ ] **Step 4: Verify syntax**
Run: `node -c web/app/page.js web/components/HomeGateway.js web/app/play/PlayClient.js`

- [ ] **Step 5: Commit**
```bash
git add web/app/page.js web/components/HomeGateway.js web/app/play/PlayClient.js
git commit -m "feat(web): gate root catalog and video player behind active subscription plan"
```

---

### Task 8: End-to-End Automated Verification & Smokes

**Files:**
- Create: `server/test/e2e-onboarding-plan-flow.test.js`

- [ ] **Step 1: Write E2E test script**
Test full journey:
1. `GET /api/plans` returns 4 dynamic plans with `startingPrice: 250`.
2. `POST /api/auth/start-onboarding` creates user, generates 15-minute token, and generates email HTML containing `Plans start at Rs250/month.`.
3. Simulate clicking `[Create Your Account]` token -> logs in user, returns access token, redirects to `/signup/planform?accountCreated=success`.
4. User selects `standard` plan and calls `POST /api/subscription/subscribe`.
5. Verify `/api/auth/me` and `/api/subscription` return `hasActivePlan: true` and `tier: "STANDARD"`.

- [ ] **Step 2: Execute E2E test**
Run: `node --test server/test/e2e-onboarding-plan-flow.test.js`
Expected: PASS

- [ ] **Step 3: Test local web rendering**
Verify `http://localhost:3001/` renders the landing page for guests and `http://localhost:3001/signup/planform` renders Step 2 & Step 3.

- [ ] **Step 4: Commit**
```bash
git add server/test/e2e-onboarding-plan-flow.test.js
git commit -m "test: add full e2e test for magic link email, dynamic plans, and catalog unlock"
```
