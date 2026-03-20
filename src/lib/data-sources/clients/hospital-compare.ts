// src/lib/data-sources/clients/hospital-compare.ts
/**
 * CMS Hospital Compare API Client (Layer 1)
 *
 * Internal HTTP client for the CMS Provider Data API (Hospital Compare).
 * Queries hospital quality measures, patient experience (HCAHPS), and
 * general hospital information. No API key required. Not exposed to agents.
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://data.cms.gov/provider-data/api/1/datastore/query/";

// Dataset identifiers for CMS Provider Data API
const DATASETS = {
  // Hospital General Information
  HOSPITAL_INFO: "xubh-q36u",
  // Hospital Quality — Timely and Effective Care
  QUALITY_MEASURES: "yv7e-xc69",
  // HCAHPS Patient Experience
  PATIENT_EXPERIENCE: "dgck-syfz",
} as const;

// 5 req/s — no documented limit, conservative default
const clientLimiter = new TokenBucketLimiter(5);

// ─── Types ───────────────────────────────────────────────────

export interface HospitalCompareResult {
  results: Record<string, unknown>[];
  total: number;
  hasMore: boolean;
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(
  datasetId: string,
  conditions: Record<string, string>[],
  limit: number = 25,
  offset: number = 0,
): Promise<ApiResponse<HospitalCompareResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const url = `${BASE_URL}${datasetId}`;

    const body: Record<string, unknown> = {
      limit,
      offset,
      ...(conditions.length > 0 && {
        conditions,
      }),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0",
      },
      body: JSON.stringify(body),
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
      throw new Error("CMS Hospital Compare rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(
        `CMS Hospital Compare API error (HTTP ${response.status}): ${errBody || response.statusText}`,
      );
    }

    const data = (await response.json()) as unknown as Record<string, unknown>;
    const results = (data.results as unknown as Record<string, unknown>[]) ?? [];
    const count = (data.count as number) ?? results.length;

    return {
      data: {
        results,
        total: count,
        hasMore: offset + results.length < count,
      },
      status: response.status,
      vintage: makeVintage(),
    };
  } finally {
    globalRateLimiter.release();
  }
}

/**
 * Alternative GET-based request for simpler dataset queries.
 */
async function makeGetRequest(
  datasetId: string,
  params: Record<string, string | undefined>,
  limit: number = 25,
): Promise<ApiResponse<HospitalCompareResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const urlParams = new URLSearchParams();
    urlParams.set("limit", String(limit));
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        urlParams.set(key, value);
      }
    }

    const url = `${BASE_URL}${datasetId}?${urlParams.toString()}`;

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
      throw new Error("CMS Hospital Compare rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(
        `CMS Hospital Compare API error (HTTP ${response.status}): ${errBody || response.statusText}`,
      );
    }

    const data = (await response.json()) as unknown as Record<string, unknown>;
    const results = (data.results as unknown as Record<string, unknown>[]) ?? [];
    const count = (data.count as number) ?? results.length;

    return {
      data: {
        results,
        total: count,
        hasMore: results.length >= limit,
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
    source: "CMS Hospital Compare",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const hospitalCompareClient = {
  /**
   * Search hospitals by name, state, or zip code.
   */
  async searchHospitals(params: {
    query?: string;
    state?: string;
    zipCode?: string;
    limit?: number;
  }): Promise<ApiResponse<HospitalCompareResult>> {
    const conditions: Record<string, string>[] = [];

    if (params.query) {
      conditions.push({ property: "hospital_name", value: params.query, operator: "CONTAINS" });
    }
    if (params.state) {
      conditions.push({ property: "state", value: params.state.toUpperCase(), operator: "=" });
    }
    if (params.zipCode) {
      conditions.push({ property: "zip_code", value: params.zipCode, operator: "STARTS_WITH" });
    }

    return makeRequest(
      DATASETS.HOSPITAL_INFO,
      conditions,
      params.limit ?? 25,
    );
  },

  /**
   * Get quality measure scores for a hospital by provider ID.
   */
  async getQualityScores(params: {
    providerId: string;
  }): Promise<ApiResponse<HospitalCompareResult>> {
    const conditions = [
      { property: "provider_id", value: params.providerId, operator: "=" },
    ];

    return makeRequest(DATASETS.QUALITY_MEASURES, conditions, 100);
  },

  /**
   * Get HCAHPS patient experience survey scores for a hospital.
   */
  async getPatientExperience(params: {
    providerId: string;
  }): Promise<ApiResponse<HospitalCompareResult>> {
    const conditions = [
      { property: "provider_id", value: params.providerId, operator: "=" },
    ];

    return makeRequest(DATASETS.PATIENT_EXPERIENCE, conditions, 100);
  },
};
