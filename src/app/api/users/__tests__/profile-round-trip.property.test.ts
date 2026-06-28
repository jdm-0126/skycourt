/**
 * Property-based test: Profile Update Round-Trip
 *
 * **Validates: Requirements 9.2**
 *
 * Property 15: Profile Update Round-Trip
 *   For any valid profile update (non-empty full name, optional contact number),
 *   the user record must be updated to exactly match the submitted values, and
 *   a success response (200) must be returned.
 *
 * Properties tested:
 *   1. Valid fullName + optional contactNumber → 200 response
 *   2. Captured update payload's `full_name` exactly matches submitted `fullName`
 *   3. Captured update payload's `contact_number` matches `contactNumber` (or null if empty/undefined)
 *   4. Empty fullName → 400 (schema validation blocks it)
 *   5. Non-owner userId in route param → 403
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server`: auth.getUser returns a fixed userId
 *   - Mock `@/lib/supabase/admin`: captures the update payload and returns a mock user row
 *   - Drive the PATCH route handler directly with synthetic Request objects
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Shared state: the fixed userId the auth mock returns
// ---------------------------------------------------------------------------

const FIXED_USER_ID = "user-abc-123";

// ---------------------------------------------------------------------------
// Capture store: records the last update payload sent to the admin client
// ---------------------------------------------------------------------------

type UpdatePayload = {
  full_name?: string;
  contact_number?: string | null;
  updated_at?: string;
  [key: string]: unknown;
};

let capturedUpdatePayload: UpdatePayload | null = null;

function resetCapture() {
  capturedUpdatePayload = null;
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server
// Returns auth.getUser with FIXED_USER_ID
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => {
  return {
    createClient: vi.fn(async () => ({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: FIXED_USER_ID,
              email: "member@skycourt.com",
              app_metadata: { role: "member" },
              user_metadata: {},
            },
          },
          error: null,
        })),
      },
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin
// Captures the update payload and returns a synthetic updated user row
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => {
  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table !== "users") {
          throw new Error(`Unexpected table in admin mock: ${table}`);
        }

        // We need to capture the patch and chain .update().eq().select().single()
        let pendingPatch: UpdatePayload | null = null;
        let pendingId: string | null = null;

        return {
          update: vi.fn((patch: UpdatePayload) => {
            pendingPatch = patch;
            return {
              eq: vi.fn((_col: string, id: string) => {
                pendingId = id;
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(async () => {
                      // Capture the payload for assertions
                      capturedUpdatePayload = pendingPatch;

                      // Return a mock user row reflecting the update
                      const mockRow = {
                        id: pendingId,
                        full_name: pendingPatch?.full_name ?? "",
                        email: "member@skycourt.com",
                        role: "member" as const,
                        status: "active" as const,
                        contact_number: pendingPatch?.contact_number ?? null,
                        created_at: "2024-01-01T00:00:00.000Z",
                        updated_at:
                          pendingPatch?.updated_at ?? new Date().toISOString(),
                      };
                      return { data: mockRow, error: null };
                    }),
                  })),
                };
              }),
            };
          }),
        };
      }),
    })),
  };
});

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are in place
// ---------------------------------------------------------------------------

import { PATCH } from "@/app/api/users/[id]/profile/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a synthetic Request for the PATCH handler.
 */
function buildPatchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/users/${FIXED_USER_ID}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Build the route params for the PATCH handler.
 */
function buildParams(
  id: string
): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Valid fullName: non-empty string whose trimmed form is also non-empty.
 */
const validFullNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/**
 * Optional contactNumber: either '' (absent / will be stored as null)
 * or a non-empty string.
 * Using fc.option with nil: '' to mirror the schema default behaviour.
 */
const optionalContactNumberArb = fc.option(
  fc.string({ minLength: 1, maxLength: 50 }),
  { nil: "" }
);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetCapture();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 15: Profile Update Round-Trip
// ---------------------------------------------------------------------------

describe("Property 15: Profile Update Round-Trip", () => {
  /**
   * **Validates: Requirements 9.2**
   *
   * For any valid (fullName, contactNumber) pair:
   *   1. PATCH /api/users/:id/profile responds 200.
   *   2. The captured `full_name` in the update payload exactly matches `fullName`.
   *   3. The captured `contact_number` in the update payload is the contactNumber
   *      value when it is non-empty, or null when it is empty/undefined.
   */
  it("returns 200 and captures exact update payload for any valid profile input", async () => {
    await fc.assert(
      fc.asyncProperty(
        validFullNameArb,
        optionalContactNumberArb,
        async (fullName, contactNumber) => {
          resetCapture();

          const body = { fullName, contactNumber };
          const req = buildPatchRequest(body);
          const params = buildParams(FIXED_USER_ID);

          const res = await PATCH(req as never, params);

          // --- Property 1: Valid input → 200 ---
          expect(res.status).toBe(200);

          const responseBody = await res.json();
          // Response body should be the updated user row (not wrapped)
          expect(responseBody).toBeDefined();
          expect(responseBody.id).toBe(FIXED_USER_ID);

          // --- Property 2: full_name round-trip ---
          expect(capturedUpdatePayload).not.toBeNull();
          expect(capturedUpdatePayload!.full_name).toBe(fullName);

          // --- Property 3: contact_number round-trip ---
          // Empty string or undefined → null in DB; non-empty → stored as-is
          const expectedContactNumber =
            contactNumber === "" || contactNumber === undefined
              ? null
              : contactNumber;
          expect(capturedUpdatePayload!.contact_number).toBe(
            expectedContactNumber
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 9.2**
   *
   * The response body must reflect the submitted fullName and contactNumber.
   */
  it("response body reflects the submitted fullName and contact_number from the update", async () => {
    await fc.assert(
      fc.asyncProperty(
        validFullNameArb,
        optionalContactNumberArb,
        async (fullName, contactNumber) => {
          resetCapture();

          const body = { fullName, contactNumber };
          const req = buildPatchRequest(body);
          const params = buildParams(FIXED_USER_ID);

          const res = await PATCH(req as never, params);
          expect(res.status).toBe(200);

          const row = await res.json();

          // full_name in the returned row must match what was submitted
          expect(row.full_name).toBe(fullName);

          // contact_number in the returned row: null for empty, else the value
          const expectedContactNumber =
            contactNumber === "" || contactNumber === undefined
              ? null
              : contactNumber;
          expect(row.contact_number).toBe(expectedContactNumber);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 9.3**
   *
   * Property 4: Empty fullName → 400 (schema-level validation blocks it).
   */
  it("returns 400 when fullName is empty (schema validation rejects it)", async () => {
    await fc.assert(
      fc.asyncProperty(
        optionalContactNumberArb,
        async (contactNumber) => {
          resetCapture();

          const body = { fullName: "", contactNumber };
          const req = buildPatchRequest(body);
          const params = buildParams(FIXED_USER_ID);

          const res = await PATCH(req as never, params);

          // --- Property 4: Empty fullName → 400 ---
          expect(res.status).toBe(400);

          const responseBody = await res.json();
          expect(responseBody.error).toBeDefined();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirements 9.2 (authorization)**
   *
   * Property 5: Non-owner userId in route param → 403.
   * The session user is always FIXED_USER_ID; any different id in the URL param
   * must result in a 403 Forbidden response.
   */
  it("returns 403 when the route :id does not match the authenticated user id", async () => {
    await fc.assert(
      fc.asyncProperty(
        validFullNameArb,
        optionalContactNumberArb,
        // Generate a userId that is different from FIXED_USER_ID
        fc
          .uuidV(4)
          .filter((id) => id !== FIXED_USER_ID),
        async (fullName, contactNumber, differentUserId) => {
          resetCapture();

          const body = { fullName, contactNumber };
          const req = buildPatchRequest(body);
          // Use a different id in params than what auth returns
          const params = buildParams(differentUserId);

          const res = await PATCH(req as never, params);

          // --- Property 5: Non-owner → 403 ---
          expect(res.status).toBe(403);

          const responseBody = await res.json();
          expect(responseBody.error).toBeDefined();
        }
      ),
      { numRuns: 30 }
    );
  });
});
