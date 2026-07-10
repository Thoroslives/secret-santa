-- AlterTable
ALTER TABLE "WishlistItem" ADD COLUMN "note" TEXT;

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Round_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Block_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Block_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Block_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForcedPin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForcedPin_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForcedPin_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForcedPin_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "roundId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Assignment" ("createdAt", "giverId", "groupId", "id", "receiverId", "year") SELECT "createdAt", "giverId", "groupId", "id", "receiverId", "year" FROM "Assignment";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";
CREATE INDEX "Assignment_groupId_idx" ON "Assignment"("groupId");
CREATE INDEX "Assignment_giverId_idx" ON "Assignment"("giverId");
CREATE INDEX "Assignment_receiverId_idx" ON "Assignment"("receiverId");
CREATE INDEX "Assignment_roundId_idx" ON "Assignment"("roundId");
CREATE UNIQUE INDEX "Assignment_giverId_year_key" ON "Assignment"("giverId", "year");
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "loginCode" TEXT NOT NULL,
    "personalLinkToken" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Person_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Person" ("createdAt", "email", "groupId", "id", "loginCode", "name") SELECT "createdAt", "email", "groupId", "id", "loginCode", "name" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE UNIQUE INDEX "Person_personalLinkToken_key" ON "Person"("personalLinkToken");
CREATE INDEX "Person_groupId_idx" ON "Person"("groupId");
CREATE INDEX "Person_loginCode_idx" ON "Person"("loginCode");
CREATE INDEX "Person_email_idx" ON "Person"("email");
CREATE UNIQUE INDEX "Person_groupId_loginCode_key" ON "Person"("groupId", "loginCode");
CREATE UNIQUE INDEX "Person_groupId_email_key" ON "Person"("groupId", "email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Round_groupId_idx" ON "Round"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_groupId_year_key" ON "Round"("groupId", "year");

-- CreateIndex
CREATE INDEX "Block_groupId_idx" ON "Block"("groupId");

-- CreateIndex
CREATE INDEX "ForcedPin_roundId_idx" ON "ForcedPin"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "ForcedPin_roundId_giverId_key" ON "ForcedPin"("roundId", "giverId");
