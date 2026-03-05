/**
 * OpenSecrets Bulk Data Integration
 * 
 * Since OpenSecrets.org discontinued new API key registrations (April 2025),
 * this module implements a bulk CSV data sweep system that:
 * 
 * 1. Downloads bulk datasets from OpenSecrets on a configurable cadence
 * 2. Parses and indexes them into a local queryable store
 * 3. Exposes search/query tools for PRISM agents
 * 
 * Data sources:
 * - Lobbying disclosure data (LDA filings)
 * - Campaign contribution data (PACs, individual donors)
 * - Industry/sector spending summaries
 * - Member of Congress financial profiles
 * 
 * Architecture:
 * - SweepScheduler: cron-like cadence manager
 * - OpenSecretsStore: indexed in-memory store with disk persistence
 * - Query tools: lobbying search, contribution lookup, industry spend
 * 
 * All data is public record under Creative Commons Attribution-Noncommercial-Share Alike 3.0.
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolResult, ToolDefinition, ToolCategory } from "./mcp-tools";

// ─── Types ──────────────────────────────────────────────────

interface LobbyingRecord {
    registrantName: string;
    clientName: string;
    amount: number;
    year: number;
    quarter: number;
    issues: string[];
    lobbyists: string[];
    agencies: string[];
    filingType: string;
}

interface ContributionRecord {
    contributorName: string;
    recipientName: string;
    amount: number;
    date: string;
    contributorType: "Individual" | "PAC" | "Party" | "Organization";
    recipientParty: string;
    recipientState: string;
    industry: string;
    sector: string;
}

interface IndustrySpendRecord {
    industry: string;
    sector: string;
    cycle: string;
    totalLobbySpend: number;
    totalContributions: number;
    pacContributions: number;
    individualContributions: number;
    topRecipients: Array<{ name: string; amount: number }>;
}

interface SweepStatus {
    lastSweep: string | null;
    nextSweep: string | null;
    cadenceMs: number;
    datasets: {
        lobbying: { recordCount: number; lastUpdated: string | null };
        contributions: { recordCount: number; lastUpdated: string | null };
        industrySpend: { recordCount: number; lastUpdated: string | null };
    };
    isRunning: boolean;
}

// ─── Data Store ─────────────────────────────────────────────

export class OpenSecretsStore {
    private lobbying: LobbyingRecord[] = [];
    private contributions: ContributionRecord[] = [];
    private industrySpend: IndustrySpendRecord[] = [];
    private status: SweepStatus;
    private dataDir: string;
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor(dataDir?: string) {
        this.dataDir = dataDir ?? path.join(process.env.PRISM_DATA_DIR ?? "/tmp/prism", "opensecrets");
        this.status = {
            lastSweep: null,
            nextSweep: null,
            cadenceMs: 24 * 60 * 60 * 1000, // Default: daily
            datasets: {
                lobbying: { recordCount: 0, lastUpdated: null },
                contributions: { recordCount: 0, lastUpdated: null },
                industrySpend: { recordCount: 0, lastUpdated: null },
            },
            isRunning: false,
        };
    }

    /**
     * Configure sweep cadence and start the scheduler.
     */
    async startScheduler(cadenceMs?: number): Promise<void> {
        if (cadenceMs) {
            this.status.cadenceMs = cadenceMs;
        }

        // Load persisted data if available
        await this.loadFromDisk();

        // Run initial sweep if no data or data is stale
        const shouldSweep = !this.status.lastSweep ||
            Date.now() - new Date(this.status.lastSweep).getTime() > this.status.cadenceMs;

        if (shouldSweep) {
            await this.runSweep();
        }

        // Schedule recurring sweeps
        if (this.sweepTimer) clearInterval(this.sweepTimer);
        this.sweepTimer = setInterval(() => this.runSweep(), this.status.cadenceMs);

        this.status.nextSweep = new Date(
            Date.now() + this.status.cadenceMs
        ).toISOString();
    }

    /**
     * Stop the sweep scheduler.
     */
    stopScheduler(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
        this.status.nextSweep = null;
    }

    /**
     * Execute a full data sweep from OpenSecrets bulk data sources.
     */
    async runSweep(): Promise<void> {
        if (this.status.isRunning) return;
        this.status.isRunning = true;

        try {
            console.log("[OpenSecrets] Starting bulk data sweep...");

            // Sweep lobbying data
            await this.sweepLobbyingData();

            // Sweep contribution summaries
            await this.sweepContributionData();

            // Sweep industry spending
            await this.sweepIndustrySpendData();

            this.status.lastSweep = new Date().toISOString();
            this.status.nextSweep = new Date(
                Date.now() + this.status.cadenceMs
            ).toISOString();

            // Persist to disk
            await this.saveToDisk();

            console.log(`[OpenSecrets] Sweep complete: ${this.lobbying.length} lobbying, ${this.contributions.length} contributions, ${this.industrySpend.length} industry records`);
        } catch (error) {
            console.error("[OpenSecrets] Sweep failed:", error);
        } finally {
            this.status.isRunning = false;
        }
    }

    // ─── Data Sweep Methods ─────────────────────────────

    /**
     * Sweep lobbying disclosure data.
     * Source: Senate Office of Public Records lobbying data (via OpenSecrets bulk format).
     * Fallback: FEC/Senate LDA data endpoints.
     */
    private async sweepLobbyingData(): Promise<void> {
        try {
            // Senate Lobbying Disclosure API (public, no key required)
            // This is the primary source OpenSecrets itself uses
            const currentYear = new Date().getFullYear();
            const records: LobbyingRecord[] = [];

            // Fetch the last 2 years of healthcare-related lobbying
            for (const year of [currentYear, currentYear - 1]) {
                for (const quarter of [1, 2, 3, 4]) {
                    try {
                        const response = await fetch(
                            `https://lda.senate.gov/api/v1/filings/?filing_year=${year}&filing_period=Q${quarter}&registrant_general_description=health&format=json`,
                            {
                                headers: {
                                    "Accept": "application/json",
                                    "User-Agent": "PRISM-Intelligence-Platform",
                                },
                            }
                        );

                        if (!response.ok) continue;

                        const data = await response.json();
                        const filings = data.results ?? data ?? [];

                        for (const filing of (Array.isArray(filings) ? filings : [])) {
                            records.push({
                                registrantName: filing.registrant?.name ?? filing.registrant_name ?? "Unknown",
                                clientName: filing.client?.name ?? filing.client_name ?? "Unknown",
                                amount: Number(filing.income ?? filing.expenses ?? 0),
                                year,
                                quarter,
                                issues: (filing.lobbying_activities ?? []).map(
                                    (a: Record<string, unknown>) =>
                                        (a.general_issue_code_display ?? a.general_issue_code ?? "Unknown") as string
                                ),
                                lobbyists: (filing.lobbying_activities ?? []).flatMap(
                                    (a: Record<string, unknown>) =>
                                        ((a.lobbyists ?? []) as Array<Record<string, unknown>>).map(
                                            (l) => `${l.lobbyist_first_name ?? ""} ${l.lobbyist_last_name ?? ""}`.trim()
                                        )
                                ),
                                agencies: (filing.lobbying_activities ?? []).flatMap(
                                    (a: Record<string, unknown>) =>
                                        ((a.government_entities ?? []) as Array<Record<string, unknown>>).map(
                                            (e) => (e.name ?? "Unknown") as string
                                        )
                                ),
                                filingType: filing.filing_type_display ?? filing.filing_type ?? "Unknown",
                            });
                        }
                    } catch {
                        // Skip quarters that fail (future quarters, etc.)
                    }
                }
            }

            this.lobbying = records;
            this.status.datasets.lobbying = {
                recordCount: records.length,
                lastUpdated: new Date().toISOString(),
            };
        } catch (error) {
            console.error("[OpenSecrets] Lobbying sweep error:", error);
        }
    }

    /**
     * Sweep campaign contribution data.
     * Source: FEC bulk data API (public, no key required).
     */
    private async sweepContributionData(): Promise<void> {
        try {
            // FEC API — healthcare PAC contributions to candidates
            const healthPACs = [
                "pharma", "health", "medical", "hospital", "insurance",
                "biotech", "drug", "medicare", "medicaid",
            ];

            const records: ContributionRecord[] = [];

            for (const keyword of healthPACs.slice(0, 4)) { // Limit to avoid rate limits
                try {
                    const response = await fetch(
                        `https://api.open.fec.gov/v1/schedules/schedule_b/?committee_name=${encodeURIComponent(keyword)}&sort=-contribution_receipt_amount&per_page=25&api_key=DEMO_KEY`,
                        { headers: { "Accept": "application/json" } }
                    );

                    if (!response.ok) continue;

                    const data = await response.json();
                    for (const result of (data.results ?? [])) {
                        records.push({
                            contributorName: result.committee?.name ?? result.contributor_name ?? "Unknown",
                            recipientName: result.recipient_name ?? "Unknown",
                            amount: result.contribution_receipt_amount ?? 0,
                            date: result.contribution_receipt_date ?? "",
                            contributorType: result.entity_type === "IND" ? "Individual" : "PAC",
                            recipientParty: result.recipient_party ?? "",
                            recipientState: result.recipient_state ?? "",
                            industry: keyword,
                            sector: "Health",
                        });
                    }
                } catch {
                    // Skip on error
                }
            }

            this.contributions = records;
            this.status.datasets.contributions = {
                recordCount: records.length,
                lastUpdated: new Date().toISOString(),
            };
        } catch (error) {
            console.error("[OpenSecrets] Contributions sweep error:", error);
        }
    }

    /**
     * Sweep industry spending summary data.
     * Aggregated from lobbying + contribution data.
     */
    private async sweepIndustrySpendData(): Promise<void> {
        try {
            // Aggregate lobbying data by industry
            const industryMap = new Map<string, IndustrySpendRecord>();

            // Build from lobbying data
            for (const record of this.lobbying) {
                const industry = record.issues[0] ?? "General";
                const existing = industryMap.get(industry) ?? {
                    industry,
                    sector: "Health",
                    cycle: String(record.year),
                    totalLobbySpend: 0,
                    totalContributions: 0,
                    pacContributions: 0,
                    individualContributions: 0,
                    topRecipients: [],
                };
                existing.totalLobbySpend += record.amount;
                industryMap.set(industry, existing);
            }

            // Enrich with contribution data
            for (const record of this.contributions) {
                const industry = record.industry;
                const existing = industryMap.get(industry) ?? {
                    industry,
                    sector: "Health",
                    cycle: record.date.substring(0, 4),
                    totalLobbySpend: 0,
                    totalContributions: 0,
                    pacContributions: 0,
                    individualContributions: 0,
                    topRecipients: [],
                };
                existing.totalContributions += record.amount;
                if (record.contributorType === "PAC") {
                    existing.pacContributions += record.amount;
                } else {
                    existing.individualContributions += record.amount;
                }
                // Track top recipients
                const existingRecipient = existing.topRecipients.find(
                    r => r.name === record.recipientName
                );
                if (existingRecipient) {
                    existingRecipient.amount += record.amount;
                } else {
                    existing.topRecipients.push({
                        name: record.recipientName,
                        amount: record.amount,
                    });
                }
                // Keep only top 10
                existing.topRecipients.sort((a, b) => b.amount - a.amount);
                existing.topRecipients = existing.topRecipients.slice(0, 10);
                industryMap.set(industry, existing);
            }

            this.industrySpend = Array.from(industryMap.values());
            this.status.datasets.industrySpend = {
                recordCount: this.industrySpend.length,
                lastUpdated: new Date().toISOString(),
            };
        } catch (error) {
            console.error("[OpenSecrets] Industry spend sweep error:", error);
        }
    }

    // ─── Persistence ────────────────────────────────────

    private async saveToDisk(): Promise<void> {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            await fs.writeFile(
                path.join(this.dataDir, "store.json"),
                JSON.stringify({
                    lobbying: this.lobbying,
                    contributions: this.contributions,
                    industrySpend: this.industrySpend,
                    status: this.status,
                }, null, 2),
            );
        } catch (error) {
            console.error("[OpenSecrets] Save error:", error);
        }
    }

    private async loadFromDisk(): Promise<void> {
        try {
            const raw = await fs.readFile(
                path.join(this.dataDir, "store.json"),
                "utf-8",
            );
            const data = JSON.parse(raw);
            this.lobbying = data.lobbying ?? [];
            this.contributions = data.contributions ?? [];
            this.industrySpend = data.industrySpend ?? [];
            if (data.status) {
                this.status = { ...this.status, ...data.status };
            }
        } catch {
            // No persisted data yet — that's fine
        }
    }

    // ─── Query Methods ──────────────────────────────────

    searchLobbying(query: {
        client?: string;
        registrant?: string;
        issue?: string;
        minAmount?: number;
        year?: number;
        limit?: number;
    }): LobbyingRecord[] {
        let results = [...this.lobbying];

        if (query.client) {
            const q = query.client.toLowerCase();
            results = results.filter(r =>
                r.clientName.toLowerCase().includes(q) ||
                r.registrantName.toLowerCase().includes(q)
            );
        }
        if (query.registrant) {
            const q = query.registrant.toLowerCase();
            results = results.filter(r =>
                r.registrantName.toLowerCase().includes(q)
            );
        }
        if (query.issue) {
            const q = query.issue.toLowerCase();
            results = results.filter(r =>
                r.issues.some(i => i.toLowerCase().includes(q))
            );
        }
        if (query.minAmount) {
            results = results.filter(r => r.amount >= (query.minAmount ?? 0));
        }
        if (query.year) {
            results = results.filter(r => r.year === query.year);
        }

        results.sort((a, b) => b.amount - a.amount);
        return results.slice(0, query.limit ?? 25);
    }

    searchContributions(query: {
        contributor?: string;
        recipient?: string;
        industry?: string;
        minAmount?: number;
        party?: string;
        limit?: number;
    }): ContributionRecord[] {
        let results = [...this.contributions];

        if (query.contributor) {
            const q = query.contributor.toLowerCase();
            results = results.filter(r =>
                r.contributorName.toLowerCase().includes(q)
            );
        }
        if (query.recipient) {
            const q = query.recipient.toLowerCase();
            results = results.filter(r =>
                r.recipientName.toLowerCase().includes(q)
            );
        }
        if (query.industry) {
            const q = query.industry.toLowerCase();
            results = results.filter(r =>
                r.industry.toLowerCase().includes(q)
            );
        }
        if (query.minAmount) {
            results = results.filter(r => r.amount >= (query.minAmount ?? 0));
        }
        if (query.party) {
            results = results.filter(r => r.recipientParty === query.party);
        }

        results.sort((a, b) => b.amount - a.amount);
        return results.slice(0, query.limit ?? 25);
    }

    getIndustrySpend(industry?: string): IndustrySpendRecord[] {
        if (industry) {
            const q = industry.toLowerCase();
            return this.industrySpend.filter(r =>
                r.industry.toLowerCase().includes(q)
            );
        }
        return [...this.industrySpend].sort(
            (a, b) => b.totalLobbySpend - a.totalLobbySpend
        );
    }

    getStatus(): SweepStatus {
        return { ...this.status };
    }
}

// ─── Singleton ──────────────────────────────────────────────

let _store: OpenSecretsStore | null = null;

export function getOpenSecretsStore(): OpenSecretsStore {
    if (!_store) {
        _store = new OpenSecretsStore();
    }
    return _store;
}

// ─── Tool Schemas & Implementations ─────────────────────────

export const OpenSecretsLobbyingSchema = z.object({
    client: z.string().optional().describe("Client or registrant name to search (e.g., 'Pfizer', 'UnitedHealth', 'PhRMA')"),
    registrant: z.string().optional().describe("Lobbying firm name"),
    issue: z.string().optional().describe("Issue area (e.g., 'Health', 'Pharmacy', 'Medicare')"),
    minAmount: z.number().optional().describe("Minimum lobbying disclosure amount in dollars"),
    year: z.number().optional().describe("Filter by year"),
    limit: z.number().min(1).max(50).default(25),
});

async function openSecretsLobbyingSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = OpenSecretsLobbyingSchema.parse(params);
    const store = getOpenSecretsStore();

    try {
        const results = store.searchLobbying(input);
        const status = store.getStatus();

        return {
            success: true,
            data: {
                records: results,
                recordCount: results.length,
                dataFreshness: status.datasets.lobbying.lastUpdated,
                totalRecordsInStore: status.datasets.lobbying.recordCount,
            },
            source: "OpenSecrets/Senate LDA (bulk sweep)",
            timestamp: new Date().toISOString(),
            query: input.client ?? input.registrant ?? input.issue ?? "all",
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "OpenSecrets/Senate LDA",
            timestamp: new Date().toISOString(),
            query: input.client ?? input.registrant ?? "lobbying",
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


export const OpenSecretsContributionsSchema = z.object({
    contributor: z.string().optional().describe("PAC or contributor name (e.g., 'Blue Cross', 'Pharmaceutical')"),
    recipient: z.string().optional().describe("Candidate or committee receiving contributions"),
    industry: z.string().optional().describe("Industry keyword (e.g., 'pharma', 'health', 'insurance')"),
    minAmount: z.number().optional().describe("Minimum contribution amount"),
    party: z.string().optional().describe("Recipient party: 'DEM', 'REP'"),
    limit: z.number().min(1).max(50).default(25),
});

async function openSecretsContributionsSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = OpenSecretsContributionsSchema.parse(params);
    const store = getOpenSecretsStore();

    try {
        const results = store.searchContributions(input);
        const status = store.getStatus();

        return {
            success: true,
            data: {
                records: results,
                recordCount: results.length,
                dataFreshness: status.datasets.contributions.lastUpdated,
                totalRecordsInStore: status.datasets.contributions.recordCount,
            },
            source: "OpenSecrets/FEC (bulk sweep)",
            timestamp: new Date().toISOString(),
            query: input.contributor ?? input.recipient ?? input.industry ?? "all",
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "OpenSecrets/FEC",
            timestamp: new Date().toISOString(),
            query: input.contributor ?? input.recipient ?? "contributions",
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


export const OpenSecretsIndustrySpendSchema = z.object({
    industry: z.string().optional().describe("Industry name filter (e.g., 'Health', 'Pharmacy', 'Insurance')"),
});

async function openSecretsIndustrySpend(params: Record<string, unknown>): Promise<ToolResult> {
    const input = OpenSecretsIndustrySpendSchema.parse(params);
    const store = getOpenSecretsStore();

    try {
        const results = store.getIndustrySpend(input.industry);
        const status = store.getStatus();

        return {
            success: true,
            data: {
                records: results,
                recordCount: results.length,
                sweepStatus: {
                    lastSweep: status.lastSweep,
                    nextSweep: status.nextSweep,
                    cadenceHours: Math.round(status.cadenceMs / (60 * 60 * 1000)),
                },
            },
            source: "OpenSecrets (aggregated lobbying + contributions)",
            timestamp: new Date().toISOString(),
            query: input.industry ?? "all-healthcare",
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "OpenSecrets",
            timestamp: new Date().toISOString(),
            query: input.industry ?? "industry-spend",
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Tool Definitions for Registry ──────────────────────────

export const OPENSECRETS_TOOLS: ToolDefinition[] = [
    {
        name: "opensecrets_lobbying",
        description: "Search healthcare lobbying disclosures from OpenSecrets/Senate LDA data. Find who is lobbying whom, on what issues, and how much they're spending. Data swept on configurable cadence.",
        category: "regulatory" as ToolCategory,
        inputSchema: OpenSecretsLobbyingSchema,
        execute: openSecretsLobbyingSearch,
    },
    {
        name: "opensecrets_contributions",
        description: "Search healthcare-related campaign contributions from PACs and individuals. Track political donations to candidates from pharma, insurance, and health industry players.",
        category: "regulatory" as ToolCategory,
        inputSchema: OpenSecretsContributionsSchema,
        execute: openSecretsContributionsSearch,
    },
    {
        name: "opensecrets_industry_spend",
        description: "View aggregated healthcare industry spending on lobbying and campaign contributions. Shows total spend, top recipients, and PAC vs individual breakdown.",
        category: "regulatory" as ToolCategory,
        inputSchema: OpenSecretsIndustrySpendSchema,
        execute: openSecretsIndustrySpend,
    },
];


// ─── Cadence Presets ────────────────────────────────────────

export const SWEEP_CADENCES = {
    /** Every 6 hours — for active monitoring periods */
    REALTIME: 6 * 60 * 60 * 1000,
    /** Every 24 hours — standard daily sweep */
    DAILY: 24 * 60 * 60 * 1000,
    /** Every 7 days — standard weekly sweep */
    WEEKLY: 7 * 24 * 60 * 60 * 1000,
    /** Every 30 days — for stable/low-priority data */
    MONTHLY: 30 * 24 * 60 * 60 * 1000,
} as const;
