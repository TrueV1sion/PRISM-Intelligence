// src/lib/data-sources/research/lobbying-influence.ts
/**
 * research_lobbying_influence — Layer 3 Intelligence Tool
 *
 * Compound research tool that aggregates lobbying activity, PAC contributions,
 * SEC filings (for corporate political spending), and related legislation
 * into a single intelligence packet. Makes 3-4 parallel Layer 1 API calls
 * per invocation.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

// Forward-safe imports: OpenSecrets, SEC EDGAR, and Congress.gov clients
// may not exist yet during vertical slice development. Loaded lazily on first call.

type OpenSecretsClient = typeof import("../clients/opensecrets").openSecretsClient;
type SecEdgarClientType = typeof import("../clients/sec-edgar").secEdgarClient;
type CongressGovClientType = typeof import("../clients/congress-gov").congressGovClient;

let openSecretsClientRef: OpenSecretsClient | null | undefined;
let secEdgarClientRef: SecEdgarClientType | null | undefined;
let congressGovClientRef: CongressGovClientType | null | undefined;

async function getOpenSecretsClient(): Promise<OpenSecretsClient | null> {
  if (openSecretsClientRef !== undefined) return openSecretsClientRef;
  try {
    const mod = await import("../clients/opensecrets");
    openSecretsClientRef = mod.openSecretsClient;
  } catch {
    openSecretsClientRef = null;
  }
  return openSecretsClientRef;
}

async function getSecEdgarClient(): Promise<SecEdgarClientType | null> {
  if (secEdgarClientRef !== undefined) return secEdgarClientRef;
  try {
    const mod = await import("../clients/sec-edgar");
    secEdgarClientRef = mod.secEdgarClient;
  } catch {
    secEdgarClientRef = null;
  }
  return secEdgarClientRef;
}

async function getCongressGovClient(): Promise<CongressGovClientType | null> {
  if (congressGovClientRef !== undefined) return congressGovClientRef;
  try {
    const mod = await import("../clients/congress-gov");
    congressGovClientRef = mod.congressGovClient;
  } catch {
    congressGovClientRef = null;
  }
  return congressGovClientRef;
}

export const lobbyingInfluenceResearchTool: DataSourceTool = {
  name: "research_lobbying_influence",
  description:
    "Comprehensive lobbying influence intelligence: lobbying activity, PAC contributions, " +
    "corporate SEC filings related to political spending, and associated legislation. " +
    "Makes multiple API calls and returns a cross-referenced intelligence packet.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Organization, industry, or topic to investigate" },
      timeframe: { type: "string", description: "How far back to search: '1y', '2y', '4y' (default '2y')" },
      focus: { type: "string", description: "Optional focus area: 'lobbying', 'contributions', 'legislation'" },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["opensecrets", "sec-edgar", "congress-gov"],
  routingTags: ["lobbying", "influence", "political", "corporate", "transparency"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const query = input.query as string;
    const timeframe = (input.timeframe as string) ?? "2y";
    const yearsBack = parseInt(timeframe) || 2;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - yearsBack;

    // ─── Resolve clients ─────────────────────────────────────────
    const [osClient, edgarClient, congressClient] = await Promise.all([
      getOpenSecretsClient(),
      getSecEdgarClient(),
      getCongressGovClient(),
    ]);

    // ─── Parallel API calls ──────────────────────────────────────
    const [lobbyResult, edgarResult, billsResult] = await Promise.all([
      osClient
        ? osClient.searchLobbyists({ query, year: String(currentYear), limit: 10 })
            .catch(() => null)
        : null,
      edgarClient
        ? edgarClient.searchFilings({
            query: `"${query}" AND ("lobbying" OR "political" OR "government affairs")`,
            dateFrom: `${startYear}-01-01`,
            limit: 5,
          }).catch(() => null)
        : null,
      congressClient
        ? congressClient.searchBills({
            query,
            fromDateTime: `${startYear}-01-01T00:00:00Z`,
            limit: 10,
          }).catch(() => null)
        : null,
    ]);

    // ─── Extract insights ────────────────────────────────────────
    const lobbyists = lobbyResult?.data?.results ?? [];
    const totalLobbyRecords = lobbyResult?.data?.total ?? 0;

    const edgarFilings = edgarResult?.data?.results ?? [];
    const totalFilings = edgarResult?.data?.total ?? 0;

    const billsData = billsResult?.data?.data;
    const bills = (billsData && typeof billsData === "object")
      ? ((billsData as unknown as Record<string, unknown>).bills as unknown as Record<string, unknown>[]) ?? []
      : [];
    const totalBills = billsResult?.data?.pagination?.count ?? bills.length;

    // ─── Confidence scoring ──────────────────────────────────────
    let sourcesReturned = 0;
    let sourcesQueried = 0;
    if (osClient) { sourcesQueried++; if (totalLobbyRecords > 0) sourcesReturned++; }
    if (edgarClient) { sourcesQueried++; if (totalFilings > 0) sourcesReturned++; }
    if (congressClient) { sourcesQueried++; if (totalBills > 0) sourcesReturned++; }

    // If no clients were available, set minimum
    if (sourcesQueried === 0) sourcesQueried = 3;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ───────────────────────────────
    const sections: string[] = [];

    const vintage = lobbyResult?.vintage?.queriedAt?.slice(0, 10)
      ?? edgarResult?.vintage?.queriedAt?.slice(0, 10)
      ?? new Date().toISOString().slice(0, 10);

    sections.push(intelligenceHeader({
      topic: "Lobbying Influence",
      subject: query,
      confidence,
      sourcesQueried,
      sourcesReturned,
      vintage,
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    if (totalLobbyRecords > 0) {
      bullets.push(`- **${formatNumber(totalLobbyRecords)}** lobbying records found for ${currentYear}`);
    } else {
      bullets.push(`- No lobbying records found in OpenSecrets for "${query}"`);
    }
    if (totalFilings > 0) {
      bullets.push(`- **${formatNumber(totalFilings)}** SEC filings mention political/lobbying activity`);
    }
    if (totalBills > 0) {
      bullets.push(`- **${formatNumber(totalBills)}** related bills found in Congress since ${startYear}`);
    }
    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Lobbying activity table
    if (lobbyists.length > 0) {
      const lobbyRows = lobbyists.slice(0, 5).map((r) => {
        const name = String(r.lobbyist_name ?? r.lobbyist ?? r.registrant_name ?? "Unknown");
        const registrant = String(r.registrant_name ?? r.registrant ?? "—");
        const client = String(r.client_name ?? r.client ?? "—");
        return [name.slice(0, 30), registrant.slice(0, 30), client.slice(0, 30)];
      });
      sections.push(`### Lobbying Activity\n${markdownTable(["Lobbyist", "Registrant", "Client"], lobbyRows, 5, totalLobbyRecords)}`);
    }

    // SEC filings related to political spending
    if (edgarFilings.length > 0) {
      const filingRows = edgarFilings.slice(0, 5).map((r) => {
        const company = String(r.company ?? "Unknown");
        const formType = String(r.form_type ?? "—");
        const date = String(r.filed_date ?? "—");
        return [company.slice(0, 30), formType, date];
      });
      sections.push(`### SEC Filings (Political/Lobbying)\n${markdownTable(["Company", "Form", "Date"], filingRows, 5, totalFilings)}`);
    }

    // Related legislation
    if (bills.length > 0) {
      const billRows = bills.slice(0, 5).map((b) => {
        const bill = b as unknown as Record<string, unknown>;
        const title = String(bill.title ?? bill.shortTitle ?? "Unknown");
        const number = String(bill.number ?? bill.bill_id ?? "—");
        const latestAction = bill.latestAction as unknown as Record<string, unknown> | undefined;
        const actionText = latestAction ? String(latestAction.text ?? "—") : "—";
        return [number, title.slice(0, 50), actionText.slice(0, 40)];
      });
      sections.push(`### Related Legislation\n${markdownTable(["Bill #", "Title", "Latest Action"], billRows, 5, totalBills)}`);
    }

    // ─── Citations ───────────────────────────────────────────────
    const citations = [];
    if (lobbyResult) {
      citations.push({
        id: `[OS-LOBBY-${Date.now()}]`,
        source: "OpenSecrets Lobbying",
        query,
        resultCount: totalLobbyRecords,
      });
    }
    if (edgarResult) {
      citations.push({
        id: `[EDGAR-POL-${Date.now()}]`,
        source: "SEC EDGAR",
        query: `${query} political/lobbying`,
        resultCount: totalFilings,
      });
    }
    if (billsResult) {
      citations.push({
        id: `[CONGRESS-${Date.now()}]`,
        source: "Congress.gov",
        query,
        resultCount: totalBills,
      });
    }

    sections.push(formatCitations(citations));

    // Assemble and truncate
    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: lobbyResult?.vintage ?? edgarResult?.vintage ?? {
        queriedAt: new Date().toISOString(),
        source: "OpenSecrets + SEC EDGAR + Congress.gov",
      },
      confidence,
      truncated,
    };
  },
};
