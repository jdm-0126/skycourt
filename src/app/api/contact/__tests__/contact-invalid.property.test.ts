/**
 * Property-based test: Contact Form Rejects Invalid Inputs
 *
 * **Validates: Requirements 3.3, 3.4**
 *
 * Property 3: Contact Form Rejects Invalid Inputs
 *   - For any contact form submission with at least one missing required field,
 *     the system must return a 400 response and must NOT insert any record.
 *   - For any string that is not a syntactically valid email address (no '@'),
 *     submitting it in the email field must produce a 400 response and no record.
 *
 * Strategy:
 *   - Mock `@/lib/supabase/admin` similarly to the 6.6 test, but assert
 *     that NO inserts occur on invalid input.
 *   - Drive the POST route handler directly with a synthetic Request object.
 *   - Also verify `contactSchema` rejects invalid inputs at the schema layer.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { contactSchema } from "@/lib/validation/contact";

// ---------------------------------------------------------------------------
// In-memory insert capture store — same pattern as 6.6 test
// ---------------------------------------------------------------------------

type InsertPayload = {
  sender_name: string;
  sender_email: string;
  message: string;
  [key: string]: unknown;
};

/** Mutable array — reset between tests. */
let capturedInserts: InsertPayload[] = [];

function resetCapture() {
  capturedInserts = [];
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin — captures inserts; we assert none happen on
// invalid input.
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
 * Non-empty string arbitrary (trimmed non-blank) for valid field values.
 */
const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/**
 * Valid email arbitrary matching the route handler regex:
 *   /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 */
const alphaStartLabel = fc
  .tuple(
    fc.stringMatching(/^[a-z]$/),
    fc.stringMatching(/^[a-z0-9]{1,9}$/)
  )
  .map(([first, rest]) => first + rest);

const tldArbitrary = fc.stringMatching(/^[a-z]{2,4}$/);

const validEmailArb = fc
  .tuple(alphaStartLabel, alphaStartLabel, tldArbitrary)
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * Invalid email arbitrary: strings that contain no '@' character.
 * These will never satisfy the route handler's email regex.
 */
const invalidEmailArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => !s.includes("@") && s.trim().length > 0);

/**
 * Missing / empty sender_name: empty string or null.
 */
const missingNameArb = fc.oneof(fc.constant(""), fc.constant(null));

/**
 * Missing / empty sender_email: empty string or null.
 */
const missingEmailArb = fc.oneof(fc.constant(""), fc.constant(null));

/**
 * Missing / empty message: empty string or null.
 */
const missingMessageArb = fc.oneof(fc.constant(""), fc.constant(null));

// ---------------------------------------------------------------------------
// Setup — reset the capture array before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetCapture();
});

// ---------------------------------------------------------------------------
// Property 3: Contact Form Rejects Invalid Inputs
// ---------------------------------------------------------------------------

describe("Property 3: Contact Form Rejects Invalid Inputs", () => {
  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * Missing name → 400 response, no DB insert.
   */
  it("returns 400 and inserts nothing when sender_name is missing or empty", async () => {
    await fc.assert(
      fc.asyncProperty(
        missingNameArb,
        validEmailArb,
        nonEmptyStringArb,
        async (sender_name, sender_email, message) => {
          resetCapture();

          const req = buildPostRequest({ sender_name, sender_email, message });
          const res = await POST(req as never);

          expect(res.status).toBe(400);
          expect(capturedInserts).toHaveLength(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * Missing email → 400 response, no DB insert.
   */
  it("returns 400 and inserts nothing when sender_email is missing or empty", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyStringArb,
        missingEmailArb,
        nonEmptyStringArb,
        async (sender_name, sender_email, message) => {
          resetCapture();

          const req = buildPostRequest({ sender_name, sender_email, message });
          const res = await POST(req as never);

          expect(res.status).toBe(400);
          expect(capturedInserts).toHaveLength(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * Missing message → 400 response, no DB insert.
   */
  it("returns 400 and inserts nothing when message is missing or empty", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyStringArb,
        validEmailArb,
        missingMessageArb,
        async (sender_name, sender_email, message) => {
          resetCapture();

          const req = buildPostRequest({ sender_name, sender_email, message });
          const res = await POST(req as never);

          expect(res.status).toBe(400);
          expect(capturedInserts).toHaveLength(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * Invalid email format (no '@') → 400 response, no DB insert.
   */
  it("returns 400 and inserts nothing when sender_email has no '@' sign", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyStringArb,
        invalidEmailArb,
        nonEmptyStringArb,
        async (sender_name, sender_email, message) => {
          resetCapture();

          const req = buildPostRequest({ sender_name, sender_email, message });
          const res = await POST(req as never);

          expect(res.status).toBe(400);
          expect(capturedInserts).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * All fields missing → 400 response, no DB insert.
   */
  it("returns 400 and inserts nothing when all fields are missing", async () => {
    await fc.assert(
      fc.asyncProperty(
        missingNameArb,
        missingEmailArb,
        missingMessageArb,
        async (sender_name, sender_email, message) => {
          resetCapture();

          const req = buildPostRequest({ sender_name, sender_email, message });
          const res = await POST(req as never);

          expect(res.status).toBe(400);
          expect(capturedInserts).toHaveLength(0);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ---------------------------------------------------------------------------
// Supporting property: contactSchema rejects invalid inputs at schema layer
// ---------------------------------------------------------------------------

describe("contactSchema rejects invalid contact form inputs", () => {
  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * Empty or missing senderName → safeParse fails.
   */
  it("fails safeParse when senderName is empty", () => {
    fc.assert(
      fc.property(validEmailArb, nonEmptyStringArb, (senderEmail, message) => {
        const result = contactSchema.safeParse({
          senderName: "",
          senderEmail,
          message,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * Invalid email (no '@') → safeParse fails.
   */
  it("fails safeParse when senderEmail is not a valid email address", () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        invalidEmailArb,
        nonEmptyStringArb,
        (senderName, senderEmail, message) => {
          const result = contactSchema.safeParse({
            senderName,
            senderEmail,
            message,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * Empty message → safeParse fails.
   */
  it("fails safeParse when message is empty", () => {
    fc.assert(
      fc.property(nonEmptyStringArb, validEmailArb, (senderName, senderEmail) => {
        const result = contactSchema.safeParse({
          senderName,
          senderEmail,
          message: "",
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 30 }
    );
  });
});
