-- Phase 0 Data Integrity: Profiles, Accounts, Households, and WatchProgress isolation

-- 1. Ensure required Enums exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanTier') THEN
        CREATE TYPE "PlanTier" AS ENUM ('STANDARD_ADS', 'STANDARD', 'PREMIUM');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MemberRole') THEN
        CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'EXTRA_MEMBER');
    END IF;
END $$;

-- 2. Ensure accounts table exists
CREATE TABLE IF NOT EXISTS "accounts" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_owner_user_id_key" ON "accounts"("owner_user_id");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_owner_user_id_fkey') THEN
        ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- 3. Ensure account_members table exists
CREATE TABLE IF NOT EXISTS "account_members" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,

    CONSTRAINT "account_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_members_user_id_key" ON "account_members"("user_id");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_members_account_id_fkey') THEN
        ALTER TABLE "account_members" ADD CONSTRAINT "account_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_members_user_id_fkey') THEN
        ALTER TABLE "account_members" ADD CONSTRAINT "account_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 4. Ensure profiles table exists
CREATE TABLE IF NOT EXISTS "profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "is_kids" BOOLEAN NOT NULL DEFAULT false,
    "pin" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "profiles_user_id_idx" ON "profiles"("user_id");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_fkey') THEN
        ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 5. Ensure households table exists
CREATE TABLE IF NOT EXISTS "households" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "primary_asn" TEXT,
    "primary_subnet" TEXT,
    "last_updated" TIMESTAMP(3),

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'households_account_id_fkey') THEN
        ALTER TABLE "households" ADD CONSTRAINT "households_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 6. Ensure device_verifications table exists
CREATE TABLE IF NOT EXISTS "device_verifications" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temporary_access_until" TIMESTAMP(3),

    CONSTRAINT "device_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_verifications_household_id_device_id_key" ON "device_verifications"("household_id", "device_id");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'device_verifications_household_id_fkey') THEN
        ALTER TABLE "device_verifications" ADD CONSTRAINT "device_verifications_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 7. Ensure profile columns exist (for existing tables)
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "pin" TEXT;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 8. Backfill: Ensure every existing user has an Account
INSERT INTO "accounts" ("id", "owner_user_id", "tier")
SELECT
    concat('acc_', substr(md5(random()::text), 1, 16)),
    u."id",
    'STANDARD'::"PlanTier"
FROM "users" u
WHERE NOT EXISTS (
    SELECT 1 FROM "accounts" a WHERE a."owner_user_id" = u."id"
);

-- 9. Backfill: Ensure every existing user has at least one primary profile
INSERT INTO "profiles" ("id", "user_id", "name", "avatar_url", "is_kids", "is_primary", "created_at", "updated_at")
SELECT
    concat('prof_', substr(md5(random()::text), 1, 16)),
    u."id",
    coalesce(u."display_name", split_part(u."email", '@', 1)),
    u."avatar_url",
    false,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users" u
WHERE NOT EXISTS (
    SELECT 1 FROM "profiles" p WHERE p."user_id" = u."id"
);

-- If a user has profiles but none marked primary, mark the earliest one as primary
UPDATE "profiles" p
SET "is_primary" = true
WHERE p."id" IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as rn
        FROM profiles
        WHERE user_id IN (
            SELECT user_id FROM profiles GROUP BY user_id HAVING count(*) FILTER (WHERE is_primary = true) = 0
        )
    ) ranked
    WHERE rn = 1
);

-- 10. Extend watch_progress table with profile_id
ALTER TABLE "watch_progress" ADD COLUMN IF NOT EXISTS "profile_id" TEXT;

-- 11. Backfill watch_progress.profile_id to user's primary profile
UPDATE "watch_progress" wp
SET "profile_id" = (
    SELECT p."id"
    FROM "profiles" p
    WHERE p."user_id" = wp."user_id" AND p."is_primary" = true
    LIMIT 1
)
WHERE wp."profile_id" IS NULL;

-- 12. Drop old unique constraint and add new composite unique constraint
ALTER TABLE "watch_progress" DROP CONSTRAINT IF EXISTS "watch_progress_user_id_progress_key_key";
DROP INDEX IF EXISTS "watch_progress_user_id_progress_key_key";

-- Add foreign key constraint to profiles
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'watch_progress_profile_id_fkey'
    ) THEN
        ALTER TABLE "watch_progress"
        ADD CONSTRAINT "watch_progress_profile_id_fkey"
        FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Create composite unique index on (user_id, profile_id, progress_key)
CREATE UNIQUE INDEX IF NOT EXISTS "watch_progress_user_id_profile_id_progress_key_key"
ON "watch_progress"("user_id", "profile_id", "progress_key");

-- Create index on (user_id, profile_id, updated_at DESC)
DROP INDEX IF EXISTS "watch_progress_user_id_updated_at_idx";
CREATE INDEX IF NOT EXISTS "watch_progress_user_id_profile_id_updated_at_idx"
ON "watch_progress"("user_id", "profile_id", "updated_at" DESC);
