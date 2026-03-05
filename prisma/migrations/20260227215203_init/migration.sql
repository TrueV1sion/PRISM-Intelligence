-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INITIALIZE',
    "tier" TEXT NOT NULL DEFAULT 'STANDARD',
    "autonomyMode" TEXT NOT NULL DEFAULT 'supervised',
    "complexityScore" INTEGER NOT NULL DEFAULT 0,
    "breadth" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "interconnection" INTEGER NOT NULL DEFAULT 0,
    "estimatedTime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Dimension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    CONSTRAINT "Dimension_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "mandate" TEXT NOT NULL,
    "tools" TEXT NOT NULL DEFAULT '[]',
    "dimension" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#59DDFD',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "runId" TEXT NOT NULL,
    CONSTRAINT "Agent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statement" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "evidenceType" TEXT NOT NULL DEFAULT 'direct',
    "source" TEXT NOT NULL,
    "implication" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'keep',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "agentId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    CONSTRAINT "Finding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Synthesis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "layerName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "insights" TEXT NOT NULL DEFAULT '[]',
    "order" INTEGER NOT NULL DEFAULT 0,
    "runId" TEXT NOT NULL,
    CONSTRAINT "Synthesis_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "htmlPath" TEXT NOT NULL,
    "slideCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runId" TEXT NOT NULL,
    CONSTRAINT "Presentation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Presentation_runId_key" ON "Presentation"("runId");
