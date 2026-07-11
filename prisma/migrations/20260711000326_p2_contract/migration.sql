/*
  Warnings:

  - You are about to drop the column `loginCode` on the `Person` table. All the data in the column will be lost.
  - You are about to drop the column `link` on the `WishlistItem` table. All the data in the column will be lost.
  - Made the column `roundId` on table `Assignment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `personalLinkToken` on table `Person` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "roundId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Assignment" ("createdAt", "giverId", "groupId", "id", "receiverId", "roundId", "year") SELECT "createdAt", "giverId", "groupId", "id", "receiverId", "roundId", "year" FROM "Assignment";
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
    "personalLinkToken" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Person_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Person" ("active", "createdAt", "email", "groupId", "id", "name", "personalLinkToken") SELECT "active", "createdAt", "email", "groupId", "id", "name", "personalLinkToken" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE UNIQUE INDEX "Person_personalLinkToken_key" ON "Person"("personalLinkToken");
CREATE INDEX "Person_groupId_idx" ON "Person"("groupId");
CREATE INDEX "Person_email_idx" ON "Person"("email");
CREATE UNIQUE INDEX "Person_groupId_email_key" ON "Person"("groupId", "email");
CREATE TABLE "new_WishlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishlistItem_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WishlistItem" ("createdAt", "id", "note", "order", "personId", "title") SELECT "createdAt", "id", "note", "order", "personId", "title" FROM "WishlistItem";
DROP TABLE "WishlistItem";
ALTER TABLE "new_WishlistItem" RENAME TO "WishlistItem";
CREATE INDEX "WishlistItem_personId_idx" ON "WishlistItem"("personId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
