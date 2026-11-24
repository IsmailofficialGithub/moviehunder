-- CreateEnum
CREATE TYPE "PartyVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('HOST', 'COHOST', 'VIEWER');

-- CreateTable
CREATE TABLE "party_rooms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "visibility" "PartyVisibility" NOT NULL DEFAULT 'PRIVATE',
    "password_hash" TEXT,
    "invite_token" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "name" TEXT,
    "subject_id" TEXT NOT NULL,
    "detail_path" TEXT NOT NULL,
    "se" TEXT NOT NULL DEFAULT '0',
    "ep" TEXT NOT NULL DEFAULT '0',
    "title" TEXT,
    "poster" TEXT,
    "max_members" INTEGER NOT NULL DEFAULT 25,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "party_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_members" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL DEFAULT 'VIEWER',
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "party_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_events" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "party_rooms_code_key" ON "party_rooms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "party_rooms_invite_token_key" ON "party_rooms"("invite_token");

-- CreateIndex
CREATE INDEX "party_rooms_visibility_ended_at_created_at_idx" ON "party_rooms"("visibility", "ended_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "party_members_user_id_joined_at_idx" ON "party_members"("user_id", "joined_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "party_members_room_id_user_id_key" ON "party_members"("room_id", "user_id");

-- CreateIndex
CREATE INDEX "party_events_room_id_created_at_idx" ON "party_events"("room_id", "created_at");

-- AddForeignKey
ALTER TABLE "party_rooms" ADD CONSTRAINT "party_rooms_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_members" ADD CONSTRAINT "party_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "party_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_members" ADD CONSTRAINT "party_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_events" ADD CONSTRAINT "party_events_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "party_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

