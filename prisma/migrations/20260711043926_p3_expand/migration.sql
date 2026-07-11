-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "forPersonId" TEXT NOT NULL,
    "byPersonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "named" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Suggestion_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Suggestion_forPersonId_fkey" FOREIGN KEY ("forPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Suggestion_byPersonId_fkey" FOREIGN KEY ("byPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 2024,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "budgetAmount" REAL,
    "budgetCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "suggestionCap" INTEGER NOT NULL DEFAULT 3,
    "previousYearMemory" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "new_Group" ("budgetAmount", "budgetCurrency", "createdAt", "id", "inviteCode", "name", "plan", "updatedAt", "year") SELECT "budgetAmount", "budgetCurrency", "createdAt", "id", "inviteCode", "name", "plan", "updatedAt", "year" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE UNIQUE INDEX "Group_inviteCode_key" ON "Group"("inviteCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Suggestion_roundId_idx" ON "Suggestion"("roundId");

-- CreateIndex
CREATE INDEX "Suggestion_forPersonId_idx" ON "Suggestion"("forPersonId");

-- CreateIndex
CREATE INDEX "Suggestion_byPersonId_forPersonId_roundId_idx" ON "Suggestion"("byPersonId", "forPersonId", "roundId");
