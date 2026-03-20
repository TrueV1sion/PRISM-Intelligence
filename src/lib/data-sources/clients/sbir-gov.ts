// src/lib/data-sources/clients/sbir-gov.ts
/**
 * SBIR.gov API Client (Layer 1)
 *
 * Internal HTTP client for the SBIR.gov public API. Queries Small Business
 * Innovation Research (SBIR) and Small Business Technology Transfer (STTR)
 * award data. No API key required. Not exposed to agents.
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.sbir.gov/public/api";

// 3 req/s — conservative default for federal API
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

export interface SbirResult {
  results: Record<string, unknown>[];
  total: number;
  hasMore: boolean;
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<ApiResponse<SbirResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        urlParams.set(key, String(value));
      }
    }

    const queryString = urlParams.toString();
    const url = queryString
      ? `${BASE_URL}${path}?${queryString}`
      : `${BASE_URL}${path}`;

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
      throw new Error("SBIR.gov rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(
        `SBIR.gov API error (HTTP ${response.status}): ${errBody || response.statusText}`,
      );
    }

    const data = (await response.json()) as unknown;

    // SBIR API may return an array directly or an object with results
    let results: Record<string, unknown>[];
    if (Array.isArray(data)) {
      results = data as unknown as Record<string, unknown>[];
    } else if (data && typeof data === "object") {
      const obj = data as unknown as Record<string, unknown>;
      results = (obj.results as unknown as Record<string, unknown>[]) ??
        (obj.awards as unknown as Record<string, unknown>[]) ??
        (obj.data as unknown as Record<string, unknown>[]) ??
        [];
    } else {
      results = [];
    }

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

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source: "SBIR.gov",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const sbirGovClient = {
  /**
   * Search SBIR/STTR awards by keyword, agency, and/or year.
   */
  async searchAwards(params: {
    query?: string;
    agency?: string;
    year?: number;
    limit?: number;
  }): Promise<ApiResponse<SbirResult>> {
    const requestParams: Record<string, string | number | undefined> = {};

    if (params.query) requestParams.keyword = params.query;
    if (params.agency) requestParams.agency = params.agency;
    if (params.year) requestParams.year = params.year;

    const limit = params.limit ?? 25;
    requestParams.rows = limit;

    const result = await makeRequest("/awards.json", requestParams);

    // Trim results to requested limit
    if (result.data.results.length > limit) {
      result.data.results = result.data.results.slice(0, limit);
    }

    return result;
  },

  /**
   * Get details for a specific SBIR/STTR award.
   */
  async getAwardDetails(params: {
    awardId: string;
  }): Promise<ApiResponse<SbirResult>> {
    const result = await makeRequest(`/awards/${encodeURIComponent(params.awardId)}.json`);

    // Single award response — normalize to array
    if (result.data.results.length === 0 && result.status === 200) {
      // Try wrapping the raw response if it was a single object
      return result;
    }

    return result;
  },
};
