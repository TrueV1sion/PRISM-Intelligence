// src/lib/data-sources/clients/leapfrog.ts
/**
 * Leapfrog Hospital Safety Grade Client (Layer 1)
 *
 * Internal HTTP client for Leapfrog Hospital Safety Grade data.
 * Uses the publicly available API endpoint for hospital safety grades.
 * Rate limited conservatively since this is a non-profit organization's resource.
 * Not exposed to agents.
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://www.hospitalsafetygrade.org/api/";

// 1 req/s — conservative rate for a non-profit resource
const clientLimiter = new TokenBucketLimiter(1);

// ─── Types ───────────────────────────────────────────────────

export interface LeapfrogResult {
  results: Record<string, unknown>[];
  total: number;
  hasMore: boolean;
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(
  path: string,
  params: Record<string, string | undefined> = {},
): Promise<ApiResponse<LeapfrogResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        urlParams.set(key, value);
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
      throw new Error("Leapfrog Safety Grade rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(
        `Leapfrog API error (HTTP ${response.status}): ${errBody || response.statusText}`,
      );
    }

    const data = (await response.json()) as unknown;

    let results: Record<string, unknown>[];
    if (Array.isArray(data)) {
      results = data as unknown as Record<string, unknown>[];
    } else if (data && typeof data === "object") {
      const obj = data as unknown as Record<string, unknown>;
      results = (obj.results as unknown as Record<string, unknown>[]) ??
        (obj.hospitals as unknown as Record<string, unknown>[]) ??
        (obj.data as unknown as Record<string, unknown>[]) ??
        [];
      // If the response itself is a single hospital object with a grade
      if (results.length === 0 && (obj.grade || obj.hospital_name || obj.name)) {
        results = [obj];
      }
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
    source: "Leapfrog Hospital Safety Grade",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const leapfrogClient = {
  /**
   * Search hospital safety grades by name and/or state.
   */
  async searchHospitalGrades(params: {
    query?: string;
    state?: string;
    limit?: number;
  }): Promise<ApiResponse<LeapfrogResult>> {
    const requestParams: Record<string, string | undefined> = {};

    if (params.query) requestParams.hospital = params.query;
    if (params.state) requestParams.state = params.state.toUpperCase();

    const result = await makeRequest("search", requestParams);

    const limit = params.limit ?? 25;
    if (result.data.results.length > limit) {
      result.data.results = result.data.results.slice(0, limit);
      result.data.total = limit;
    }

    return result;
  },

  /**
   * Get safety grade for a specific facility by name and optional state.
   */
  async getGradeByFacility(params: {
    facilityName: string;
    state?: string;
  }): Promise<ApiResponse<LeapfrogResult>> {
    const requestParams: Record<string, string | undefined> = {
      hospital: params.facilityName,
    };

    if (params.state) requestParams.state = params.state.toUpperCase();

    return makeRequest("search", requestParams);
  },
};
