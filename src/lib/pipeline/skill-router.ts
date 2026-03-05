/**
 * Platform Skill Router
 * 
 * Loads domain intelligence modules and injects relevant skill context
 * into agent system prompts based on each archetype's `compatibleSkills`.
 * 
 * Each skill is a distilled intelligence module containing:
 * - Domain expertise (frameworks, metrics, terminology)
 * - Analysis workflows and templates
 * - Tool usage guidance (which MCP tools to prioritize)
 * - Output formatting requirements
 * 
 * Skills are injected as additional system context — they augment the agent's
 * analytical capabilities without replacing its core archetype behavior.
 */

// ─── Skill Definition ───────────────────────────────────────

export interface PlatformSkill {
    /** Unique identifier matching `compatibleSkills` in archetypes */
    id: string;
    /** Human-readable name */
    name: string;
    /** Short description for skill discovery */
    description: string;
    /** Tool categories this skill should prioritize */
    recommendedTools: string[];
    /** The actual domain intelligence content injected into prompts */
    promptContext: string;
    /** Maximum token budget for this skill's context (prevents bloat) */
    maxTokenBudget: number;
}


// ─── Skill Definitions ─────────────────────────────────────

const HEALTHCARE_QUALITY_ANALYTICS: PlatformSkill = {
    id: "healthcare-quality-analytics",
    name: "Healthcare Quality Analytics",
    description: "CMS Star Ratings, HEDIS measures, CAHPS scores, quality improvement strategies",
    recommendedTools: ["pubmed_search", "cms_data", "cdc_places", "census_acs"],
    maxTokenBudget: 2000,
    promptContext: `## Domain Intelligence: Healthcare Quality Analytics

### CMS Star Ratings Framework
- **5 Domains**: Staying Healthy (~20%), Managing Chronic Conditions (~25%), Member Experience/CAHPS (~25%), Complaints & Changes (~15%), Customer Service (~15%)
- **Scale**: 5⭐ (Excellent, max bonus) → 4⭐ (Above Avg, partial bonus) → 3⭐ (Average) → 2⭐ (Poor, sanctions risk)
- **Bonus Eligibility**: 4.0+ Stars = 5% benchmark increase (Quality Bonus Payment)
- **5-Star SEP**: Year-round Special Enrollment Period = enrollment growth advantage

### HEDIS Measure Categories
- **Effectiveness of Care**: BCS (Breast Cancer Screening), COL (Colorectal), CCS (Cervical), CDC (Diabetes Care), CBP (Blood Pressure), FUH (Follow-Up Hospitalization), AMM (Antidepressant)
- **Access**: Adults' Access to Preventive Services, Initiation of AOD Treatment
- **Experience (CAHPS)**: Getting Needed Care, Getting Care Quickly, Plan Rating
- **Utilization**: Antibiotic, Imaging, ED Visits

### Analysis Workflow
1. Identify scope (contracts, measures, time period)
2. Calculate rates, percentiles, cut-point distances
3. Benchmark against peers, national averages, best-in-class
4. Identify improvement gaps with weighted impact analysis
5. Prioritize by ROI = Gap × Weight × Improvability Factor

### Quality Improvement Levers
- Member Outreach (reminders, incentives, transportation)
- Provider Engagement (gap reports, P4P, EMR integration)
- Care Management (high-risk ID, disease management, MTM)
- Data & Operations (supplemental data capture, chart chase, coding accuracy)

### Key Terminology
MY=Measurement Year | HEDIS=Healthcare Effectiveness Data and Information Set | CAHPS=Consumer Assessment of Healthcare Providers and Systems | NCQA=National Committee for Quality Assurance | D-SNP=Dual Eligible SNP | MLR=Medical Loss Ratio | PMPM=Per Member Per Month | VBC=Value-Based Care`,
};


const STARS_2027_NAVIGATOR: PlatformSkill = {
    id: "stars-2027-navigator",
    name: "Stars 2027 Navigator",
    description: "CMS Star Ratings strategic intelligence for the 2027-2029 methodology transition",
    recommendedTools: ["cms_data", "federal_register", "gdelt_search", "cdc_places"],
    maxTokenBudget: 2500,
    promptContext: `## Domain Intelligence: Stars 2027 Methodology Transition

### The 2026-2029 Transition Map
| MY    | Star Year | Key Changes |
|-------|-----------|-------------|
| 2024  | 2026      | Current methodology; PDC at 3x weight |
| 2025  | 2027      | Reward Factor retained (EHO4All NOT implemented) |
| 2026  | 2028      | PDC weight temporarily reduced 3x→1x |
| 2027  | 2029      | 12 measures removed; Depression Screening added; PDC back to 3x |

### 12 Measures Being Removed (Proposed for MY2027/SY2029)
**Administrative (7)**: Call Center Foreign Language, Appeals Auto-Forward, Appeals Upheld (C&D), Reviewing Appeals (C&D), Complaints
**Process of Care (3)**: Getting Needed Care, Getting Appointments Quickly, Timely Appeal Decisions
**Patient Experience (2)**: Rating of Drug Plan, Getting Needed Rx

**Impact**: Fewer measures = each remaining measure carries MORE weight. Clinical outcomes and member experience become dominant. 89% of contracts projected to see score declines.

### Post-2029 Weight Shifts
| Category | Direction | Priority |
|----------|-----------|----------|
| Medication Adherence (PDC ×3) | Returns after 1x pause | HIGHEST |
| CAHPS Experience | Grows in relative share | HIGH |
| Clinical Quality (HEDIS) | Grows in relative share | HIGH |
| Depression Screening (NEW) | Added MY2027 | HIGH |
| HOS Outcomes | Stable, elevated | MEDIUM |
| Administrative | 7 removed | N/A |

### Quality Bonus Payment Economics
Formula: MA Members × Per-Member Benchmark × 12 × 5% QBP
- Large plan (663K members): ~$437M/year at risk
- Mid-size (150K): ~$99M/year
- Small (30K): ~$19.8M/year

### PDC Measures (Triple-Weighted, Highest Leverage)
- D10: Diabetes (oral medications) ~83% avg
- D11: Hypertension (ACE/ARB) ~85% avg
- D12: Cholesterol (Statins) ~84% avg
Triple-weighted = moving PDC moves Stars 3x faster than any single measure.

### Prospect Scenario Framework
1. **Current Position**: Overall Star, Part C/D, contract IDs, membership, state comparison
2. **Transition Impact**: Which strong measures removed? Which weak survive? Net direction?
3. **Intervention Priority**: Gap to next star × weight × financial impact ÷ cost = ROI
4. **Competitive Context**: Who has 5-Star SEP in their market?`,
};


const PAYER_FINANCIAL_DECODER: PlatformSkill = {
    id: "payer-financial-decoder",
    name: "Payer Financial Decoder",
    description: "Decode payer financials into actionable intelligence: MLR, margins, pharmacy trends, ROI models",
    recommendedTools: ["sec_edgar", "fred_economic", "gdelt_search", "web_search"],
    maxTokenBudget: 2000,
    promptContext: `## Domain Intelligence: Payer Financial Analysis

### Revenue Anatomy
Premiums Earned (Commercial + MA + Medicaid + ASO Fees) + Investment Income = Total Revenue

### Cost Anatomy
Medical Claims (~80-90% of premiums): Inpatient + Outpatient + Professional + Pharmacy (incl. GLP-1s) + Behavioral Health
Administrative: Claims Processing + Customer Service + IT + Sales + Quality + Compliance

### Key Ratios to Extract
| Ratio | Formula | Signal |
|-------|---------|--------|
| MLR | Claims ÷ Premiums | >85% = under pressure |
| Admin Cost Ratio | Admin ÷ Premiums | High = efficiency opportunity |
| Operating Margin | Operating Income ÷ Revenue | Negative = burning platform |
| RBC Ratio | Capital ÷ Required | <300% distressed, 500%+ strong |
| Premium Growth | YoY change | >10% = cost pass-through |
| Membership Trend | YoY change | Declining = competitive pressure |

### Pharmacy Cost Analysis (GLP-1 Focus)
Track: Mounjaro (tirzepatide), Ozempic/Wegovy (semaglutide), Zepbound, Rybelsus
Key: What % of pharmacy spend? Coverage for weight management? YoY growth rate?
Specialty drugs = 50%+ of pharmacy spend but <5% of utilizers

### Financial-to-Pain-Point Translation
| Signal | Pain | Solution Angle |
|--------|------|----------------|
| MLR >87% | Costs outpacing premiums | Payment integrity, quality analytics |
| Negative operating margin | Unsustainable | Platform economics (buy vs build) |
| MA growing >5% | Growth outpacing quality | Star protection during growth |
| Pharmacy growth >15% | GLP-1/specialty surge | Pharmacy analytics, adherence |
| Premium increase >10% | Affordability crisis | Quality-driven cost avoidance |

### Payer Archetypes
- **Burning Platform**: Negative margins, cutting costs → Payment Integrity
- **Growth Machine**: MA growing fast → Star Protection
- **Quality Leader**: 4.5+ Stars → 5-Star path
- **Turnaround**: New CEO, tech mandate → Full platform
- **Regional Fortress**: Dominant share → Competitive threat framing`,
};


const REGULATORY_RADAR: PlatformSkill = {
    id: "regulatory-radar",
    name: "Regulatory Radar",
    description: "Track CMS/HHS regulatory changes, deadlines, and compliance triggers",
    recommendedTools: ["federal_register", "opensecrets_lobbying", "gdelt_search", "gdelt_context"],
    maxTokenBudget: 2500,
    promptContext: `## Domain Intelligence: Regulatory Radar

### Active Regulatory Landscape (2026)

#### Tier 1 — Immediate Impact
**CY2027 MA & Part D Proposed Rule** (Nov 2025): 12 Star measures removed, Depression Screening added, PDC 1x→3x transition, D-SNP enhancements. $13.8B estimated Medicare spending increase over 10 years.

**CY2027 Advance Rate Notice** (Jan 2026): Basic update +0.09% (vs 5.06% prior year). V28 phase-in complete. Signaling future methodology changes.

**Part D Redesign (IRA)**: $2,000 OOP cap effective. Coverage gap eliminated. Manufacturer Discount Program active.

#### Tier 2 — Building Impact (6-12 months)
**V28 Risk Adjustment**: Phase-in complete. Reduced HCC coefficients, emphasis on encounter data quality.
**Prior Auth & UM (CY2026)**: No retroactive denials, stricter documentation, D-SNP timelines.
**Interoperability (CMS-0057-F)**: FHIR APIs required — Patient Access, Provider Directory, Prior Auth, Payer-to-Payer.

#### Tier 3 — Emerging (12-24 months)
Health Equity measurement (paused but signaled), Behavioral Health integration, VBC expansion.

### Legislative Foundation
- **One Big Beautiful Bill Act**: 4% Medicare sequester ($536B cuts through 2034), $1.02T Medicaid cuts
- **FY2026 Appropriations**: MA Provider Directory mandate (2028), PBM transparency, telehealth extension
- **Inflation Reduction Act**: Drug negotiation Round 1 live (10 drugs), $2,000 OOP cap

### Regulatory-to-Trigger Matrix
| Event | Urgency | Sales Angle |
|-------|---------|-------------|
| Star methodology overhaul | CRITICAL | "89% of contracts decline under new math" |
| PDC weight 3x return | HIGH | "Adherence deprioritized during pause = exposed" |
| V28 complete | HIGH | "Risk adjustment cushion gone" |
| Rate notice +0.09% | HIGH | "Near-zero increase + V28 = margin compression" |
| Depression Screening | MEDIUM | "CMS added behavioral health to Stars" |

### CMS Annual Calendar
Jan: Rate Notice → Feb: Comments → Apr: Final Rule → Jun: Bids due → Oct: Stars released → Nov: Proposed Rule
**Best engagement windows**: Oct (post-Star), Jan-Feb (post-Rate), Apr-May (bid decisions)`,
};


const COMPETITOR_BATTLECARD: PlatformSkill = {
    id: "competitor-battlecard",
    name: "Competitor Battlecard Generator",
    description: "Competitive intelligence: SWOT, feature matrices, objection handling, talk tracks",
    recommendedTools: ["web_search", "sec_edgar", "gdelt_search", "opensecrets_lobbying"],
    maxTokenBudget: 1500,
    promptContext: `## Domain Intelligence: Competitive Analysis

### Battlecard Framework
1. **Research**: Company overview, products, news, leadership, financials
2. **SWOT**: Strengths (acknowledge), Weaknesses (exploit), Opportunities (capture), Threats (monitor)
3. **Feature Matrix**: Side-by-side on key capabilities (✅ Strong | ⚠️ Partial | ❌ Missing)
4. **Objection Handling**: CLAIM → RESPONSE → PROOF POINTS → REDIRECT QUESTION
5. **Talk Tracks**: Discovery questions, positioning statements, landmine questions

### Healthcare-Specific Intelligence
Always evaluate: HIPAA/HITRUST compliance, EHR integration (Epic, Cerner), Payer vs Provider focus, Government programs expertise, Star Ratings/HEDIS capabilities, clinical workflow integration

### We Win When / Lose When Analysis
Document: scenario → evidence → approach (for wins) or counter-strategy (for losses)

### Output Formats
- **Quick Reference (1-pager)**: Snapshot + top 3 strengths/weaknesses + killer question
- **Full Battlecard**: Complete SWOT + feature matrix + all objection handlers + talk tracks
- **Executive Brief**: Market positioning + win/loss patterns + strategic recommendations`,
};


// ─── Additional Skills (referenced in archetypes) ──────────

const DEAL_ROOM_INTELLIGENCE: PlatformSkill = {
    id: "deal-room-intelligence",
    name: "Deal Room Intelligence",
    description: "Prospect research and presentation preparation for sales deal rooms",
    recommendedTools: ["sec_edgar", "web_search", "gdelt_search", "opensecrets_lobbying", "cms_data"],
    maxTokenBudget: 1500,
    promptContext: `## Domain Intelligence: Deal Room Preparation

### Standard Deal Room Slide Structure
1. **Cover**: Prospect name + meeting context
2. **Your Moment**: Why now? (regulatory + financial + competitive pressures)
3. **Star Ratings Position**: Current Stars, transition impact, competitive Star positioning
4. **Opportunity**: Specific measures affected by methodology changes
5. **Financial Context**: Revenue, margins, cost pressures, growth trajectory
6. **Solution Mapping**: Capabilities matched to prospect's specific pain points
7. **Competitive Landscape**: Who else is in the deal, differentiation points
8. **Case Studies**: Relevant customer success stories
9. **Financial Impact/ROI**: Quantified business case
10. **Next Steps**: Clear action items and timeline

### Research Checklist
□ Company financials (annual report/10-K) □ CMS contract IDs and Star Ratings □ MA enrollment and trends
□ Key executives and decision-makers □ Recent press/news □ Regulatory exposure (Star methodology, V28)
□ Competitive context (other vendors) □ Lobbying/political activity □ Strategic initiatives announced`,
};


const HEALTHCARE_MA_SIGNAL_HUNTER: PlatformSkill = {
    id: "healthcare-ma-signal-hunter",
    name: "Healthcare M&A Signal Hunter",
    description: "Track M&A activity signals in healthcare: SEC filings, media sentiment, regulatory approvals",
    recommendedTools: ["sec_edgar", "gdelt_search", "gdelt_context", "federal_register", "opensecrets_lobbying"],
    maxTokenBudget: 1500,
    promptContext: `## Domain Intelligence: Healthcare M&A Signal Detection

### Signal Sources (Priority Order)
1. **SEC EDGAR 8-K filings**: Material events — acquisition announcements, divestitures, asset purchases
2. **SEC S-4 filings**: Merger registration statements — definitive signal
3. **GDELT Media Monitoring**: Sentiment shifts around companies (acquisition rumors, strategic reviews)
4. **Federal Register**: DOJ/FTC antitrust review notices, merger clearance
5. **OpenSecrets Lobbying**: Shifts in lobbying spend patterns (often precede deals)

### M&A Signal Taxonomy
| Signal Type | Source | Confidence |
|-------------|--------|------------|
| 8-K Material Event | SEC EDGAR | HIGH |
| S-4 Registration | SEC EDGAR | CONFIRMED |
| Antitrust Filing | Federal Register | HIGH |
| Media Rumor Surge | GDELT | MEDIUM |
| Lobbying Spike | OpenSecrets | LOW-MEDIUM |
| Executive Changes | SEC/GDELT | LOW |

### Healthcare M&A Patterns
- **Payer consolidation**: Mega-mergers (UHC/Change, Cigna/Express Scripts pattern)
- **Vertical integration**: Payer + PBM + provider acquisitions
- **Health IT rollup**: Platform companies acquiring point solutions
- **Provider consolidation**: Hospital systems merging for scale
- **Value-based care plays**: Payer-provider hybrid models`,
};


const PRODUCT_HUNTER: PlatformSkill = {
    id: "product-hunter",
    name: "Product Hunter",
    description: "Competitive product discovery and analysis for healthcare technology",
    recommendedTools: ["web_search", "semantic_scholar", "gdelt_search"],
    maxTokenBudget: 1000,
    promptContext: `## Domain Intelligence: Product Discovery

### Research Workflow
1. Identify target product category or competitor
2. Web search for product pages, pricing, reviews, case studies
3. Search academic literature for technology validation
4. Check media coverage for market reception and adoption signals
5. Analyze integration ecosystem and partnerships

### Evaluation Framework
- **Capability depth**: Feature completeness vs. our solution
- **Market validation**: Customer logos, case studies, analyst coverage
- **Technology approach**: Architecture, cloud platform, API maturity
- **Go-to-market**: Pricing model, sales motion, target segments
- **Momentum**: Funding, hiring, press volume, conference presence`,
};

const DRUG_PIPELINE_INTEL: PlatformSkill = {
    id: "drug-pipeline-intel",
    name: "Drug Pipeline Intelligence",
    description: "Clinical trial landscape, FDA approval pathways, patent cliffs, biosimilar entry, specialty drug economics",
    recommendedTools: ["clinical_trials", "openfda", "pubmed_search", "semantic_scholar", "gdelt_search"],
    maxTokenBudget: 2500,
    promptContext: `## Domain Intelligence: Drug Pipeline Analysis

### Clinical Trial Landscape Framework
Use ClinicalTrials.gov to map the full pipeline for any therapeutic area or company:

| Phase | What It Means | Typical Duration | Success Rate |
|-------|---------------|------------------|--------------|
| Phase 1 | Safety/dosing in healthy volunteers | 1-2 years | ~63% |
| Phase 2 | Efficacy in patients + dose-finding | 2-3 years | ~31% |
| Phase 3 | Large-scale efficacy + safety confirmation | 2-4 years | ~58% |
| Phase 4 | Post-marketing surveillance | Ongoing | N/A |
| NDA/BLA Filed | Under FDA review | 6-12 months | ~85% |

**Overall probability**: Phase 1 → Approval ≈ 7-12% (higher for oncology, lower for CNS)

### FDA Approval Pathways
| Pathway | Timeline | Criteria | Implication |
|---------|----------|----------|-------------|
| Standard Review | 10-12 months | Normal | Predictable timeline |
| Priority Review | 6 months | Serious condition + meaningful advance | Faster market entry |
| Breakthrough Therapy | Expedited | Substantial improvement over existing | Strong efficacy signal |
| Accelerated Approval | Variable | Surrogate endpoint | Conditional — post-marketing confirmation required |
| Fast Track | Variable | Serious condition + unmet need | Rolling review possible |
| RTOR (Real-Time Oncology Review) | 30 days | Select oncology | Fastest path for cancer drugs |

### Patent Cliff Analysis
Track patent expirations using SEC filings + GDELT media monitoring:
- **Composition of matter** patents (strongest protection, typically 20 years from filing)
- **Method of use** patents (narrower, can sometimes be designed around)
- **Formulation** patents (may delay generics but weaker defense)
- **Paragraph IV certifications**: Generic manufacturer challenges — search GDELT for ANDA filings
- **Patent dance** (biosimilars): 180-day notice period for BPCIA process

### Major Patent Cliffs (2025-2030)
| Drug | Company | Revenue | LOE Date | Impact |
|------|---------|---------|----------|--------|
| Keytruda (pembrolizumab) | Merck | ~$25B | 2028 | Largest single-product LOE in history |
| Eliquis (apixaban) | BMS/Pfizer | ~$18B | 2026-2028 | Generics entering |
| Opdivo (nivolumab) | BMS | ~$9B | 2028 | Biosimilar competition |
| Imbruvica (ibrutinib) | AbbVie/J&J | ~$5B | 2027 | Generic erosion |
| Stelara (ustekinumab) | J&J | ~$10B | 2025 | Biosimilars launched |
| Humira (adalimumab) | AbbVie | ~$8B | 2023 (biosimilar era) | Multiple biosimilars live |

### Biosimilar Intelligence
- **Approved biosimilars**: Search openFDA for Purple Book data
- **Interchangeability**: Higher bar than biosimilarity — allows pharmacy-level substitution
- **Uptake tracking**: Monitor market share via GDELT + SEC earnings
- **Pricing dynamics**: Biosimilars typically launch at 15-35% discount; deepen over 3-5 years

### GLP-1 / Obesity Market (2024-2030)
The single most disruptive drug class in a generation:
| Drug | Company | Indication | Status |
|------|---------|-----------|--------|
| Ozempic (semaglutide) | Novo Nordisk | T2D | Approved |
| Wegovy (semaglutide) | Novo Nordisk | Obesity + CV risk | Approved |
| Mounjaro (tirzepatide) | Eli Lilly | T2D | Approved |
| Zepbound (tirzepatide) | Eli Lilly | Obesity | Approved |
| Rybelsus (oral semaglutide) | Novo Nordisk | T2D | Approved |
| Orforglipron (oral GLP-1) | Eli Lilly | T2D/Obesity | Phase 3 |
| Survodutide (dual GLP-1/glucagon) | BI/Zealand | NASH/Obesity | Phase 3 |
| Amycretin (oral GLP-1/amylin) | Novo Nordisk | Obesity | Phase 2 |

**Market implications**: $100B+ market by 2030. Payer cost pressure is extreme. Adherence analytics critical for Star Ratings (PDC measures).

### Analysis Workflow
1. **Identify drug/company/therapeutic area** of interest
2. **ClinicalTrials.gov search**: Map all active/completed trials, phases, sponsors, enrollment
3. **openFDA check**: Adverse events, recalls, labeling changes, approval history
4. **PubMed literature scan**: Efficacy data, safety signals, meta-analyses, real-world evidence
5. **Semantic Scholar**: Citation analysis — identify the most influential studies
6. **GDELT media**: Narrative monitoring — conference presentations, analyst coverage, media sentiment
7. **SEC EDGAR**: Patent litigation, revenue guidance, pipeline updates in 10-K/10-Q

### Output Framework
For any drug pipeline analysis, produce:
- Pipeline map (phase distribution, enrollment counts)
- Competitive landscape (who else is in the space)
- Regulatory pathway and timeline estimate
- Patent/exclusivity status and LOE forecast
- Market sizing and payer impact estimate
- Risk factors (clinical hold, safety signals, manufacturing)`,
};


// ─── Skill Registry ─────────────────────────────────────────

const SKILL_REGISTRY = new Map<string, PlatformSkill>([
    ["healthcare-quality-analytics", HEALTHCARE_QUALITY_ANALYTICS],
    ["stars-2027-navigator", STARS_2027_NAVIGATOR],
    ["payer-financial-decoder", PAYER_FINANCIAL_DECODER],
    ["regulatory-radar", REGULATORY_RADAR],
    ["competitor-battlecard", COMPETITOR_BATTLECARD],
    ["deal-room-intelligence", DEAL_ROOM_INTELLIGENCE],
    ["healthcare-ma-signal-hunter", HEALTHCARE_MA_SIGNAL_HUNTER],
    ["drug-pipeline-intel", DRUG_PIPELINE_INTEL],
    ["product-hunter", PRODUCT_HUNTER],
]);


// ─── Skill Router ───────────────────────────────────────────

/**
 * Platform Skill Router
 * 
 * Resolves skill names to skill content for prompt injection.
 * Manages token budgets to prevent context window overflow.
 */
export class SkillRouter {
    private skills: Map<string, PlatformSkill>;
    private maxTotalTokenBudget: number;

    constructor(maxTotalTokenBudget: number = 6000) {
        this.skills = SKILL_REGISTRY;
        this.maxTotalTokenBudget = maxTotalTokenBudget;
    }

    /**
     * Get a single skill by ID.
     */
    getSkill(skillId: string): PlatformSkill | undefined {
        return this.skills.get(skillId);
    }

    /**
     * Get all registered skill IDs.
     */
    getAvailableSkillIds(): string[] {
        return Array.from(this.skills.keys());
    }

    /**
     * Resolve compatible skills for an agent and build the prompt injection block.
     * 
     * Returns a formatted string ready to inject into the agent's system prompt.
     * Respects token budgets — if all skills exceed the total budget, they are
     * truncated in priority order (first skill = highest priority).
     */
    buildSkillContext(compatibleSkills: string[]): string {
        if (compatibleSkills.length === 0) return "";

        const resolvedSkills: PlatformSkill[] = [];
        let totalBudget = 0;

        for (const skillId of compatibleSkills) {
            const skill = this.skills.get(skillId);
            if (!skill) continue;

            // Check if adding this skill exceeds total budget
            if (totalBudget + skill.maxTokenBudget > this.maxTotalTokenBudget) {
                // Still include a reference to the skill (just not the full context)
                continue;
            }

            resolvedSkills.push(skill);
            totalBudget += skill.maxTokenBudget;
        }

        if (resolvedSkills.length === 0) return "";

        const sections = resolvedSkills.map(skill =>
            `${skill.promptContext}\n\n### Recommended Tools for ${skill.name}\n${skill.recommendedTools.map(t => `- \`${t}\``).join("\n")}`
        );

        return `\n\n# ═══ PLATFORM SKILL INTELLIGENCE ═══\n\nYou have been augmented with the following domain expertise. Use this intelligence to ground your analysis in domain-specific frameworks, metrics, and terminology.\n\n${sections.join("\n\n---\n\n")}`;
    }

    /**
     * Get just the tool recommendations from skills (for tool proxy routing).
     */
    getRecommendedTools(compatibleSkills: string[]): string[] {
        const tools = new Set<string>();
        for (const skillId of compatibleSkills) {
            const skill = this.skills.get(skillId);
            if (skill) {
                for (const tool of skill.recommendedTools) {
                    tools.add(tool);
                }
            }
        }
        return Array.from(tools);
    }
}


// ─── Singleton ──────────────────────────────────────────────

let _router: SkillRouter | null = null;

export function getSkillRouter(): SkillRouter {
    if (!_router) {
        _router = new SkillRouter();
    }
    return _router;
}
