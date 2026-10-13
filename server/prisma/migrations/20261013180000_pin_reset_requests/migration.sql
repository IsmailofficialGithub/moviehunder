-- CreateTable
CREATE TABLE "pin_reset_requests" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pin_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pin_reset_requests_profile_id_sent_at_idx" ON "pin_reset_requests"("profile_id", "sent_at");
