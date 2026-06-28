/**
 * Property-based test: Website Content Round-Trip
 *
 * **Validates: Requirements 1.9, 2.4, 3.7, 13.2**
 *
 * Property 1: Website Content Round-Trip
 *   For any set of values stored in a `website_content` record (hero headline,
 *   about text, contact details, operating hours, rates, FAQ), the corresponding
 *   public-facing page must render those exact values on the next page load.
 *
 *   Concretely: for any arbitrary content object stored via PATCH, calling GET
 *   for the same section must return exactly the same content object.
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` and `@/lib/supabase/admin` with an
 *     in-memory store (section → content).
 *   - PATCH handler writes to the store via the admin client.
 *   - GET handler reads from the store via the server client.
 *   - The test drives the route handlers directly, bypassing HTTP.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// In-memory content store shared by both mock clients.
// Keyed by section name.
// ---------------------------------------------------------------------------

type ContentRow = {
  id: string;
  section: string;
  content: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
};

/** Mutable store reset between test runs */
let store: Map<string, ContentRow>;

function resetStore() {
  store = new Map();
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server — used by GET and for auth in PATCH
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => {
  return {
    createClient: vi.fn(async () => {
      return {
        // Auth: used by PATCH to getUser
        auth: {
          getUser: vi.fn(async () => ({
            data: {
              user: {
                id: "admin-user-id",
                app_metadata: { role: "admin" },
                user_metadata: {},
              },
            },
            error: null,
          })),
        },
        // Database: used by GET to select website_content
        from: vi.fn((table: string) => {
          if (table !== "website_content") {
            throw new Error(`Unexpected table in server mock: ${table}`);
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn((_col: string, section: string) => ({
                maybeSingle: vi.fn(async () => {
                  const row = store.get(section) ?? null;
                  return { data: row, error: null };
                }),
              })),
            })),
          };
        }),
      };
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin — used by PATCH to upsert website_content
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => {
  return {
    createAdminClient: vi.fn(() => {
      return {
        from: vi.fn((table: string) => {
          if (table !== "website_content") {
            throw new Error(`Unexpected table in admin mock: ${table}`);
          }

          // Track the pending upsert payload to chain .select().single()
          let pendingRow: ContentRow | null = null;

          return {
            upsert: vi.fn((payload: ContentRow, _options?: unknown) => {
              // Write to the in-memory store
              const row: ContentRow = {
                id: store.get(payload.section)?.id ?? crypto.randomUUID(),
                section: payload.section,
                content: payload.content as Record<string, unknown>,
                updated_by: payload.updated_by ?? null,
                updated_at: payload.updated_at ?? new Date().toISOString(),
              };
              store.set(payload.section, row);
              pendingRow = row;

              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: pendingRow,
                    error: null,
                  })),
                })),
              };
            }),
          };
        }),
      };
    }),
  };
});

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are in place
// ---------------------------------------------------------------------------

import { GET, PATCH } from "@/app/api/content/[section]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal NextRequest-like object for the PATCH handler.
 * The handler calls request.json() to read the body.
 */
function buildPatchRequest(body: unknown): Request {
  return new Request("http://localhost/api/content/hero", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Build a minimal NextRequest-like object for the GET handler.
 */
function buildGetRequest(): Request {
  return new Request("http://localhost/api/content/hero", { method: "GET" });
}

/**
 * Build the route params object that Next.js passes to route handlers.
 * The params are wrapped in a Promise as per Next.js 15+ conventions.
 */
function buildParams(section: string): { params: Promise<{ section: string }> } {
  return { params: Promise.resolve({ section }) };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Valid section names as defined in the content schema */
const sectionArbitrary = fc.constantFrom(
  "hero",
  "about",
  "contact",
  "hours",
  "rates",
  "faq"
);

/**
 * A generic content object: string keys → string values.
 * Uses fc.dictionary to generate arbitrary key-value pairs,
 * mirroring the generic `website_content.content` JSONB column.
 */
const contentObjectArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  fc.string({ maxLength: 200 }),
  { minKeys: 1, maxKeys: 10 }
);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 1: Website Content Round-Trip
// ---------------------------------------------------------------------------

describe("Property 1: Website Content Round-Trip", () => {
  /**
   * **Validates: Requirements 1.9, 2.4, 3.7, 13.2**
   *
   * For any valid (section, content) pair:
   *   1. PATCH the section with the content.
   *   2. GET the section.
   *   3. The GET response data.content must deep-equal the patched content.
   */
  it("GET returns the exact content that was stored via PATCH for any valid section and content", async () => {
    await fc.assert(
      fc.asyncProperty(
        sectionArbitrary,
        contentObjectArbitrary,
        async (section, content) => {
          // Reset store for each generated example
          resetStore();

          const params = buildParams(section);

          // --- Step 1: PATCH (store the content) ---
          const patchReq = buildPatchRequest({ content });
          const patchRes = await PATCH(patchReq as never, params);

          // PATCH must succeed
          expect(patchRes.status).toBe(200);

          const patchBody = await patchRes.json();
          expect(patchBody.data).toBeDefined();
          expect(patchBody.data.section).toBe(section);

          // --- Step 2: GET (read the content back) ---
          const getReq = buildGetRequest();
          const getRes = await GET(getReq as never, params);

          // GET must succeed
          expect(getRes.status).toBe(200);

          const getBody = await getRes.json();
          expect(getBody.data).not.toBeNull();
          expect(getBody.data.section).toBe(section);

          // --- Step 3: Round-trip equality ---
          // The content returned by GET must exactly match what was PATCHed
          expect(getBody.data.content).toEqual(content);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Overwrite invariant: PATCHing a section twice must leave the latest
   * content as what GET returns (no stale data).
   *
   * **Validates: Requirements 13.2**
   */
  it("GET always returns the most recently PATCHed content when a section is updated multiple times", async () => {
    await fc.assert(
      fc.asyncProperty(
        sectionArbitrary,
        contentObjectArbitrary,
        contentObjectArbitrary,
        async (section, firstContent, secondContent) => {
          resetStore();

          const params = buildParams(section);

          // PATCH first time
          const patch1Req = buildPatchRequest({ content: firstContent });
          const patch1Res = await PATCH(patch1Req as never, params);
          expect(patch1Res.status).toBe(200);

          // PATCH second time (overwrite)
          const patch2Req = buildPatchRequest({ content: secondContent });
          const patch2Res = await PATCH(patch2Req as never, params);
          expect(patch2Res.status).toBe(200);

          // GET must return secondContent, not firstContent
          const getReq = buildGetRequest();
          const getRes = await GET(getReq as never, params);
          expect(getRes.status).toBe(200);

          const getBody = await getRes.json();
          expect(getBody.data.content).toEqual(secondContent);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Section isolation: storing content in one section must not affect
   * another section's content.
   *
   * **Validates: Requirements 1.9, 2.4, 3.7**
   */
  it("content stored in one section does not leak into another section", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(sectionArbitrary, sectionArbitrary).filter(
          ([a, b]) => a !== b
        ),
        contentObjectArbitrary,
        contentObjectArbitrary,
        async ([sectionA, sectionB], contentA, contentB) => {
          resetStore();

          const paramsA = buildParams(sectionA);
          const paramsB = buildParams(sectionB);

          // Store content in section A
          const patchA = buildPatchRequest({ content: contentA });
          await PATCH(patchA as never, paramsA);

          // Store content in section B
          const patchB = buildPatchRequest({ content: contentB });
          await PATCH(patchB as never, paramsB);

          // GET section A must return contentA
          const getA = await GET(buildGetRequest() as never, paramsA);
          const bodyA = await getA.json();
          expect(bodyA.data.content).toEqual(contentA);

          // GET section B must return contentB
          const getB = await GET(buildGetRequest() as never, paramsB);
          const bodyB = await getB.json();
          expect(bodyB.data.content).toEqual(contentB);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Pre-condition: GET on a section with no stored content returns null data.
   */
  it("GET returns null data for a section with no stored content", async () => {
    await fc.assert(
      fc.asyncProperty(sectionArbitrary, async (section) => {
        resetStore();

        const params = buildParams(section);
        const getReq = buildGetRequest();
        const getRes = await GET(getReq as never, params);

        expect(getRes.status).toBe(200);
        const body = await getRes.json();
        // maybeSingle returns null when no row exists
        expect(body.data).toBeNull();
      }),
      { numRuns: 20 }
    );
  });
});
