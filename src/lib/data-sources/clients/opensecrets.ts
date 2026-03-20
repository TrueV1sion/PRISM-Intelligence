// src/lib/data-sources/clients/opensecrets.ts
/**
 * OpenSecrets API Client (Layer 1)
 *
 * Internal HTTP client for the OpenSecrets (Center for Responsive Politics)
 * public API. Handles query construction, rate limiting, and error handling.
 * Not exposed to agents.
 *
 * Requires API key: process.env.OPENSECRETS_API_KEY
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://www.opensecrets.org/api/";

// 1 req/s — OpenSecrets allows 200 requests/day on free tier
const clientLimiter = new TokenBucketLimiter(1);

// ─── Types ───────────────────────────────────────────────────

export interface OpenSecretsResult {
  results: Record<string, unknown>[];
  total: number;
  hasMore: boolean;
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(
  params: Record<string, string | undefined>,
): Promise<ApiResponse<OpenSecretsResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const apiKey = process.env.OPENSECRETS_API_KEY;
    if (!apiKey) {
      throw new Error("OPENSECRETS_API_KEY environment variable is required");
    }

    const urlParams = new URLSearchParams({ output: "json", apikey: apiKey });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        urlParams.set(key, value);
      }
    }

    const url = `${BASE_URL}?${urlParams.toString()}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Protoprism/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 404) {
      return {
        data: { results: [], total: 0, hasMore: false },
        status: 404,
        vintage: makeVintage(),
      };
    }

    if (response.status === 429) {
      throw new Error("OpenSecrets rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `OpenSecrets API error (HTTP ${response.status}): ${body || response.statusText}`,
      );
    }

    const data = (await response.json()) as unknown as Record<string, unknown>;

    // OpenSecrets wraps responses in a top-level key like "response"
    const responseData = data.response as unknown as Record<string, unknown> | undefined;
    const results = extractResults(responseData ?? data);

    return {
      data: {
        results,
        total: results.length,
        hasMore: false,
      },
      status: response.status,
      vintage: makeVintage(),
    };
  } finally {
    globalRateLimiter.release();
  }
}

function extractResults(data: Record<string, unknown>): Record<string, unknown>[] {
  // OpenSecrets nests results differently per endpoint
  // Common patterns: data.contributor, data.industries, data.lobbyists, etc.
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (Array.isArray(val)) {
      return val as unknown as Record<string, unknown>[];
    }
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nested = val as unknown as Record<string, unknown>;
      // Check for nested arrays like { contributor: [{ @attributes: {...} }] }
      for (const innerKey of Object.keys(nested)) {
        const innerVal = nested[innerKey];
        if (Array.isArray(innerVal)) {
          return innerVal.map((item) => {
            if (item && typeof item === "object" && (item as unknown as Record<string, unknown>)["@attributes"]) {
              return (item as unknown as Record<string, unknown>)["@attributes"] as unknown as Record<string, unknown>;
            }
            return item as unknown as Record<string, unknown>;
          });
        }
      }
      // Single result objects often have @attributes
      if (nested["@attributes"]) {
        return [nested["@attributes"] as unknown as Record<string, unknown>];
      }
    }
  }
  return [];
}

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source: "OpenSecrets",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const openSecretsClient = {
  /**
   * Search lobbyists by query and optional year.
   */
  async searchLobbyists(params: {
    query: string;
    year?: string;
    limit?: number;
  }): Promise<ApiResponse<OpenSecretsResult>> {
    const result = await makeRequest({
      method: "getLobbyists",
      id: params.query,
      year: params.year,
    });

    if (params.limit && result.data.results.length > params.limit) {
      result.data.results = result.data.results.slice(0, params.limit);
    }

    return result;
  },

  /**
   * Get top contributors to a candidate by CID.
   */
  async getContributions(params: {
    candidateId: string;
    cycle?: string;
  }): Promise<ApiResponse<OpenSecretsResult>> {
    return makeRequest({
      method: "candContrib",
      cid: params.candidateId,
      cycle: params.cycle,
    });
  },

  /**
   * Get industry totals for a candidate.
   */
  async getIndustryTotals(params: {
    industryCode: string;
    cycle?: string;
  }): Promise<ApiResponse<OpenSecretsResult>> {
    return makeRequest({
      method: "candIndustry",
      ind: params.industryCode,
      cycle: params.cycle,
    });
  },
};
