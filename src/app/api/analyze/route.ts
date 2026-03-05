import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/analyze — Accept a query, create a run with dimensional blueprint
export async function POST(request: Request) {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== "string" || !query.trim()) {
        return NextResponse.json(
            { error: "Query is required" },
            { status: 400 }
        );
    }

    // Create the run with dimensional analysis
    // In Phase 5, this will call Claude for real decomposition
    // For now, we create a mock blueprint and persist it
    const run = await prisma.run.create({
        data: {
            query: query.trim(),
            status: "INITIALIZE",
            tier: "STANDARD",
            complexityScore: 13,
            breadth: 4,
            depth: 4,
            interconnection: 5,
            estimatedTime: "3-5 minutes",
            dimensions: {
                create: [
                    { name: "Clinical Landscape", description: "GLP-1 efficacy data, pipeline compounds, real-world evidence" },
                    { name: "Financial Impact", description: "Payer cost modeling, MLR impact, Part D vs Part B dynamics" },
                    { name: "Regulatory Environment", description: "CMS coverage policies, prior auth requirements, legislative signals" },
                    { name: "Quality & Star Ratings", description: "HEDIS measure impact, weight management quality gaps, cut-point shifts" },
                    { name: "Competitive Dynamics", description: "Payer positioning, formulary strategies, network implications" },
                ],
            },
            agents: {
                create: [
                    {
                        name: "Clinical Researcher",
                        archetype: "RESEARCHER-DATA",
                        mandate: "Gather clinical efficacy and safety data for relevant medications and treatments",
                        tools: JSON.stringify(["PubMed Search", "Clinical Trials", "Web Search"]),
                        dimension: "Clinical Landscape",
                        color: "#59DDFD",
                    },
                    {
                        name: "Financial Analyst",
                        archetype: "ANALYST-FINANCIAL",
                        mandate: "Model the financial impact on payer margins, MLR, and total cost of care",
                        tools: JSON.stringify(["SEC EDGAR", "CMS Data", "Web Search"]),
                        dimension: "Financial Impact",
                        color: "#00E49F",
                    },
                    {
                        name: "Regulatory Specialist",
                        archetype: "REGULATORY-RADAR",
                        mandate: "Track coverage decisions, policy changes, and legislative activity",
                        tools: JSON.stringify(["Medicare Coverage", "Federal Register", "Web Search"]),
                        dimension: "Regulatory Environment",
                        color: "#4E84C4",
                    },
                    {
                        name: "Quality Analytics Lead",
                        archetype: "ANALYST-QUALITY",
                        mandate: "Assess impact on Star Ratings, HEDIS measures, and quality metric projections",
                        tools: JSON.stringify(["CMS Star Ratings", "HEDIS Data", "NPI Registry"]),
                        dimension: "Quality & Star Ratings",
                        color: "#F59E0B",
                    },
                    {
                        name: "Competitive Intelligence",
                        archetype: "ANALYST-STRATEGIC",
                        mandate: "Map competitor strategies, positioning, and first-mover advantages",
                        tools: JSON.stringify(["Web Search", "SEC EDGAR", "NPI Registry"]),
                        dimension: "Competitive Dynamics",
                        color: "#EC4899",
                    },
                ],
            },
        },
        include: {
            dimensions: true,
            agents: true,
        },
    });

    return NextResponse.json({
        run,
        blueprint: {
            query: run.query,
            dimensions: run.dimensions,
            agents: run.agents,
            tier: run.tier,
            complexity: {
                breadth: run.breadth,
                depth: run.depth,
                interconnection: run.interconnection,
                total: run.complexityScore,
            },
            estimatedTime: run.estimatedTime,
        },
    });
}
