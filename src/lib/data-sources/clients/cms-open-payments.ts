// src/lib/data-sources/clients/cms-open-payments.ts
/**
 * CMS Open Payments API Client (Layer 1)
 *
 * Internal HTTP client for the CMS Open Payments Data API.
 * Queries the general payments dataset for physician–industry financial
 * relationships. No API key required. Not exposed to agents.
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://openpaymentsdata.cms.gov/api/1/datastore/query/";

// General payments dataset identifier (updated annually by CMS)
const GENERAL_PAYMENTS_DATASET = "0380fa7b-a300-4550-b846-14d08e3c5868";

// 5 req/s — no documented limit, conservative default
const clientLimiter = new TokenBucketLimiter(5);

// ─── Types ───────────────────────────────────────────────────

export interface OpenPaymentsResult {
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
): Promise<ApiResponse<OpenPaymentsResult>> {
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
      throw new Error("CMS Open Payments rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(
        `CMS Open Payments API error (HTTP ${response.status}): ${errBody || response.statusText}`,
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

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source: "CMS Open Payments",
  };
}

// ─── Query Builders ──────────────────────────────────────────

function buildConditions(
  filters: Record<string, string | undefined>,
): Record<string, string>[] {
  const conditions: Record<string, string>[] = [];
  for (const [property, value] of Object.entries(filters)) {
    if (value !== undefined) {
      conditions.push({ property, value, operator: "CONTAINS" });
    }
  }
  return conditions;
}

// ─── Public API ──────────────────────────────────────────────

export const cmsOpenPaymentsClient = {
  /**
   * Search general payments by physician name, company name, or free query.
   */
  async searchPayments(params: {
    query?: string;
    physicianName?: string;
    companyName?: string;
    year?: number;
    limit?: number;
  }): Promise<ApiResponse<OpenPaymentsResult>> {
    const filters: Record<string, string | undefined> = {};

    if (params.physicianName) {
      // CMS field: covered_recipient_last_name or covered_recipient_first_name
      filters.covered_recipient_last_name = params.physicianName;
    }
    if (params.companyName) {
      filters.applicable_manufacturer_or_applicable_gpo_making_payment_name = params.companyName;
    }
    if (params.query) {
      // Use query as a general search across name/company fields
      filters.covered_recipient_last_name = params.query;
    }

    const conditions = buildConditions(filters);

    return makeRequest(
      GENERAL_PAYMENTS_DATASET,
      conditions,
      params.limit ?? 25,
    );
  },

  /**
   * Get payments for a specific physician profile ID.
   */
  async getPaymentsByPhysician(params: {
    physicianId: string;
    limit?: number;
  }): Promise<ApiResponse<OpenPaymentsResult>> {
    const conditions = [
      { property: "covered_recipient_profile_id", value: params.physicianId, operator: "=" },
    ];

    return makeRequest(
      GENERAL_PAYMENTS_DATASET,
      conditions,
      params.limit ?? 50,
    );
  },

  /**
   * Get payments by a specific company (applicable manufacturer).
   */
  async getPaymentsByCompany(params: {
    companyName: string;
    year?: number;
    limit?: number;
  }): Promise<ApiResponse<OpenPaymentsResult>> {
    const conditions = buildConditions({
      applicable_manufacturer_or_applicable_gpo_making_payment_name: params.companyName,
    });

    return makeRequest(
      GENERAL_PAYMENTS_DATASET,
      conditions,
      params.limit ?? 25,
    );
  },
};
