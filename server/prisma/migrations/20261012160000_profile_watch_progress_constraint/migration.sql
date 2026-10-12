-- Phase 0 Data Integrity: Backfill and composite unique constraint on (userId, profileId, progressKey)

-- 1. Extend profiles table
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "pin" TEXT;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "profiles_user_id_idx" ON "profiles"("user_id");

-- 2. Backfill: Ensure every existing user has at least one primary profile
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

-- 3. Extend watch_progress table with profile_id
ALTER TABLE "watch_progress" ADD COLUMN IF NOT EXISTS "profile_id" TEXT;

-- 4. Backfill watch_progress.profile_id to the user's primary profile
UPDATE "watch_progress" wp
SET "profile_id" = (
    SELECT p."id"
    FROM "profiles" p
    WHERE p."user_id" = wp."user_id" AND p."is_primary" = true
    LIMIT 1
)
WHERE wp."profile_id" IS NULL;

-- 5. Drop old unique constraint and add new composite unique constraint
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
