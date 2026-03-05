// PRISM Agent Types & Mock Data

export type AgentStatus = "idle" | "active" | "complete" | "failed";
export type SwarmTier = "MICRO" | "STANDARD" | "EXTENDED" | "MEGA";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type FindingAction = "keep" | "dismiss" | "boost" | "flag";
export type Autonomy = "supervised" | "guided" | "autonomous";

export interface Dimension {
    id: string;
    name: string;
    description: string;
}

export interface AgentConfig {
    id: string;
    name: string;
    archetype: string;
    mandate: string;
    tools: string[];
    dimension: string;
    color: string;
}

export interface AgentRunState extends AgentConfig {
    status: AgentStatus;
    progress: number;
    logs: LogEntry[];
    findings: Finding[];
}

export interface LogEntry {
    timestamp: string;
    agent: string;
    message: string;
    type: "info" | "search" | "finding" | "error";
}

export interface Finding {
    id: string;
    agentId: string;
    agentName: string;
    statement: string;
    evidence: string;
    confidence: ConfidenceLevel;
    source: string;
    implication: string;
    action: FindingAction;
}

export interface BlueprintData {
    query: string;
    dimensions: Dimension[];
    agents: AgentConfig[];
    tier: SwarmTier;
    complexity: { breadth: number; depth: number; interconnection: number; total: number };
    estimatedTime: string;
}

export interface SynthesisLayer {
    name: string;
    description: string;
    insights: string[];
}

// ─── Mock Data ──────────────────────────────────────────────────

export const MOCK_BLUEPRINT: BlueprintData = {
    query: "Analyze the strategic impact of GLP-1 weight loss medications on Medicare Advantage payer margins, quality ratings, and competitive positioning for 2027",
    dimensions: [
        { id: "clinical", name: "Clinical Landscape", description: "GLP-1 efficacy data, pipeline compounds, real-world evidence" },
        { id: "financial", name: "Financial Impact", description: "Payer cost modeling, MLR impact, Part D vs Part B dynamics" },
        { id: "regulatory", name: "Regulatory Environment", description: "CMS coverage policies, prior auth requirements, legislative signals" },
        { id: "quality", name: "Quality & Star Ratings", description: "HEDIS measure impact, weight management quality gaps, cut-point shifts" },
        { id: "competitive", name: "Competitive Dynamics", description: "Payer positioning, formulary strategies, network implications" },
    ],
    agents: [
        {
            id: "agent-clinical",
            name: "Clinical Researcher",
            archetype: "RESEARCHER-DATA",
            mandate: "Gather clinical efficacy and safety data for GLP-1 medications including semaglutide, tirzepatide, and pipeline compounds",
            tools: ["PubMed Search", "Clinical Trials", "Web Search"],
            dimension: "Clinical Landscape",
            color: "#59DDFD",
        },
        {
            id: "agent-financial",
            name: "Financial Analyst",
            archetype: "ANALYST-FINANCIAL",
            mandate: "Model the financial impact of GLP-1 coverage on MA plan margins, MLR, and total cost of care",
            tools: ["SEC EDGAR", "CMS Data", "Web Search"],
            dimension: "Financial Impact",
            color: "#00E49F",
        },
        {
            id: "agent-regulatory",
            name: "Regulatory Specialist",
            archetype: "REGULATORY-RADAR",
            mandate: "Track CMS coverage decisions, prior auth policy changes, and congressional activity related to obesity treatment coverage",
            tools: ["Medicare Coverage", "Federal Register", "Web Search"],
            dimension: "Regulatory Environment",
            color: "#4E84C4",
        },
        {
            id: "agent-quality",
            name: "Quality Analytics Lead",
            archetype: "ANALYST-QUALITY",
            mandate: "Assess impact on Star Ratings, HEDIS measures, and 2027 cut-point projections for weight management quality gaps",
            tools: ["CMS Star Ratings", "HEDIS Data", "NPI Registry"],
            dimension: "Quality & Star Ratings",
            color: "#F59E0B",
        },
        {
            id: "agent-competitive",
            name: "Competitive Intelligence",
            archetype: "ANALYST-STRATEGIC",
            mandate: "Map competitor formulary strategies, network positioning, and first-mover advantages in GLP-1 coverage",
            tools: ["Web Search", "SEC EDGAR", "NPI Registry"],
            dimension: "Competitive Dynamics",
            color: "#EC4899",
        },
    ],
    tier: "STANDARD",
    complexity: { breadth: 4, depth: 4, interconnection: 5, total: 80 },
    estimatedTime: "3-5 minutes",
};

export const MOCK_LOGS: LogEntry[] = [
    { timestamp: "14:32:01", agent: "Clinical Researcher", message: "Initiating PubMed search: \"GLP-1 receptor agonist weight loss RCT 2024-2026\"", type: "search" },
    { timestamp: "14:32:02", agent: "Financial Analyst", message: "Querying SEC EDGAR for UnitedHealth Group 10-K pharmacy benefit disclosures", type: "search" },
    { timestamp: "14:32:02", agent: "Regulatory Specialist", message: "Searching CMS National Coverage Determinations for anti-obesity medications", type: "search" },
    { timestamp: "14:32:03", agent: "Quality Analytics Lead", message: "Loading 2026 Star Ratings cut-points for BMI screening and management measures", type: "search" },
    { timestamp: "14:32:03", agent: "Competitive Intelligence", message: "Scanning payer press releases for GLP-1 formulary announcements", type: "search" },
    { timestamp: "14:32:05", agent: "Clinical Researcher", message: "Found 847 results. Filtering for systematic reviews and meta-analyses...", type: "info" },
    { timestamp: "14:32:07", agent: "Financial Analyst", message: "Extracting pharmacy benefit costs from top 5 MA organizations by enrollment", type: "info" },
    { timestamp: "14:32:09", agent: "Regulatory Specialist", message: "CMS-4205-F final rule identified — expanded obesity treatment coverage effective 2027", type: "finding" },
    { timestamp: "14:32:11", agent: "Clinical Researcher", message: "Key finding: Tirzepatide shows 22.5% mean weight loss at 72 weeks (SURMOUNT-1)", type: "finding" },
    { timestamp: "14:32:13", agent: "Quality Analytics Lead", message: "HEDIS BMI measure weight threshold shifting from 5% to 3% for 2027 reporting year", type: "finding" },
    { timestamp: "14:32:15", agent: "Financial Analyst", message: "Estimated PMPM impact: $12.40-18.60 for unrestricted GLP-1 formulary coverage", type: "finding" },
    { timestamp: "14:32:17", agent: "Competitive Intelligence", message: "CVS/Aetna announced preferred GLP-1 formulary tier as of Q1 2026", type: "finding" },
    { timestamp: "14:32:19", agent: "Regulatory Specialist", message: "IRA negotiation list includes semaglutide — price ceiling effective 2028", type: "finding" },
    { timestamp: "14:32:21", agent: "Clinical Researcher", message: "Analyzing cardiovascular outcome trials: SELECT trial 20% MACE reduction", type: "info" },
    { timestamp: "14:32:23", agent: "Quality Analytics Lead", message: "Modeling Star Rating impact: +0.15 to +0.30 star improvement with comprehensive GLP-1 program", type: "finding" },
];

export const MOCK_FINDINGS: Finding[] = [
    {
        id: "f1",
        agentId: "agent-clinical",
        agentName: "Clinical Researcher",
        statement: "Tirzepatide demonstrates 22.5% mean body weight reduction at 72 weeks, establishing a new clinical benchmark",
        evidence: "SURMOUNT-1 trial (n=2,539), published NEJM 2022, replicated in SURMOUNT-3/4",
        confidence: "HIGH",
        source: "PubMed — PMID 35658024",
        implication: "Sets efficacy expectations that older GLP-1s cannot match, driving formulary pressure toward dual-agonists",
        action: "keep",
    },
    {
        id: "f2",
        agentId: "agent-financial",
        agentName: "Financial Analyst",
        statement: "Unrestricted GLP-1 coverage projected to increase MA plan PMPM costs by $12.40-$18.60",
        evidence: "Modeled from UHG/CVS/HUM 10-K pharmacy disclosures + CMS Part D utilization data",
        confidence: "MEDIUM",
        source: "SEC EDGAR filings + CMS PUF analysis",
        implication: "At scale, GLP-1 coverage could erode MA margins by 40-90 basis points without offsetting quality bonuses",
        action: "keep",
    },
    {
        id: "f3",
        agentId: "agent-regulatory",
        agentName: "Regulatory Specialist",
        statement: "CMS final rule CMS-4205-F expands Medicare obesity treatment coverage effective January 2027",
        evidence: "Federal Register publication, CMS fact sheet, supporting congressional testimony",
        confidence: "HIGH",
        source: "Federal Register Vol. 91, No. 142",
        implication: "Removes the primary regulatory barrier to MA plan GLP-1 coverage — now a question of when, not if",
        action: "keep",
    },
    {
        id: "f4",
        agentId: "agent-quality",
        agentName: "Quality Analytics Lead",
        statement: "Comprehensive GLP-1 programs could improve Star Ratings by +0.15 to +0.30 stars through BMI-related HEDIS measures",
        evidence: "2027 cut-point projections + historical weight management measure performance data",
        confidence: "MEDIUM",
        source: "CMS Star Ratings Technical Notes + internal modeling",
        implication: "Quality improvement from GLP-1 coverage could partially offset PMPM cost increases through bonus payments",
        action: "keep",
    },
    {
        id: "f5",
        agentId: "agent-competitive",
        agentName: "Competitive Intelligence",
        statement: "CVS/Aetna and Humana have already launched preferred GLP-1 formulary tiers, creating first-mover competitive pressure",
        evidence: "Q1 2026 press releases, formulary database analysis, broker channel intelligence",
        confidence: "HIGH",
        source: "Public press releases + formulary databases",
        implication: "Plans without GLP-1 coverage face member attrition risk during 2027 AEP, especially in competitive metro markets",
        action: "keep",
    },
    {
        id: "f6",
        agentId: "agent-financial",
        agentName: "Financial Analyst",
        statement: "GLP-1 adherence rates drop below 40% at 12 months, significantly moderating projected PMPM impact",
        evidence: "CVS Health Research Institute real-world adherence study (n=1.2M), 2025",
        confidence: "HIGH",
        source: "CVS Health Research Institute",
        implication: "Financial models assuming full adherence overstate true cost by 2-3x — adherence management is the key cost lever",
        action: "keep",
    },
];

export const MOCK_SYNTHESIS: SynthesisLayer[] = [
    {
        name: "Foundation",
        description: "Uncontested ground — what all agents agree on",
        insights: [
            "GLP-1 medications represent a clinically validated, high-efficacy class for weight management",
            "CMS regulatory barriers to coverage are falling, making MA plan coverage decisions urgent",
            "The financial impact is significant but moderated by real-world adherence patterns",
        ],
    },
    {
        name: "Convergence",
        description: "Same conclusions reached via different analytical paths",
        insights: [
            "Both Financial and Quality analyses independently conclude that strategic GLP-1 coverage (with adherence management) is NPV-positive when quality bonus payments are included",
        ],
    },
    {
        name: "Tension",
        description: "Productive tensions preserved as genuine complexity",
        insights: [
            "THE GLP-1 PARADOX: Short-term margin erosion vs. long-term competitive positioning — plans that cover GLP-1s lose money in Year 1 but gain members and quality bonuses by Year 3",
        ],
    },
    {
        name: "Emergence",
        description: "Insights only visible from multi-agent analysis",
        insights: [
            "The convergence of IRA price negotiations (2028), CMS coverage expansion (2027), and Star Rating cut-point shifts creates a narrow 12-month window where first-mover advantage is maximal",
        ],
    },
    {
        name: "Gaps",
        description: "What the swarm collectively could NOT determine",
        insights: [
            "Biosimilar GLP-1 timeline remains uncertain — could dramatically change the financial calculus if approved before 2028",
            "Patient preference data for injectable vs. oral GLP-1 formulations is insufficient for formulary optimization",
        ],
    },
];
