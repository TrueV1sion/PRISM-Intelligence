import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/deploy — Launch agent execution for a run
// In Phase 5 this will trigger real Claude API calls
// For now it simulates the lifecycle: SPAWN → EXECUTE → SYNTHESIZE → DELIVER
export async function POST(request: Request) {
    const body = await request.json();
    const { runId } = body;

    if (!runId) {
        return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    const run = await prisma.run.findUnique({
        where: { id: runId },
        include: { agents: true },
    });

    if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Update run status to SPAWN
    await prisma.run.update({
        where: { id: runId },
        data: { status: "SPAWN" },
    });

    // Activate all agents
    await prisma.agent.updateMany({
        where: { runId },
        data: { status: "active" },
    });

    // Simulate agent execution — create mock findings
    const agentFindings = [
        {
            statement: "Primary clinical compound demonstrates significant efficacy in target population",
            evidence: "Phase III RCT data (n>2,000), published in top-tier journal",
            confidence: "HIGH",
            evidenceType: "direct",
            source: "PubMed — peer-reviewed systematic review",
            implication: "Sets new clinical standard, impacts competitive landscape",
        },
        {
            statement: "Financial modeling indicates material impact on payer margins in current projection window",
            evidence: "Modeled from SEC filings and CMS public utilization data",
            confidence: "MEDIUM",
            evidenceType: "modeled",
            source: "SEC EDGAR filings + CMS PUF analysis",
            implication: "Requires strategic repositioning of coverage policy within 12-18 months",
        },
        {
            statement: "Regulatory landscape shifting favorably with new coverage determination",
            evidence: "Federal Register notice, supporting congressional record, CMS fact sheet",
            confidence: "HIGH",
            evidenceType: "direct",
            source: "Federal Register + CMS.gov",
            implication: "Removes primary regulatory barriers — coverage decisions become urgent",
        },
        {
            statement: "Quality metrics projected to improve with comprehensive program implementation",
            evidence: "Historical cut-point data + internal performance modeling",
            confidence: "MEDIUM",
            evidenceType: "modeled",
            source: "CMS Star Ratings Technical Notes + HEDIS specifications",
            implication: "Quality improvement could offset cost increases through bonus payments",
        },
        {
            statement: "Competitive first-movers already establishing market positioning",
            evidence: "Public press releases, formulary database analysis, broker intelligence",
            confidence: "HIGH",
            evidenceType: "direct",
            source: "Public filings + market databases",
            implication: "Delayed action creates member attrition risk in competitive markets",
        },
    ];

    // Create findings mapped to agents
    for (let i = 0; i < Math.min(agentFindings.length, run.agents.length); i++) {
        await prisma.finding.create({
            data: {
                ...agentFindings[i],
                action: "keep",
                tags: JSON.stringify([]),
                agentId: run.agents[i].id,
                runId,
            },
        });
    }

    // Complete all agents
    await prisma.agent.updateMany({
        where: { runId },
        data: { status: "complete", progress: 100 },
    });

    // Update status to SYNTHESIZE
    await prisma.run.update({
        where: { id: runId },
        data: { status: "SYNTHESIZE" },
    });

    // Create synthesis layers
    const layers = [
        {
            layerName: "foundation",
            description: "Uncontested ground — what all agents agree on",
            insights: JSON.stringify([
                "Target intervention validated by high-quality clinical evidence",
                "Regulatory barriers falling, making strategic decisions increasingly urgent",
                "Financial impact significant but moderated by adherence and utilization patterns",
            ]),
            order: 0,
        },
        {
            layerName: "convergence",
            description: "Same conclusions reached via different analytical paths",
            insights: JSON.stringify([
                "Financial and Quality analyses independently conclude that strategic coverage is NPV-positive when quality bonus payments are included",
            ]),
            order: 1,
        },
        {
            layerName: "tension",
            description: "Productive tensions preserved as genuine complexity",
            insights: JSON.stringify([
                "Short-term margin erosion vs. long-term competitive positioning — organizations that act first lose money initially but gain members and quality bonuses by Year 3",
            ]),
            order: 2,
        },
        {
            layerName: "emergence",
            description: "Insights only visible from multi-agent analysis",
            insights: JSON.stringify([
                "The convergence of multiple policy and market forces creates a narrow strategic window where first-mover advantage is maximal",
            ]),
            order: 3,
        },
        {
            layerName: "gap",
            description: "What the swarm collectively could NOT determine",
            insights: JSON.stringify([
                "Market entry timelines for competitive alternatives remain uncertain",
                "Patient preference data insufficient for formulary optimization",
            ]),
            order: 4,
        },
    ];

    for (const layer of layers) {
        await prisma.synthesis.create({
            data: { ...layer, runId },
        });
    }

    // Create a presentation record
    await prisma.presentation.create({
        data: {
            title: `Strategic Intelligence Brief`,
            subtitle: run.query.slice(0, 100),
            htmlPath: `prism-glp1-strategic-opportunity.html`,
            slideCount: 15,
            runId,
        },
    });

    // Mark run as DELIVER (complete)
    const completedRun = await prisma.run.update({
        where: { id: runId },
        data: { status: "DELIVER", completedAt: new Date() },
        include: {
            agents: true,
            findings: true,
            synthesis: { orderBy: { order: "asc" } },
            presentation: true,
        },
    });

    return NextResponse.json({ run: completedRun });
}
