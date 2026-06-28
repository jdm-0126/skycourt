/**
 * Property-based test: Contact Form Saves Valid Submissions
 *
 * **Validates: Requirements 3.2**
 *
 * Property 2: Contact Form Saves Valid Submissions
 *   For any valid contact form submission (non-empty name, valid email format,
 *   non-empty message), the system must create a `contact_messages` record
 *   whose `sender_name`, `sender_email`, and `message` fields exactly match
 *   the submitted values.
 *
 * Strategy:
 *   - Mock `@/lib/supabase/admin` with an in-memory store that captures inserts.
 *   - Drive the POST route handler directly with a synthetic Request object.
 *   - Assert response status is 201.
 *   - Assert the captured insert payload exactly matches the submitted fields.
 *   - Also verify `contactSchema` accepts all valid inputs (schema-level property).
 *
 * Note: The route handler trims whitespace from submitted values, so the
 * comparison is done against the trimmed versions of the generated inputs.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { contactSchema } from "@/lib/validation/contact";

// ---------------------------------------------------------------------------
// In-memory insert capture store
// ---------------------------------------------------------------------------

type InsertPayload = {
  sender_name: string;
  sender_email: string;
  message: string;
  [key: string]: unknown;
};

/** Mutable array — reset between tests. The mock factory closes over this
 *  reference so every call to `insert` appends here. */
let capturedInserts: InsertPayload[] = [];

function resetCapture() {
  capturedInserts = [];
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin — captures inserts into contact_messages.
//
// The factory uses a closure over the `capturedInserts` variable so that
// appended payloads are visible in the test body.  We intentionally avoid
// re-creating the mock in beforeEach (which would lose the closure) — instead
// we just reset the array contents.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => {
  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table !== "contact_messages") {
          throw new Error(`Unexpected table in admin mock: ${table}`);
        }
        return {
          insert: vi.fn(async (payload: InsertPayload) => {
            capturedInserts.push(payload);
            return { data: null, error: null };
          }),
        };
      }),
    })),
  };
});

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are in place
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/contact/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Request object for the POST handler with a JSON body. */
function buildPostRequest(body: unknown): Request {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Safe email arbitrary that generates emails matching the route handler's regex:
 *   /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 */
const alphaStartLabel = fc
  .tuple(
    fc.stringMatching(/^[a-z]$/),
    fc.stringMatching(/^[a-z0-9]{1,9}$/)
  )
  .map(([first, rest]) => first + rest);

const tldArbitrary = fc.stringMatching(/^[a-z]{2,4}$/);

const safeEmailArbitrary = fc
  .tuple(alphaStartLabel, alphaStartLabel, tldArbitrary)
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * Valid contact form submission in snake_case — matching the route handler's
 * expected field names (sender_name, sender_email, message).
 */
const validContactArbitrary = fc.record({
  sender_name: fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0),
  sender_email: safeEmailArbitrary,
  message: fc
    .string({ minLength: 1, maxLength: 500 })
    .filter((s) => s.trim().length > 0),
});

/**
 * For the schema-level property: camelCase input matching contactSchema
 * (senderName, senderEmail, message).
 */
const validContactSchemaCamelArbitrary = fc.record({
  senderName: fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0),
  senderEmail: safeEmailArbitrary,
  message: fc
    .string({ minLength: 1, maxLength: 500 })
    .filter((s) => s.trim().length > 0),
});

// ---------------------------------------------------------------------------
// Setup — only reset the capture array; do NOT clearAllMocks since that
// would wipe the mock implementation set up by vi.mock above.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetCapture();
});

// ---------------------------------------------------------------------------
// Property 2: Contact Form Saves Valid Submissions
// ---------------------------------------------------------------------------

describe("Property 2: Contact Form Saves Valid Submissions", () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For any valid submission (non-empty name, valid email, non-empty message):
   *   1. POST /api/contact responds with 201.
   *   2. Exactly one record is inserted into contact_messages.
   *   3. The inserted record's sender_name, sender_email, and message
   *      exactly match the submitted values (after trimming).
   */
  it("responds 201 and inserts a record matching the submitted fields for any valid input", async () => {
    await fc.assert(
      fc.asyncProperty(validContactArbitrary, async (input) => {
        resetCapture();

        const req = buildPostRequest(input);
        const res = await POST(req as never);

        // Response must be 201
        expect(res.status).toBe(201);

        const body = await res.json();
        expect(body.success).toBe(true);

        // Exactly one insert must have been captured
        expect(capturedInserts).toHaveLength(1);

        const inserted = capturedInserts[0];

        // The inserted payload must exactly match the submitted values (trimmed)
        expect(inserted.sender_name).toBe(input.sender_name.trim());
        expect(inserted.sender_email).toBe(input.sender_email.trim());
        expect(inserted.message).toBe(input.message.trim());
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * No extra mutation: each POST creates exactly one insert, not more.
   */
  it("creates exactly one contact_messages record per submission", async () => {
    await fc.assert(
      fc.asyncProperty(validContactArbitrary, async (input) => {
        resetCapture();

        const req = buildPostRequest(input);
        await POST(req as never);

        expect(capturedInserts).toHaveLength(1);
      }),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Supporting property: contactSchema accepts all valid inputs
// ---------------------------------------------------------------------------

describe("contactSchema accepts all valid contact form inputs", () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * Any input satisfying (non-empty name, valid email, non-empty message)
   * must pass contactSchema validation without throwing.
   * This confirms the form layer would not block a valid submission.
   */
  it("does not throw for any valid contact input", () => {
    fc.assert(
      fc.property(validContactSchemaCamelArbitrary, (input) => {
        expect(() => contactSchema.parse(input)).not.toThrow();
      }),
      { numRuns: 50 }
    );
  });
});
