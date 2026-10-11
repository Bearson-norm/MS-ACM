-- CreateTable
CREATE TABLE "user_system" (
    "uid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_system_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "user_machine" (
    "uid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fingerprint_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_machine_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "logs_transaction" (
    "uid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "sensor" TEXT NOT NULL,

    CONSTRAINT "logs_transaction_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_system_username_key" ON "user_system"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_machine_username_key" ON "user_machine"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_machine_fingerprint_id_key" ON "user_machine"("fingerprint_id");

-- CreateIndex
CREATE INDEX "logs_transaction_timestamp_idx" ON "logs_transaction"("timestamp");

-- CreateIndex
CREATE INDEX "logs_transaction_status_idx" ON "logs_transaction"("status");
