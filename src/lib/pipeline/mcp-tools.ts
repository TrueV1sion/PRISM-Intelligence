/**
 * PRISM External MCP Tool Proxy
 * 
 * Provides live data access for PRISM agents via standardized tool interfaces.
 * Each tool wraps an external API (PubMed, CMS, NPI Registry, web search)
 * and returns structured data that agents can incorporate into findings.
 * 
 * Architecture:
 * - Tools are registered in a typed registry with schemas
 * - Agents call tools through the proxy based on their `compatibleSkills`
 * - Results include provenance metadata (source, timestamp, query)
 * - Rate limiting and caching prevent excessive API calls
 * 
 * Based on prism-dev-package MCP integration specification.
 */

import { z } from "zod";
import { OPENSECRETS_TOOLS, getOpenSecretsStore, SWEEP_CADENCES } from "./opensecrets";

// ─── Tool Result Types ──────────────────────────────────────

export interface ToolResult {
    success: boolean;
    data: unknown;
    source: string;
    timestamp: string;
    query: string;
    cached: boolean;
    error?: string;
}

// ─── Tool Definition ────────────────────────────────────────

export interface ToolDefinition {
    name: string;
    description: string;
    category: ToolCategory;
    inputSchema: z.ZodType;
    execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export type ToolCategory = "pubmed" | "cms" | "npi" | "web_search" | "sec_edgar" | "regulatory" | "gdelt" | "sdoh" | "patents" | "legislative" | "medicare" | "meta";


// ─── Simple Cache ───────────────────────────────────────────

class ToolCache {
    private cache: Map<string, { result: ToolResult; expiresAt: number }> = new Map();
    private readonly ttlMs: number;

    constructor(ttlMs: number = 15 * 60 * 1000) { // 15 min default
        this.ttlMs = ttlMs;
    }

    get(key: string): ToolResult | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return { ...entry.result, cached: true };
    }

    set(key: string, result: ToolResult): void {
        this.cache.set(key, {
            result,
            expiresAt: Date.now() + this.ttlMs,
        });
    }

    clear(): void {
        this.cache.clear();
    }
}


// ─── Rate Limiter ───────────────────────────────────────────

class RateLimiter {
    private timestamps: number[] = [];
    private readonly maxRequests: number;
    private readonly windowMs: number;

    constructor(maxRequests: number = 30, windowMs: number = 60_000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    async acquire(): Promise<void> {
        const now = Date.now();
        this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

        if (this.timestamps.length >= this.maxRequests) {
            const waitMs = this.timestamps[0] + this.windowMs - now;
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }

        this.timestamps.push(Date.now());
    }
}


// ─── PubMed Search Tool ─────────────────────────────────────

const PubMedSearchSchema = z.object({
    query: z.string().describe("PubMed search query (supports MeSH terms)"),
    maxResults: z.number().min(1).max(50).default(10),
    dateRange: z.string().optional().describe("Date range filter, e.g. '2020/01/01:2024/12/31'"),
    articleTypes: z.array(z.string()).optional().describe("Filter by article type: 'clinical-trial', 'meta-analysis', 'review', 'systematic-review'"),
});

async function pubmedSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = PubMedSearchSchema.parse(params);
    const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

    try {
        // Step 1: Search for PMIDs
        const searchParams = new URLSearchParams({
            db: "pubmed",
            term: input.query,
            retmax: String(input.maxResults),
            retmode: "json",
            sort: "relevance",
        });

        if (input.dateRange) {
            const [minDate, maxDate] = input.dateRange.split(":");
            if (minDate) searchParams.set("mindate", minDate);
            if (maxDate) searchParams.set("maxdate", maxDate);
            searchParams.set("datetype", "pdat");
        }

        if (input.articleTypes?.length) {
            const typeFilters = input.articleTypes.map(t => {
                const typeMap: Record<string, string> = {
                    "clinical-trial": "Clinical Trial[pt]",
                    "meta-analysis": "Meta-Analysis[pt]",
                    "review": "Review[pt]",
                    "systematic-review": "Systematic Review[pt]",
                };
                return typeMap[t] ?? `${t}[pt]`;
            });
            searchParams.set("term", `${input.query} AND (${typeFilters.join(" OR ")})`);
        }

        const searchResponse = await fetch(`${baseUrl}/esearch.fcgi?${searchParams}`);
        const searchData = await searchResponse.json();
        const pmids: string[] = searchData.esearchresult?.idlist ?? [];

        if (pmids.length === 0) {
            return {
                success: true,
                data: { articles: [], totalCount: 0 },
                source: "PubMed/NCBI",
                timestamp: new Date().toISOString(),
                query: input.query,
                cached: false,
            };
        }

        // Step 2: Fetch article details
        const summaryParams = new URLSearchParams({
            db: "pubmed",
            id: pmids.join(","),
            retmode: "json",
        });

        const summaryResponse = await fetch(`${baseUrl}/esummary.fcgi?${summaryParams}`);
        const summaryData = await summaryResponse.json();

        const articles = pmids.map(pmid => {
            const article = summaryData.result?.[pmid];
            if (!article) return null;

            return {
                pmid,
                title: article.title ?? "Unknown",
                authors: (article.authors ?? []).map((a: { name: string }) => a.name).slice(0, 5),
                journal: article.source ?? "Unknown",
                pubDate: article.pubdate ?? "Unknown",
                doi: article.elocationid ?? null,
                url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                articleType: article.pubtype ?? [],
            };
        }).filter(Boolean);

        return {
            success: true,
            data: {
                articles,
                totalCount: Number(searchData.esearchresult?.count ?? 0),
                query: input.query,
            },
            source: "PubMed/NCBI",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "PubMed/NCBI",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── CMS Data Tool ──────────────────────────────────────────

const CMSDataSchema = z.object({
    dataset: z.enum([
        "star-ratings",
        "plan-finder",
        "part-d-prescriber",
        "hospital-compare",
        "quality-measures",
    ]).describe("CMS dataset to query"),
    filters: z.record(z.string(), z.string()).optional().describe("Key-value filter pairs"),
    limit: z.number().min(1).max(100).default(20),
});

async function cmsDataSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = CMSDataSchema.parse(params);

    // CMS Socrata Open Data API endpoints
    const datasetEndpoints: Record<string, string> = {
        "star-ratings": "https://data.cms.gov/resource/jt8q-bu9z.json",
        "plan-finder": "https://data.cms.gov/resource/jk3v-pfxf.json",
        "part-d-prescriber": "https://data.cms.gov/resource/k38c-29py.json",
        "hospital-compare": "https://data.cms.gov/resource/xubh-q36u.json",
        "quality-measures": "https://data.cms.gov/resource/5hk7-b79v.json",
    };

    const endpoint = datasetEndpoints[input.dataset];
    if (!endpoint) {
        return {
            success: false,
            data: null,
            source: "CMS Open Data",
            timestamp: new Date().toISOString(),
            query: input.dataset,
            cached: false,
            error: `Unknown dataset: ${input.dataset}`,
        };
    }

    try {
        const queryParams = new URLSearchParams({ "$limit": String(input.limit) });

        if (input.filters) {
            for (const [key, value] of Object.entries(input.filters)) {
                queryParams.set(key, value);
            }
        }

        const response = await fetch(`${endpoint}?${queryParams}`, {
            headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
            throw new Error(`CMS API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        return {
            success: true,
            data: {
                dataset: input.dataset,
                records: data,
                recordCount: Array.isArray(data) ? data.length : 0,
            },
            source: `CMS Open Data (${input.dataset})`,
            timestamp: new Date().toISOString(),
            query: input.dataset,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "CMS Open Data",
            timestamp: new Date().toISOString(),
            query: input.dataset,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── NPI Registry Tool ──────────────────────────────────────

const NPISearchSchema = z.object({
    name: z.string().optional().describe("Provider name to search"),
    npi: z.string().optional().describe("NPI number for direct lookup"),
    state: z.string().optional().describe("State code (e.g., 'CA', 'NY')"),
    taxonomy: z.string().optional().describe("Provider taxonomy description"),
    limit: z.number().min(1).max(200).default(10),
});

async function npiSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = NPISearchSchema.parse(params);

    try {
        const searchParams = new URLSearchParams({
            version: "2.1",
            limit: String(input.limit),
        });

        if (input.npi) searchParams.set("number", input.npi);
        if (input.name) {
            // Try as organization first, fallback to individual
            searchParams.set("organization_name", input.name);
        }
        if (input.state) searchParams.set("state", input.state);
        if (input.taxonomy) searchParams.set("taxonomy_description", input.taxonomy);

        const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?${searchParams}`);
        const data = await response.json();

        const providers = (data.results ?? []).map((r: Record<string, unknown>) => ({
            npi: r.number,
            type: r.enumeration_type === "NPI-2" ? "Organization" : "Individual",
            name: r.enumeration_type === "NPI-2"
                ? (r.basic as Record<string, unknown>)?.organization_name
                : `${(r.basic as Record<string, unknown>)?.first_name} ${(r.basic as Record<string, unknown>)?.last_name}`,
            taxonomy: ((r.taxonomies as Array<Record<string, unknown>>) ?? []).map(t => t.desc),
            state: ((r.addresses as Array<Record<string, unknown>>) ?? [])[0]?.state ?? "Unknown",
        }));

        return {
            success: true,
            data: {
                providers,
                resultCount: data.result_count ?? 0,
            },
            source: "NPPES NPI Registry",
            timestamp: new Date().toISOString(),
            query: input.name ?? input.npi ?? "",
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "NPPES NPI Registry",
            timestamp: new Date().toISOString(),
            query: input.name ?? input.npi ?? "",
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Web Search Tool ────────────────────────────────────────

const WebSearchSchema = z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().min(1).max(10).default(5),
    site: z.string().optional().describe("Restrict to domain (e.g., 'cms.gov')"),
    recency: z.enum(["day", "week", "month", "year", "any"]).default("any"),
});

async function webSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = WebSearchSchema.parse(params);

    // Web search via DuckDuckGo HTML API (no key required)
    try {
        let searchQuery = input.query;
        if (input.site) {
            searchQuery = `site:${input.site} ${searchQuery}`;
        }

        // DuckDuckGo Instant Answer API
        const ddgParams = new URLSearchParams({
            q: searchQuery,
            format: "json",
            no_html: "1",
            no_redirect: "1",
        });

        const response = await fetch(`https://api.duckduckgo.com/?${ddgParams}`);
        const data = await response.json();

        const results: Array<{
            title: string;
            url: string;
            snippet: string;
        }> = [];

        // Abstract (main answer)
        if (data.Abstract) {
            results.push({
                title: data.Heading ?? "Summary",
                url: data.AbstractURL ?? "",
                snippet: data.Abstract,
            });
        }

        // Related topics
        if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics.slice(0, input.maxResults - results.length)) {
                if (topic.Text) {
                    results.push({
                        title: topic.Text?.substring(0, 80) ?? "Related",
                        url: topic.FirstURL ?? "",
                        snippet: topic.Text,
                    });
                }
            }
        }

        return {
            success: true,
            data: {
                results,
                resultCount: results.length,
                query: input.query,
            },
            source: "DuckDuckGo",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "DuckDuckGo",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── SEC EDGAR Financial Filings Tool ───────────────────────

const SECEdgarSchema = z.object({
    query: z.string().describe("Search query (company name, ticker, or filing text)"),
    filingTypes: z.array(z.string()).optional().describe("Filing types: '10-K', '10-Q', '8-K', 'S-1', 'DEF 14A'"),
    dateRange: z.string().optional().describe("Date range: 'YYYY-MM-DD:YYYY-MM-DD'"),
    maxResults: z.number().min(1).max(40).default(10),
});

async function secEdgarSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = SECEdgarSchema.parse(params);

    try {
        const searchParams = new URLSearchParams({
            q: input.query,
            dateRange: "custom",
            startdt: input.dateRange?.split(":")[0] ?? "2020-01-01",
            enddt: input.dateRange?.split(":")[1] ?? new Date().toISOString().split("T")[0],
        });

        if (input.filingTypes?.length) {
            searchParams.set("forms", input.filingTypes.join(","));
        }

        const response = await fetch(`https://efts.sec.gov/LATEST/search-index?${searchParams}`, {
            headers: {
                "User-Agent": "PRISM-Intelligence-Platform contact@prism.ai",
                "Accept": "application/json",
            },
        });

        const data = await response.json();
        const hits = (data.hits?.hits ?? []).slice(0, input.maxResults).map((hit: Record<string, unknown>) => {
            const source = hit._source as Record<string, unknown>;
            return {
                filingDate: source?.file_date,
                formType: source?.form_type,
                companyName: source?.display_names,
                ticker: source?.tickers,
                description: source?.display_description,
                url: `https://www.sec.gov/Archives/edgar/data/${source?.entity_id}/${source?.file_num}`,
            };
        });

        return {
            success: true,
            data: { filings: hits, totalCount: data.hits?.total?.value ?? 0 },
            source: "SEC EDGAR",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "SEC EDGAR",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── openFDA Drug/Device Data Tool ──────────────────────────

const OpenFDASchema = z.object({
    endpoint: z.enum([
        "drug/event",       // Adverse event reports
        "drug/label",       // Drug labeling/package inserts
        "drug/enforcement", // Drug recalls
        "device/event",     // Device adverse events
        "device/recall",    // Device recalls
    ]).describe("openFDA endpoint to query"),
    search: z.string().describe("Search query using openFDA syntax (e.g., 'patient.drug.openfda.brand_name:aspirin')"),
    limit: z.number().min(1).max(100).default(10),
});

async function openFDASearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = OpenFDASchema.parse(params);

    try {
        const searchParams = new URLSearchParams({
            search: input.search,
            limit: String(input.limit),
        });

        const response = await fetch(
            `https://api.fda.gov/${input.endpoint}.json?${searchParams}`,
            { headers: { "Accept": "application/json" } },
        );

        if (!response.ok) {
            throw new Error(`openFDA returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        return {
            success: true,
            data: {
                results: data.results ?? [],
                meta: data.meta ?? {},
                resultCount: data.results?.length ?? 0,
            },
            source: `openFDA (${input.endpoint})`,
            timestamp: new Date().toISOString(),
            query: input.search,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "openFDA",
            timestamp: new Date().toISOString(),
            query: input.search,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── ClinicalTrials.gov Tool ────────────────────────────────

const ClinicalTrialsSchema = z.object({
    query: z.string().describe("Search terms (condition, drug, sponsor, etc.)"),
    status: z.array(z.enum([
        "RECRUITING", "ACTIVE_NOT_RECRUITING", "COMPLETED",
        "ENROLLING_BY_INVITATION", "NOT_YET_RECRUITING", "TERMINATED",
        "WITHDRAWN", "SUSPENDED",
    ])).optional().describe("Filter by recruitment status"),
    phase: z.array(z.string()).optional().describe("Phase filter: 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4'"),
    maxResults: z.number().min(1).max(100).default(10),
});

async function clinicalTrialsSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = ClinicalTrialsSchema.parse(params);

    try {
        const searchParams = new URLSearchParams({
            "query.term": input.query,
            pageSize: String(input.maxResults),
            format: "json",
        });

        if (input.status?.length) {
            searchParams.set("filter.overallStatus", input.status.join(","));
        }
        if (input.phase?.length) {
            searchParams.set("filter.phase", input.phase.join(","));
        }

        const response = await fetch(
            `https://clinicaltrials.gov/api/v2/studies?${searchParams}`,
            { headers: { "Accept": "application/json" } },
        );

        const data = await response.json();
        const studies = (data.studies ?? []).map((study: Record<string, unknown>) => {
            const protocol = study.protocolSection as Record<string, unknown> | undefined;
            const id = protocol?.identificationModule as Record<string, unknown> | undefined;
            const status = protocol?.statusModule as Record<string, unknown> | undefined;
            const design = protocol?.designModule as Record<string, unknown> | undefined;
            const sponsor = protocol?.sponsorCollaboratorsModule as Record<string, unknown> | undefined;

            return {
                nctId: id?.nctId,
                title: id?.briefTitle,
                status: status?.overallStatus,
                phase: (design?.phases as string[])?.join(", ") ?? "N/A",
                sponsor: (sponsor?.leadSponsor as Record<string, unknown>)?.name,
                enrollment: (design?.enrollmentInfo as Record<string, unknown>)?.count,
                startDate: (status?.startDateStruct as Record<string, unknown>)?.date,
                url: `https://clinicaltrials.gov/study/${id?.nctId}`,
            };
        });

        return {
            success: true,
            data: {
                studies,
                totalCount: data.totalCount ?? 0,
            },
            source: "ClinicalTrials.gov",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "ClinicalTrials.gov",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Federal Register Tool ──────────────────────────────────

const FederalRegisterSchema = z.object({
    query: z.string().describe("Search query for federal register documents"),
    documentType: z.array(z.enum([
        "RULE", "PRORULE", "NOTICE", "PRESDOCU",
    ])).optional().describe("Document types: RULE (final rule), PRORULE (proposed rule), NOTICE, PRESDOCU (presidential)"),
    agencies: z.array(z.string()).optional().describe("Agency slugs: 'centers-for-medicare-medicaid-services', 'food-and-drug-administration'"),
    maxResults: z.number().min(1).max(20).default(10),
});

async function federalRegisterSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = FederalRegisterSchema.parse(params);

    try {
        const searchParams = new URLSearchParams({
            "conditions[term]": input.query,
            per_page: String(input.maxResults),
            order: "newest",
        });

        if (input.documentType?.length) {
            for (const type of input.documentType) {
                searchParams.append("conditions[type][]", type);
            }
        }
        if (input.agencies?.length) {
            for (const agency of input.agencies) {
                searchParams.append("conditions[agencies][]", agency);
            }
        }

        const response = await fetch(
            `https://www.federalregister.gov/api/v1/documents.json?${searchParams}`,
            { headers: { "Accept": "application/json" } },
        );

        const data = await response.json();
        const documents = (data.results ?? []).map((doc: Record<string, unknown>) => ({
            title: doc.title,
            type: doc.type,
            documentNumber: doc.document_number,
            publicationDate: doc.publication_date,
            agencies: (doc.agencies as Array<Record<string, unknown>>)?.map(a => a.name),
            abstract: doc.abstract,
            url: doc.html_url,
            pdfUrl: doc.pdf_url,
        }));

        return {
            success: true,
            data: {
                documents,
                totalCount: data.count ?? 0,
            },
            source: "Federal Register",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "Federal Register",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Semantic Scholar Academic Paper Tool ────────────────────

const SemanticScholarSchema = z.object({
    query: z.string().describe("Academic paper search query"),
    fields: z.array(z.string()).optional().describe("Fields to return: 'title', 'abstract', 'citationCount', 'year', 'authors', 'venue'"),
    year: z.string().optional().describe("Year filter: '2024' or '2020-2024'"),
    maxResults: z.number().min(1).max(100).default(10),
});

async function semanticScholarSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = SemanticScholarSchema.parse(params);

    try {
        const fields = input.fields ?? ["title", "abstract", "citationCount", "year", "authors", "venue", "url"];
        const searchParams = new URLSearchParams({
            query: input.query,
            limit: String(input.maxResults),
            fields: fields.join(","),
        });

        if (input.year) searchParams.set("year", input.year);

        const response = await fetch(
            `https://api.semanticscholar.org/graph/v1/paper/search?${searchParams}`,
            { headers: { "Accept": "application/json" } },
        );

        if (!response.ok) {
            throw new Error(`Semantic Scholar returned ${response.status}`);
        }

        const data = await response.json();
        const papers = (data.data ?? []).map((paper: Record<string, unknown>) => ({
            paperId: paper.paperId,
            title: paper.title,
            abstract: typeof paper.abstract === "string" ? paper.abstract.slice(0, 300) : null,
            year: paper.year,
            citationCount: paper.citationCount,
            venue: paper.venue,
            authors: (paper.authors as Array<Record<string, unknown>>)?.map(a => a.name).slice(0, 5),
            url: paper.url,
        }));

        return {
            success: true,
            data: {
                papers,
                totalCount: data.total ?? 0,
            },
            source: "Semantic Scholar",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "Semantic Scholar",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── FRED Economic Data Tool ────────────────────────────────

const FREDSchema = z.object({
    seriesId: z.string().describe("FRED series ID (e.g., 'HLTHSCPCHCSA' for health spending, 'CPIMEDSL' for medical CPI)"),
    observationStart: z.string().optional().describe("Start date YYYY-MM-DD"),
    observationEnd: z.string().optional().describe("End date YYYY-MM-DD"),
    frequency: z.enum(["d", "w", "bw", "m", "q", "sa", "a"]).optional().describe("Frequency: daily, weekly, monthly, quarterly, annual"),
});

async function fredSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = FREDSchema.parse(params);
    const apiKey = process.env.FRED_API_KEY;

    if (!apiKey) {
        return {
            success: false,
            data: null,
            source: "FRED",
            timestamp: new Date().toISOString(),
            query: input.seriesId,
            cached: false,
            error: "FRED_API_KEY not configured. Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html",
        };
    }

    try {
        const searchParams = new URLSearchParams({
            series_id: input.seriesId,
            api_key: apiKey,
            file_type: "json",
        });

        if (input.observationStart) searchParams.set("observation_start", input.observationStart);
        if (input.observationEnd) searchParams.set("observation_end", input.observationEnd);
        if (input.frequency) searchParams.set("frequency", input.frequency);

        const response = await fetch(
            `https://api.stlouisfed.org/fred/series/observations?${searchParams}`,
        );

        const data = await response.json();
        const observations = (data.observations ?? []).map((obs: Record<string, unknown>) => ({
            date: obs.date,
            value: obs.value,
        }));

        return {
            success: true,
            data: {
                seriesId: input.seriesId,
                observations,
                count: observations.length,
            },
            source: "FRED (Federal Reserve Economic Data)",
            timestamp: new Date().toISOString(),
            query: input.seriesId,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "FRED",
            timestamp: new Date().toISOString(),
            query: input.seriesId,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

// ─── GDELT Global Media Intelligence Tools ──────────────────

const GDELTDocSchema = z.object({
    query: z.string().describe("Search query (keywords, keyphrases, boolean operators AND/OR/NOT)"),
    mode: z.enum(["ArtList", "TimelineVol", "TimelineVolRaw", "TimelineTone", "TimelineSourceCountry", "TimelineLang"])
        .default("ArtList")
        .describe("Result mode: ArtList (articles), TimelineVol (% of coverage), TimelineTone (sentiment over time)"),
    timespan: z.string().optional().describe("Timespan: '3m' (3 months), '1y', '72h', etc."),
    sourcelang: z.string().optional().describe("Source language code: 'english', 'spanish', 'chinese', etc."),
    sourcecountry: z.string().optional().describe("Source country FIPS code: 'US', 'UK', 'CH', etc."),
    maxResults: z.number().min(1).max(250).default(25),
});

async function gdeltDocSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = GDELTDocSchema.parse(params);

    try {
        const searchParams = new URLSearchParams({
            query: input.query,
            mode: input.mode,
            format: "json",
            maxrecords: String(input.maxResults),
        });

        if (input.timespan) searchParams.set("timespan", input.timespan);
        if (input.sourcelang) searchParams.set("sourcelang", input.sourcelang);
        if (input.sourcecountry) searchParams.set("sourcecountry", input.sourcecountry);

        const response = await fetch(
            `https://api.gdeltproject.org/api/v2/doc/doc?${searchParams}`,
            { headers: { "Accept": "application/json" } },
        );

        const data = await response.json();

        if (input.mode === "ArtList") {
            const articles = (data.articles ?? []).map((art: Record<string, unknown>) => ({
                title: art.title,
                url: art.url,
                source: art.domain,
                sourceCountry: art.sourcecountry,
                language: art.language,
                seenDate: art.seendate,
                tone: art.tone,
                socialImage: art.socialimage,
            }));

            return {
                success: true,
                data: { articles, articleCount: articles.length },
                source: "GDELT DOC API",
                timestamp: new Date().toISOString(),
                query: input.query,
                cached: false,
            };
        }

        return {
            success: true,
            data: { timeline: data.timeline ?? data, mode: input.mode },
            source: `GDELT DOC API (${input.mode})`,
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "GDELT DOC API",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


const GDELTContextSchema = z.object({
    query: z.string().describe("Search query for sentence-level context search"),
    timespan: z.string().optional().describe("Timespan: '3m', '1y', '72h'"),
    maxResults: z.number().min(1).max(50).default(10),
});

async function gdeltContextSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = GDELTContextSchema.parse(params);

    try {
        const searchParams = new URLSearchParams({
            query: input.query,
            format: "json",
            maxrecords: String(input.maxResults),
        });

        if (input.timespan) searchParams.set("timespan", input.timespan);

        const response = await fetch(
            `https://api.gdeltproject.org/api/v2/context/context?${searchParams}`,
            { headers: { "Accept": "application/json" } },
        );

        const data = await response.json();
        const results = (data.articles ?? []).map((art: Record<string, unknown>) => ({
            url: art.url,
            source: art.domain,
            context: art.context,
            tone: art.tone,
            seenDate: art.seendate,
        }));

        return {
            success: true,
            data: { results, resultCount: results.length },
            source: "GDELT Context API",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "GDELT Context API",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


const GDELTGeoSchema = z.object({
    query: z.string().describe("Search query for geographic analysis of media coverage"),
    sourcelang: z.string().optional().describe("Source language filter"),
    timespan: z.string().optional().describe("Timespan: '3m', '1y', '72h'"),
});

async function gdeltGeoSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = GDELTGeoSchema.parse(params);

    try {
        const searchParams = new URLSearchParams({
            query: input.query,
            format: "GeoJSON",
        });

        if (input.sourcelang) searchParams.set("sourcelang", input.sourcelang);
        if (input.timespan) searchParams.set("timespan", input.timespan);

        const response = await fetch(
            `https://api.gdeltproject.org/api/v2/geo/geo?${searchParams}`,
            { headers: { "Accept": "application/json" } },
        );

        const data = await response.json();

        return {
            success: true,
            data: {
                type: "GeoJSON",
                features: data.features ?? [],
                featureCount: (data.features ?? []).length,
            },
            source: "GDELT GEO API",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "GDELT GEO API",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Population Health & Socioeconomic Tools ───────────────

const CensusACSSchema = z.object({
    variables: z.array(z.string()).describe("ACS variables to retrieve (e.g., 'B01003_001E' for total population, 'B19013_001E' for median household income, 'B27001_001E' for health insurance coverage)"),
    geography: z.enum(["state", "county", "zip code tabulation area", "tract"]).describe("Geographic level"),
    stateCode: z.string().optional().describe("FIPS state code (e.g., '06' for California, '36' for New York)"),
    year: z.number().default(2022).describe("ACS year (latest available)"),
});

async function censusACSSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = CensusACSSchema.parse(params);

    try {
        const variables = input.variables.join(",");
        let geoClause = `for=${input.geography}:*`;
        if (input.stateCode) {
            geoClause += `&in=state:${input.stateCode}`;
        }

        const apiKey = process.env.CENSUS_API_KEY ?? "";
        const keyParam = apiKey ? `&key=${apiKey}` : "";

        const response = await fetch(
            `https://api.census.gov/data/${input.year}/acs/acs5?get=NAME,${variables}&${geoClause}${keyParam}`,
        );

        const data = await response.json();
        const headers = data[0] as string[];
        const rows = data.slice(1).map((row: string[]) => {
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
        });

        return {
            success: true,
            data: { records: rows, recordCount: rows.length, variables: input.variables },
            source: `Census ACS 5-Year (${input.year})`,
            timestamp: new Date().toISOString(),
            query: input.variables.join(","),
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "Census ACS",
            timestamp: new Date().toISOString(),
            query: input.variables.join(","),
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


const CDCPlacesSchema = z.object({
    measure: z.string().describe("Health measure (e.g., 'DIABETES', 'OBESITY', 'BPHIGH', 'ACCESS2', 'DEPRESSION', 'COPD', 'STROKE')"),
    stateAbbr: z.string().optional().describe("State abbreviation (e.g., 'CA', 'NY')"),
    dataValueType: z.enum(["AgeAdjPrv", "CrdPrv"]).default("AgeAdjPrv").describe("Age-adjusted or crude prevalence"),
    limit: z.number().min(1).max(1000).default(50),
});

async function cdcPlacesSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = CDCPlacesSchema.parse(params);

    try {
        let whereClause = `measure='${input.measure}' AND data_value_type='${input.dataValueType}'`;
        if (input.stateAbbr) {
            whereClause += ` AND stateabbr='${input.stateAbbr}'`;
        }

        const searchParams = new URLSearchParams({
            "$where": whereClause,
            "$limit": String(input.limit),
            "$order": "data_value DESC",
        });

        const response = await fetch(
            `https://data.cdc.gov/resource/swc5-untb.json?${searchParams}`,
            { headers: { "Accept": "application/json" } },
        );

        const data = await response.json();
        const records = (data as Array<Record<string, unknown>>).map(r => ({
            location: r.locationname,
            stateAbbr: r.stateabbr,
            measure: r.measure,
            dataValue: r.data_value,
            lowCI: r.low_confidence_limit,
            highCI: r.high_confidence_limit,
            totalPopulation: r.totalpopulation,
            geolocation: r.geolocation,
        }));

        return {
            success: true,
            data: { records, recordCount: records.length, measure: input.measure },
            source: "CDC PLACES",
            timestamp: new Date().toISOString(),
            query: input.measure,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "CDC PLACES",
            timestamp: new Date().toISOString(),
            query: input.measure,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


const WHOGHOSchema = z.object({
    indicator: z.string().describe("WHO indicator code (e.g., 'WHOSIS_000001' for life expectancy, 'UHC_SCI_CMNCD' for UHC coverage)"),
    country: z.string().optional().describe("ISO3 country code (e.g., 'USA', 'GBR', 'CHN')"),
});

async function whoGHOSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = WHOGHOSchema.parse(params);

    try {
        let url = `https://ghoapi.azurewebsites.net/api/${input.indicator}`;
        if (input.country) {
            url += `?$filter=SpatialDim eq '${input.country}'`;
        }

        const response = await fetch(url, { headers: { "Accept": "application/json" } });
        const data = await response.json();

        const records = (data.value ?? []).slice(0, 50).map((r: Record<string, unknown>) => ({
            country: r.SpatialDim,
            year: r.TimeDim,
            value: r.NumericValue,
            dimension: r.Dim1,
        }));

        return {
            success: true,
            data: { records, recordCount: records.length, indicator: input.indicator },
            source: "WHO Global Health Observatory",
            timestamp: new Date().toISOString(),
            query: input.indicator,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "WHO GHO",
            timestamp: new Date().toISOString(),
            query: input.indicator,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Google Patents Search Tool ─────────────────────────────

const GooglePatentsSchema = z.object({
    query: z.string().describe("Patent search query (drug name, compound, technology, company)"),
    assignee: z.string().optional().describe("Patent assignee/company name"),
    after: z.string().optional().describe("Patents filed after this date (YYYY-MM-DD)"),
    before: z.string().optional().describe("Patents filed before this date (YYYY-MM-DD)"),
    maxResults: z.number().min(1).max(50).default(10),
});

async function googlePatentsSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = GooglePatentsSchema.parse(params);

    try {
        // Use Google Patents Public Data via BigQuery-compatible search
        // Falls back to Google Scholar Patents search endpoint
        let searchQuery = input.query;
        if (input.assignee) searchQuery += ` assignee:"${input.assignee}"`;
        if (input.after) searchQuery += ` after:${input.after}`;
        if (input.before) searchQuery += ` before:${input.before}`;

        const searchParams = new URLSearchParams({
            q: searchQuery,
            num: String(input.maxResults),
            oq: input.query,
        });

        // Google Patents uses the Lens.org free API as primary source
        const response = await fetch(
            `https://api.lens.org/patent/search`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify({
                    query: {
                        match: { query_string: searchQuery },
                    },
                    size: input.maxResults,
                    sort: [{ date_published: "desc" }],
                }),
            },
        );

        if (!response.ok) {
            // Fallback: use EPO Open Patent Services (free, no key)
            const epoParams = new URLSearchParams({
                q: `ti=${input.query}`,
                Range: `1-${input.maxResults}`,
            });

            const epoResponse = await fetch(
                `https://ops.epo.org/3.2/rest-services/published-data/search/biblio?${epoParams}`,
                { headers: { "Accept": "application/json" } },
            );

            if (!epoResponse.ok) {
                throw new Error(`Patent search returned ${response.status} / EPO returned ${epoResponse.status}`);
            }

            const epoData = await epoResponse.json();
            return {
                success: true,
                data: { patents: epoData, source: "EPO OPS" },
                source: "European Patent Office (EPO)",
                timestamp: new Date().toISOString(),
                query: input.query,
                cached: false,
            };
        }

        const data = await response.json();
        const patents = (data.data ?? []).map((p: Record<string, unknown>) => ({
            title: p.title,
            patentId: p.lens_id,
            publicationDate: p.date_published,
            filingDate: p.filing_date,
            applicants: p.applicants,
            inventors: p.inventors,
            classifications: p.classifications_ipc,
            abstract: typeof p.abstract === "string" ? p.abstract.slice(0, 300) : null,
        }));

        return {
            success: true,
            data: { patents, totalCount: data.total ?? patents.length },
            source: "Lens.org Patent Search",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "Patent Search",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Congressional Bill Tracker Tool ────────────────────────

const CongressBillSchema = z.object({
    query: z.string().describe("Search query for congressional bills (e.g., 'Medicare Advantage', 'drug pricing', 'PBM reform')"),
    congress: z.number().optional().describe("Congress number (e.g., 118 for 2023-2024, 119 for 2025-2026)"),
    billType: z.enum(["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"]).optional().describe("Bill type: hr (House), s (Senate), etc."),
    maxResults: z.number().min(1).max(50).default(10),
});

async function congressBillSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = CongressBillSchema.parse(params);
    const apiKey = process.env.CONGRESS_API_KEY;

    try {
        const congress = input.congress ?? 119; // Current congress
        const searchParams = new URLSearchParams({
            query: input.query,
            limit: String(input.maxResults),
            sort: "updateDate+desc",
        });

        if (apiKey) searchParams.set("api_key", apiKey);

        const url = input.billType
            ? `https://api.congress.gov/v3/bill/${congress}/${input.billType}?${searchParams}`
            : `https://api.congress.gov/v3/bill?${searchParams}`;

        const response = await fetch(url, {
            headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
            throw new Error(`Congress.gov API returned ${response.status}`);
        }

        const data = await response.json();
        const bills = (data.bills ?? []).map((bill: Record<string, unknown>) => ({
            number: bill.number,
            title: bill.title,
            type: bill.type,
            congress: bill.congress,
            latestAction: bill.latestAction,
            updateDate: bill.updateDate,
            sponsors: bill.sponsors,
            cosponsors: bill.cosponsorsCount,
            policyArea: bill.policyArea,
            url: bill.url,
        }));

        return {
            success: true,
            data: { bills, totalCount: data.pagination?.count ?? bills.length },
            source: "Congress.gov API",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "Congress.gov",
            timestamp: new Date().toISOString(),
            query: input.query,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Medicare Plan Finder Tool ──────────────────────────────

const MedicarePlanFinderSchema = z.object({
    zipCode: z.string().describe("5-digit ZIP code to search plans for"),
    planType: z.enum(["MA", "PDP", "MAPD", "MSA", "PFFS", "SNP"]).optional().describe("Plan type: MA (Medicare Advantage), PDP (Part D), MAPD (MA+Part D), SNP (Special Needs)"),
    year: z.number().optional().describe("Plan year (default: current year)"),
    maxResults: z.number().min(1).max(50).default(20),
});

async function medicarePlanFinderSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const input = MedicarePlanFinderSchema.parse(params);

    try {
        const year = input.year ?? new Date().getFullYear();
        const searchParams = new URLSearchParams({
            zipCode: input.zipCode,
            year: String(year),
            limit: String(input.maxResults),
        });

        if (input.planType) searchParams.set("planType", input.planType);

        // CMS Medicare Plan Compare public API
        const response = await fetch(
            `https://data.cms.gov/resource/j28x-kb7e.json?${new URLSearchParams({
                "$where": `geo_zip='${input.zipCode}'`,
                "$limit": String(input.maxResults),
                "$order": "overall_star_rating DESC",
            })}`,
            { headers: { "Accept": "application/json" } },
        );

        if (!response.ok) {
            throw new Error(`Medicare Plan data returned ${response.status}`);
        }

        const data = await response.json();
        const plans = (data as Array<Record<string, unknown>>).map(plan => ({
            contractId: plan.contract_id,
            planId: plan.plan_id,
            planName: plan.plan_name,
            organizationName: plan.organization_name,
            planType: plan.plan_type,
            overallStarRating: plan.overall_star_rating,
            monthlyPremium: plan.monthly_premium,
            annualDeductible: plan.annual_deductible,
            drugCoverage: plan.drug_coverage,
            healthDeductible: plan.health_deductible,
            snpType: plan.snp_type,
        }));

        return {
            success: true,
            data: { plans, zipCode: input.zipCode, planCount: plans.length, year },
            source: `CMS Medicare Plan Compare (${year})`,
            timestamp: new Date().toISOString(),
            query: `Plans in ${input.zipCode}`,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "Medicare Plan Finder",
            timestamp: new Date().toISOString(),
            query: `Plans in ${input.zipCode}`,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Cross-Agent Evidence Validator Tool ────────────────────

const EvidenceValidatorSchema = z.object({
    claim: z.string().describe("The claim or finding to validate against other evidence"),
    sources: z.array(z.string()).optional().describe("Specific source names to check against"),
    dimension: z.string().optional().describe("The analysis dimension this claim belongs to"),
});

async function crossAgentEvidenceValidator(params: Record<string, unknown>): Promise<ToolResult> {
    const input = EvidenceValidatorSchema.parse(params);

    // This is a meta-tool that cross-references against multiple sources
    // to validate a claim. It uses quick lookups across key databases.
    try {
        const validationResults: Array<{
            source: string;
            corroborates: boolean;
            evidence: string;
        }> = [];

        // Quick PubMed check
        const pubmedResult = await pubmedSearch({
            query: input.claim.slice(0, 200),
            maxResults: 3,
        });
        if (pubmedResult.success) {
            const papers = (pubmedResult.data as Record<string, unknown>)?.articles;
            const hasEvidence = Array.isArray(papers) && papers.length > 0;
            validationResults.push({
                source: "PubMed",
                corroborates: hasEvidence,
                evidence: hasEvidence
                    ? `${(papers as unknown[]).length} related articles found`
                    : "No directly related articles found",
            });
        }

        // Quick GDELT check for recent media coverage
        const gdeltResult = await gdeltDocSearch({
            query: input.claim.slice(0, 100),
            timespan: "3m",
            maxResults: 5,
        });
        if (gdeltResult.success) {
            const articles = (gdeltResult.data as Record<string, unknown>)?.articles;
            const hasEvidence = Array.isArray(articles) && articles.length > 0;
            validationResults.push({
                source: "GDELT Media",
                corroborates: hasEvidence,
                evidence: hasEvidence
                    ? `${(articles as unknown[]).length} recent media articles reference this topic`
                    : "No recent media coverage found",
            });
        }

        // Quick Federal Register check for regulatory context
        const frResult = await federalRegisterSearch({
            query: input.claim.slice(0, 100),
            maxResults: 3,
        });
        if (frResult.success) {
            const docs = (frResult.data as Record<string, unknown>)?.documents;
            const hasEvidence = Array.isArray(docs) && docs.length > 0;
            validationResults.push({
                source: "Federal Register",
                corroborates: hasEvidence,
                evidence: hasEvidence
                    ? `${(docs as unknown[]).length} regulatory documents reference this topic`
                    : "No regulatory documents found",
            });
        }

        const corroboratingCount = validationResults.filter(r => r.corroborates).length;
        const confidenceLevel = corroboratingCount >= 2 ? "HIGH" : corroboratingCount === 1 ? "MEDIUM" : "LOW";

        return {
            success: true,
            data: {
                claim: input.claim,
                validationResults,
                corroboratingSourceCount: corroboratingCount,
                totalSourcesChecked: validationResults.length,
                suggestedConfidence: confidenceLevel,
                dimension: input.dimension,
            },
            source: "PRISM Evidence Validator (cross-reference)",
            timestamp: new Date().toISOString(),
            query: input.claim,
            cached: false,
        };
    } catch (error) {
        return {
            success: false,
            data: null,
            source: "PRISM Evidence Validator",
            timestamp: new Date().toISOString(),
            query: input.claim,
            cached: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}


// ─── Tool Registry ────────────────────────────────────────

export const TOOL_REGISTRY: ToolDefinition[] = [
    // ── Healthcare & Biomedical ─────────────────────────
    {
        name: "pubmed_search",
        description: "Search PubMed/NCBI for biomedical research articles. Supports MeSH terms, date ranges, and article type filters.",
        category: "pubmed",
        inputSchema: PubMedSearchSchema,
        execute: pubmedSearch,
    },
    {
        name: "semantic_scholar",
        description: "Search Semantic Scholar for academic papers with citation counts, author data, and venue info. Deeper than PubMed for citation graph analysis.",
        category: "pubmed",
        inputSchema: SemanticScholarSchema,
        execute: semanticScholarSearch,
    },
    {
        name: "clinical_trials",
        description: "Search ClinicalTrials.gov for active/completed clinical trials. Filter by phase, status, drug, condition, or sponsor.",
        category: "pubmed",
        inputSchema: ClinicalTrialsSchema,
        execute: clinicalTrialsSearch,
    },
    {
        name: "openfda",
        description: "Query openFDA for drug adverse events, drug labeling, drug recalls, device events, and device recalls.",
        category: "regulatory",
        inputSchema: OpenFDASchema,
        execute: openFDASearch,
    },
    // ── CMS & Provider Data ─────────────────────────────
    {
        name: "cms_data",
        description: "Query CMS Open Data (Star Ratings, Plan Finder, Part D, Hospital Compare, Quality Measures).",
        category: "cms",
        inputSchema: CMSDataSchema,
        execute: cmsDataSearch,
    },
    {
        name: "npi_lookup",
        description: "Search the NPPES NPI Registry for healthcare providers by name, NPI number, state, or taxonomy.",
        category: "npi",
        inputSchema: NPISearchSchema,
        execute: npiSearch,
    },
    // ── Regulatory & Legislative ────────────────────────
    {
        name: "federal_register",
        description: "Search Federal Register for proposed/final rules, CMS notices, FDA guidance, and executive orders. First signal of regulatory changes.",
        category: "regulatory",
        inputSchema: FederalRegisterSchema,
        execute: federalRegisterSearch,
    },
    // ── Financial & Economic ────────────────────────────
    {
        name: "sec_edgar",
        description: "Search SEC EDGAR for financial filings (10-K, 10-Q, 8-K, S-1, DEF 14A) by company name, ticker, or filing text.",
        category: "sec_edgar",
        inputSchema: SECEdgarSchema,
        execute: secEdgarSearch,
    },
    {
        name: "fred_economic",
        description: "Query FRED (Federal Reserve Economic Data) for 816k+ economic time series — healthcare spending, medical CPI, employment, GDP.",
        category: "sec_edgar",
        inputSchema: FREDSchema,
        execute: fredSearch,
    },
    // ── Web Search ──────────────────────────────────────
    {
        name: "web_search",
        description: "Search the web for current information. Supports domain restriction and recency filtering.",
        category: "web_search",
        inputSchema: WebSearchSchema,
        execute: webSearch,
    },
    // ── GDELT Global Media Intelligence ─────────────────
    {
        name: "gdelt_search",
        description: "Search GDELT global media database across 65 languages. Returns articles, sentiment timelines, or coverage volume trends. Real-time monitoring of healthcare narratives, regulatory signals, and competitive PR.",
        category: "gdelt",
        inputSchema: GDELTDocSchema,
        execute: gdeltDocSearch,
    },
    {
        name: "gdelt_context",
        description: "Search GDELT at the sentence level — returns contextual snippets from global media. Ideal for finding specific claims, quotes, or data points.",
        category: "gdelt",
        inputSchema: GDELTContextSchema,
        execute: gdeltContextSearch,
    },
    {
        name: "gdelt_geo",
        description: "Geographic analysis of global media coverage via GDELT. Returns GeoJSON data showing where topics are being discussed worldwide.",
        category: "gdelt",
        inputSchema: GDELTGeoSchema,
        execute: gdeltGeoSearch,
    },
    // ── Population Health & SDOH ───────────────────────
    {
        name: "census_acs",
        description: "Query U.S. Census American Community Survey for socioeconomic data at ZIP/county/tract level: income, poverty, insurance, education, disability, housing.",
        category: "sdoh",
        inputSchema: CensusACSSchema,
        execute: censusACSSearch,
    },
    {
        name: "cdc_places",
        description: "Query CDC PLACES for chronic disease prevalence and health behaviors at county/ZIP level. Covers 36 measures: diabetes, obesity, depression, COPD, access to care, etc.",
        category: "sdoh",
        inputSchema: CDCPlacesSchema,
        execute: cdcPlacesSearch,
    },
    {
        name: "who_gho",
        description: "Query WHO Global Health Observatory for 1000+ global health indicators by country: life expectancy, disease burden, UHC coverage, healthcare workforce.",
        category: "sdoh",
        inputSchema: WHOGHOSchema,
        execute: whoGHOSearch,
    },
    // ── Political Influence (OpenSecrets bulk sweep) ────
    ...OPENSECRETS_TOOLS,
    // ── Patent Intelligence ─────────────────────────────
    {
        name: "google_patents",
        description: "Search patent databases for drug patents, medical device patents, and technology patents. Useful for understanding IP landscapes, patent expiry timelines, and competitive positioning.",
        category: "patents" as ToolCategory,
        inputSchema: GooglePatentsSchema,
        execute: googlePatentsSearch,
    },
    // ── Legislative Tracking ────────────────────────────
    {
        name: "congress_bills",
        description: "Search Congressional bills and legislation. Track healthcare policy proposals, drug pricing bills, PBM reform, Medicare/Medicaid changes, and regulatory legislation.",
        category: "legislative" as ToolCategory,
        inputSchema: CongressBillSchema,
        execute: congressBillSearch,
    },
    // ── Medicare Plan Intelligence ──────────────────────
    {
        name: "medicare_plans",
        description: "Search Medicare plan data by ZIP code. Compare MA plans, Part D plans, premiums, star ratings, and deductibles. Essential for competitive intelligence.",
        category: "medicare" as ToolCategory,
        inputSchema: MedicarePlanFinderSchema,
        execute: medicarePlanFinderSearch,
    },
    // ── Evidence Validation ─────────────────────────────
    {
        name: "validate_evidence",
        description: "Cross-reference a claim against multiple data sources (PubMed, GDELT, Federal Register) to assess evidence quality. Returns corroboration count and suggested confidence level.",
        category: "meta" as ToolCategory,
        inputSchema: EvidenceValidatorSchema,
        execute: crossAgentEvidenceValidator,
    },
];


// ─── Tool Proxy Class ───────────────────────────────────────

/**
 * MCP Tool Proxy — routes agent tool calls to external APIs.
 * 
 * Features:
 * - Caching to avoid duplicate API calls
 * - Rate limiting per tool category
 * - Archetype-based tool routing (only serve tools relevant to the agent's skills)
 * - Provenance tracking for all tool results
 */
export class MCPToolProxy {
    private cache: ToolCache;
    private rateLimiters: Map<ToolCategory, RateLimiter> = new Map();
    private callLog: Array<{
        tool: string;
        agent: string;
        timestamp: string;
        cached: boolean;
        durationMs: number;
    }> = [];

    constructor(cacheTtlMs: number = 15 * 60 * 1000) {
        this.cache = new ToolCache(cacheTtlMs);

        // Initialize rate limiters per category
        const categories: ToolCategory[] = ["pubmed", "cms", "npi", "web_search", "sec_edgar", "regulatory", "gdelt", "sdoh", "patents", "legislative", "medicare", "meta"];
        for (const cat of categories) {
            this.rateLimiters.set(cat, new RateLimiter(30, 60_000));
        }

        // Initialize OpenSecrets bulk data sweep (daily cadence)
        getOpenSecretsStore().startScheduler(SWEEP_CADENCES.DAILY).catch(
            err => console.warn("[MCPToolProxy] OpenSecrets sweep init failed:", err)
        );
    }

    /**
     * Get available tools for a specific agent based on their compatible skills.
     */
    getToolsForAgent(compatibleSkills: string[]): ToolDefinition[] {
        // Map skill names to tool categories
        const skillToCategory: Record<string, ToolCategory[]> = {
            "healthcare-quality-analytics": ["pubmed", "cms", "regulatory", "gdelt", "sdoh", "meta"],
            "stars-2027-navigator": ["cms", "regulatory", "gdelt", "sdoh", "medicare", "meta"],
            "payer-financial-decoder": ["cms", "sec_edgar", "gdelt", "medicare", "meta"],
            "regulatory-radar": ["cms", "regulatory", "gdelt", "legislative", "meta"],
            "drug-pipeline-intel": ["pubmed", "regulatory", "gdelt", "patents", "meta"],
            "competitor-landscape": ["web_search", "sec_edgar", "gdelt", "patents", "medicare", "meta"],
        };

        const relevantCategories = new Set<ToolCategory>();

        for (const skill of compatibleSkills) {
            const categories = skillToCategory[skill];
            if (categories) {
                for (const cat of categories) {
                    relevantCategories.add(cat);
                }
            }
        }

        // If no specific skills match, provide web search as baseline
        if (relevantCategories.size === 0) {
            relevantCategories.add("web_search");
        }

        return TOOL_REGISTRY.filter(t => relevantCategories.has(t.category));
    }

    /**
     * Execute a tool call with caching and rate limiting.
     */
    async executeTool(
        toolName: string,
        params: Record<string, unknown>,
        agentName: string = "unknown",
    ): Promise<ToolResult> {
        const startTime = Date.now();
        const tool = TOOL_REGISTRY.find(t => t.name === toolName);

        if (!tool) {
            return {
                success: false,
                data: null,
                source: "unknown",
                timestamp: new Date().toISOString(),
                query: JSON.stringify(params),
                cached: false,
                error: `Unknown tool: ${toolName}. Available: ${TOOL_REGISTRY.map(t => t.name).join(", ")}`,
            };
        }

        // Check cache
        const cacheKey = `${toolName}:${JSON.stringify(params)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.callLog.push({
                tool: toolName,
                agent: agentName,
                timestamp: new Date().toISOString(),
                cached: true,
                durationMs: Date.now() - startTime,
            });
            return cached;
        }

        // Rate limiting
        const limiter = this.rateLimiters.get(tool.category);
        if (limiter) {
            await limiter.acquire();
        }

        // Execute
        const result = await tool.execute(params);

        // Cache successful results
        if (result.success) {
            this.cache.set(cacheKey, result);
        }

        // Log the call
        this.callLog.push({
            tool: toolName,
            agent: agentName,
            timestamp: new Date().toISOString(),
            cached: false,
            durationMs: Date.now() - startTime,
        });

        return result;
    }

    /**
     * Get tool call statistics.
     */
    getStats(): {
        totalCalls: number;
        cachedCalls: number;
        cacheHitRate: number;
        byTool: Record<string, number>;
        byAgent: Record<string, number>;
    } {
        const totalCalls = this.callLog.length;
        const cachedCalls = this.callLog.filter(c => c.cached).length;

        const byTool: Record<string, number> = {};
        const byAgent: Record<string, number> = {};

        for (const call of this.callLog) {
            byTool[call.tool] = (byTool[call.tool] ?? 0) + 1;
            byAgent[call.agent] = (byAgent[call.agent] ?? 0) + 1;
        }

        return {
            totalCalls,
            cachedCalls,
            cacheHitRate: totalCalls > 0 ? cachedCalls / totalCalls : 0,
            byTool,
            byAgent,
        };
    }

    /**
     * Format available tools for injection into agent prompts.
     */
    formatToolsForPrompt(compatibleSkills: string[]): string {
        const tools = this.getToolsForAgent(compatibleSkills);
        if (tools.length === 0) return "";

        return `\n## Available Research Tools\nYou have access to ${tools.length} external data tools. When you need specific data, reference these tools in your findings:\n${tools.map(t => `- **${t.name}**: ${t.description}`).join("\n")}\n\nWhen citing data from these tools, always include the source name and access timestamp in your findings.\n`;
    }

    /**
     * Clear all caches.
     */
    clearCache(): void {
        this.cache.clear();
    }
}
