-- CreateTable
CREATE TABLE IF NOT EXISTS "watchlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'movie',
    "title" TEXT,
    "poster" TEXT,
    "detail_path" TEXT,
    "year" TEXT,
    "rating" TEXT,
    "badge" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "watchlists_profile_id_subject_id_key" ON "watchlists"("profile_id", "subject_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "watchlists_profile_id_added_at_idx" ON "watchlists"("profile_id", "added_at" DESC);

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'watchlists_user_id_fkey') THEN
        ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'watchlists_profile_id_fkey') THEN
        ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
