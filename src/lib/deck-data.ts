// Deck metadata for PRISM HTML5 briefs

export interface DeckMeta {
    id: string;
    title: string;
    subtitle: string;
    filename: string;
    date: string;
    agentCount: number;
    tier: "MICRO" | "STANDARD" | "EXTENDED" | "MEGA";
    slideCount: number;
    dimensions: string[];
    agents: {
        name: string;
        archetype: string;
        color: string;
    }[];
    confidence: number;
    status: "complete" | "draft";
}

export const DECK_LIBRARY: DeckMeta[] = [
    {
        id: "glp1-strategic",
        title: "GLP-1 Strategic Opportunity",
        subtitle: "Weight Management Medications & MA Payer Impact",
        filename: "prism-glp1-strategic-opportunity.html",
        date: "2026-02-15",
        agentCount: 5,
        tier: "STANDARD",
        slideCount: 15,
        dimensions: ["Clinical", "Financial", "Regulatory", "Quality", "Competitive"],
        agents: [
            { name: "Clinical Researcher", archetype: "RESEARCHER-DATA", color: "#59DDFD" },
            { name: "Financial Analyst", archetype: "ANALYST-FINANCIAL", color: "#00E49F" },
            { name: "Regulatory Specialist", archetype: "REGULATORY-RADAR", color: "#4E84C4" },
            { name: "Quality Analytics", archetype: "ANALYST-QUALITY", color: "#F5E6BB" },
            { name: "Competitive Intel", archetype: "ANALYST-STRATEGIC", color: "#EC4899" },
        ],
        confidence: 0.87,
        status: "complete",
    },
    {
        id: "sotu-healthcare-v5",
        title: "SOTU Healthcare Impact",
        subtitle: "State of the Union Policy Analysis — Validated Edition",
        filename: "prism-sotu-healthcare-impact-v5-validated.html",
        date: "2026-02-20",
        agentCount: 7,
        tier: "EXTENDED",
        slideCount: 18,
        dimensions: ["Legislative", "Regulatory", "Financial", "Competitive", "Technology", "Workforce", "Macro"],
        agents: [
            { name: "Legislative Pipeline", archetype: "LEGISLATIVE-PIPELINE", color: "#4E84C4" },
            { name: "Regulatory Radar", archetype: "REGULATORY-RADAR", color: "#6C6CFF" },
            { name: "Financial Analyst", archetype: "ANALYST-FINANCIAL", color: "#00E49F" },
            { name: "Competitive Scanner", archetype: "ANALYST-STRATEGIC", color: "#EC4899" },
            { name: "Technology Assessor", archetype: "ANALYST-TECHNICAL", color: "#59DDFD" },
            { name: "Workforce Analyst", archetype: "RESEARCHER-DOMAIN", color: "#F59E0B" },
            { name: "Macro Context", archetype: "MACRO-CONTEXT", color: "#F5E6BB" },
        ],
        confidence: 0.91,
        status: "complete",
    },
    {
        id: "star-ratings-2027",
        title: "Star Ratings Cut-Point 2027",
        subtitle: "CMS Quality Metrics & Cut-Point Shift Analysis",
        filename: "prism-star-ratings-cutpoint-2027.html",
        date: "2026-02-10",
        agentCount: 4,
        tier: "STANDARD",
        slideCount: 14,
        dimensions: ["Quality Analytics", "Financial", "Competitive", "Regulatory"],
        agents: [
            { name: "Quality Lead", archetype: "ANALYST-QUALITY", color: "#F5E6BB" },
            { name: "Financial Analyst", archetype: "ANALYST-FINANCIAL", color: "#00E49F" },
            { name: "Competitive Scanner", archetype: "ANALYST-STRATEGIC", color: "#EC4899" },
            { name: "Regulatory Radar", archetype: "REGULATORY-RADAR", color: "#4E84C4" },
        ],
        confidence: 0.89,
        status: "complete",
    },
    {
        id: "inovalon-exit",
        title: "Inovalon Exit Strategy",
        subtitle: "Private Equity Exit Analysis & Strategic Options",
        filename: "prism-inovalon-exit-strategy.html",
        date: "2026-02-18",
        agentCount: 6,
        tier: "EXTENDED",
        slideCount: 16,
        dimensions: ["Financial", "Strategic", "Competitive", "M&A", "Technology", "Regulatory"],
        agents: [
            { name: "Financial Analyst", archetype: "ANALYST-FINANCIAL", color: "#00E49F" },
            { name: "Strategic Advisor", archetype: "ANALYST-STRATEGIC", color: "#59DDFD" },
            { name: "Competitive Intel", archetype: "ANALYST-STRATEGIC", color: "#EC4899" },
            { name: "M&A Specialist", archetype: "RESEARCHER-DOMAIN", color: "#6C6CFF" },
            { name: "Technology Assessor", archetype: "ANALYST-TECHNICAL", color: "#F59E0B" },
            { name: "Regulatory Radar", archetype: "REGULATORY-RADAR", color: "#4E84C4" },
        ],
        confidence: 0.84,
        status: "complete",
    },
    {
        id: "healthcare-ma",
        title: "Healthcare M&A Intelligence",
        subtitle: "Consolidation Trends & Transaction Analysis",
        filename: "prism-healthcare-ma-intelligence.html",
        date: "2026-02-22",
        agentCount: 5,
        tier: "STANDARD",
        slideCount: 15,
        dimensions: ["M&A Pipeline", "Financial", "Strategic", "Regulatory", "Competitive"],
        agents: [
            { name: "M&A Researcher", archetype: "RESEARCHER-DOMAIN", color: "#6C6CFF" },
            { name: "Financial Analyst", archetype: "ANALYST-FINANCIAL", color: "#00E49F" },
            { name: "Strategic Advisor", archetype: "ANALYST-STRATEGIC", color: "#59DDFD" },
            { name: "Regulatory Radar", archetype: "REGULATORY-RADAR", color: "#4E84C4" },
            { name: "Competitive Scanner", archetype: "ANALYST-STRATEGIC", color: "#EC4899" },
        ],
        confidence: 0.86,
        status: "complete",
    },
];
