/**
 * Property-based tests: Contact Message Inbox Completeness & Status Transitions
 *
 * **Validates: Requirements 15.1, 15.2, 15.3**
 *
 * Property 25: Contact Message Inbox Completeness
 *   For any set of contact_messages records, GET /api/contact must return ALL
 *   non-archived messages and MUST NOT return any archived message.
 *
 * Property 26: Contact Message Status Transitions
 *   - PATCH /api/contact/:id with { action: "reply" }   → sets status to "replied"
 *     (unless already archived, in which case the record is returned unchanged)
 *   - PATCH /api/contact/:id with { action: "archive" } → always sets status to
 *     "archived", overriding any current status including "replied"
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns an admin user.
 *   - Mock `@/lib/supabase/admin` with an in-memory Map<id, ContactMessage>
 *     that supports the query chains used by both route handlers.
 *   - Import the GET handler from route.ts and the PATCH handler from [id]/route.ts.
 *   - Generate arbitrary sets of contact messages; assert properties hold for
 *     any combination.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContactStatus = "unread" | "read" | "replied" | "archived";

interface ContactMessage {
  id: string;
  sender_name: string;
  sender_email: string;
  message: string;
  status: ContactStatus;
  created_at: string;
}

// ---------------------------------------------------------------------------
// In-memory store — reset before each property run
// ---------------------------------------------------------------------------

let store: Map<string, ContactMessage>;

function resetStore(messages: ContactMessage[]) {
  store = new Map(messages.map((m) => [m.id, { ...m }]));
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server — auth.getUser returns an admin user
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
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
  })),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin — chainable builder over in-memory store
//
// The GET handler calls:
//   adminClient.from("contact_messages").select("*").order("created_at", { ascending: false })
//   → resolves to { data: ContactMessage[], error: null }
//
// The PATCH handler calls:
//   1. adminClient.from("contact_messages").select("*").eq("id", id).maybeSingle()
//   2. adminClient.from("contact_messages").update({ status }).eq("id", id).select().single()
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table !== "contact_messages") {
        throw new Error(`Unexpected table in admin mock: ${table}`);
      }

      return {
        // --- GET path: .select("*").neq("status","archived").order(...) ---
        // --- PATCH fetch path: .select("*").eq("id", id).maybeSingle() ---
        select: vi.fn((_cols: string) => {
          // We need a chain that supports both:
          //   GET:   .neq(col, val).order(...)
          //   PATCH: .eq(col, id).maybeSingle()
          let filterFn: (row: ContactMessage) => boolean = () => true;

          const chain: Record<string, unknown> = {
            // GET path: .neq("status", "archived")
            neq: vi.fn((col: string, val: string) => {
              filterFn = (row) =>
                (row as Record<string, unknown>)[col] !== val;
              return chain;
            }),

            // GET path: .order("created_at", { ascending: false })
            order: vi.fn((_col: string, _opts?: unknown) => ({
              then(
                resolve: (v: { data: ContactMessage[]; error: null }) => void
              ) {
                const rows = Array.from(store.values()).filter(filterFn);
                rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
                resolve({ data: rows, error: null });
              },
            })),

            // PATCH fetch path: .eq("id", id).maybeSingle()
            eq: vi.fn((_col: string, id: string) => ({
              maybeSingle: vi.fn(async () => {
                const row = store.get(id) ?? null;
                return { data: row, error: null };
              }),
            })),
          };

          return chain;
        }),

        // --- PATCH update path: .update({...}).eq("id", id).select().single() ---
        update: vi.fn((patch: Partial<ContactMessage>) => ({
          eq: vi.fn((_col: string, id: string) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const existing = store.get(id);
                if (!existing) {
                  return { data: null, error: { message: "row not found" } };
                }
                const updated: ContactMessage = { ...existing, ...patch };
                store.set(id, updated);
                return { data: updated, error: null };
              }),
            })),
          })),
        })),
      };
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are set up
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/contact/route";
import { PATCH } from "@/app/api/contact/[id]/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGetRequest(): NextRequest {
  return new NextRequest("http://localhost/api/contact", { method: "GET" });
}

function buildPatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/contact/test-id", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildRouteParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const ALL_STATUSES: ContactStatus[] = ["unread", "read", "replied", "archived"];
const NON_ARCHIVED_STATUSES: ContactStatus[] = ["unread", "read", "replied"];

const contactMessageArb = (
  statusArb: fc.Arbitrary<ContactStatus> = fc.constantFrom(...ALL_STATUSES)
): fc.Arbitrary<ContactMessage> =>
  fc.record({
    id: fc.uuid(),
    sender_name: fc.string({ minLength: 1, maxLength: 50 }),
    sender_email: fc.string({ minLength: 5, maxLength: 50 }),
    message: fc.string({ minLength: 1, maxLength: 200 }),
    status: statusArb,
    created_at: fc
      .date({
        min: new Date("2024-01-01"),
        max: new Date("2025-12-31"),
      })
      .map((d) => d.toISOString()),
  });

const messagesArb = fc.array(contactMessageArb(), {
  minLength: 0,
  maxLength: 20,
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 25: Contact Message Inbox Completeness
// ---------------------------------------------------------------------------

describe("Property 25: Contact Message Inbox Completeness", () => {
  /**
   * **Validates: Requirements 15.1**
   *
   * Core inbox property: GET /api/contact must return ALL non-archived messages
   * and exclude ALL archived messages, for any arbitrary set of messages.
   */
  it("returns all non-archived messages and excludes all archived messages", async () => {
    await fc.assert(
      fc.asyncProperty(messagesArb, async (messages) => {
        resetStore(messages);

        const req = buildGetRequest();
        const res = await GET(req);

        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: ContactMessage[] = body.messages;
        const returnedIds = new Set(returned.map((m) => m.id));

        // Every non-archived message must be present
        const nonArchived = messages.filter((m) => m.status !== "archived");
        for (const msg of nonArchived) {
          expect(returnedIds.has(msg.id)).toBe(true);
        }

        // No archived message must appear in the response
        const archived = messages.filter((m) => m.status === "archived");
        for (const msg of archived) {
          expect(returnedIds.has(msg.id)).toBe(false);
        }
      }),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 15.1**
   *
   * Completeness count: the number of messages returned equals the number of
   * non-archived messages in the store.
   */
  it("returned count equals number of non-archived messages in the store", async () => {
    await fc.assert(
      fc.asyncProperty(messagesArb, async (messages) => {
        resetStore(messages);

        const req = buildGetRequest();
        const res = await GET(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        const nonArchivedCount = messages.filter(
          (m) => m.status !== "archived"
        ).length;

        expect(body.messages).toHaveLength(nonArchivedCount);
      }),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 15.1**
   *
   * Empty store: GET returns an empty array when there are no messages.
   */
  it("returns empty array when the store is empty", async () => {
    resetStore([]);

    const req = buildGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.messages).toHaveLength(0);
  });

  /**
   * **Validates: Requirements 15.1**
   *
   * All-archived store: GET returns an empty array when every message is archived.
   */
  it("returns empty array when all messages are archived", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(contactMessageArb(fc.constant("archived" as ContactStatus)), {
          minLength: 1,
          maxLength: 15,
        }),
        async (messages) => {
          resetStore(messages);

          const req = buildGetRequest();
          const res = await GET(req);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.messages).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 15.1**
   *
   * All-non-archived store: GET returns every message when none are archived.
   */
  it("returns every message when none are archived", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          contactMessageArb(fc.constantFrom(...NON_ARCHIVED_STATUSES)),
          { minLength: 1, maxLength: 15 }
        ),
        async (messages) => {
          resetStore(messages);

          const req = buildGetRequest();
          const res = await GET(req);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.messages).toHaveLength(messages.length);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 26: Contact Message Status Transitions
// ---------------------------------------------------------------------------

describe("Property 26: Contact Message Status Transitions", () => {
  /**
   * **Validates: Requirements 15.2**
   *
   * Reply transition: for any non-archived message, PATCH with action="reply"
   * must set status to "replied" and nothing else.
   */
  it("sets status to replied when action=reply on a non-archived message", async () => {
    await fc.assert(
      fc.asyncProperty(
        contactMessageArb(
          fc.constantFrom(...NON_ARCHIVED_STATUSES)
        ),
        async (message) => {
          resetStore([message]);

          const req = buildPatchRequest({ action: "reply" });
          const params = buildRouteParams(message.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.message.status).toBe("replied");

          // In-store record also updated
          const inStore = store.get(message.id);
          expect(inStore?.status).toBe("replied");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 15.3**
   *
   * Archive transition: for any message (any current status), PATCH with
   * action="archive" must always set status to "archived".
   */
  it("always sets status to archived when action=archive regardless of current status", async () => {
    await fc.assert(
      fc.asyncProperty(
        contactMessageArb(fc.constantFrom(...ALL_STATUSES)),
        async (message) => {
          resetStore([message]);

          const req = buildPatchRequest({ action: "archive" });
          const params = buildRouteParams(message.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.message.status).toBe("archived");

          // In-store record also updated
          const inStore = store.get(message.id);
          expect(inStore?.status).toBe("archived");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 15.3**
   *
   * Archive overrides reply: archiving an already-replied message sets status
   * to "archived", not "replied".
   */
  it("sets status to archived when archiving an already-replied message", async () => {
    await fc.assert(
      fc.asyncProperty(
        contactMessageArb(fc.constant("replied" as ContactStatus)),
        async (message) => {
          resetStore([message]);

          const req = buildPatchRequest({ action: "archive" });
          const params = buildRouteParams(message.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.message.status).toBe("archived");
          expect(body.message.status).not.toBe("replied");

          const inStore = store.get(message.id);
          expect(inStore?.status).toBe("archived");
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 15.3**
   *
   * Archive is idempotent: archiving an already-archived message returns 200
   * with status still "archived".
   */
  it("archiving an already-archived message is idempotent — status remains archived", async () => {
    await fc.assert(
      fc.asyncProperty(
        contactMessageArb(fc.constant("archived" as ContactStatus)),
        async (message) => {
          resetStore([message]);

          const req = buildPatchRequest({ action: "archive" });
          const params = buildRouteParams(message.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.message.status).toBe("archived");
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 15.3**
   *
   * Archive precedence over concurrent reply: when a message is archived,
   * a subsequent reply action must NOT change the status back to "replied".
   * The route returns the archived record unchanged (200, status = "archived").
   */
  it("reply action on an archived message does not change status — archive takes precedence", async () => {
    await fc.assert(
      fc.asyncProperty(
        contactMessageArb(fc.constant("archived" as ContactStatus)),
        async (message) => {
          resetStore([message]);

          const req = buildPatchRequest({ action: "reply" });
          const params = buildRouteParams(message.id);

          const res = await PATCH(req, params);
          // The route returns 200 with the existing archived record unchanged
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.message.status).toBe("archived");
          expect(body.message.status).not.toBe("replied");

          // In-store record must remain archived
          const inStore = store.get(message.id);
          expect(inStore?.status).toBe("archived");
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 15.2, 15.3**
   *
   * Reply then archive: after replying to a message and then archiving it,
   * the final status must be "archived" and the message must not appear in
   * GET /api/contact (inbox completeness after transition).
   */
  it("reply then archive: final status is archived and message absent from inbox", async () => {
    await fc.assert(
      fc.asyncProperty(
        contactMessageArb(
          fc.constantFrom(...NON_ARCHIVED_STATUSES)
        ),
        async (message) => {
          resetStore([message]);

          // Step 1: reply
          const replyReq = buildPatchRequest({ action: "reply" });
          const replyRes = await PATCH(replyReq, buildRouteParams(message.id));
          expect(replyRes.status).toBe(200);
          expect((await replyRes.json()).message.status).toBe("replied");

          // Step 2: archive
          const archiveReq = buildPatchRequest({ action: "archive" });
          const archiveRes = await PATCH(
            archiveReq,
            buildRouteParams(message.id)
          );
          expect(archiveRes.status).toBe(200);
          expect((await archiveRes.json()).message.status).toBe("archived");

          // Step 3: verify inbox excludes the now-archived message
          const getReq = buildGetRequest();
          const getRes = await GET(getReq);
          expect(getRes.status).toBe(200);

          const { messages } = await getRes.json();
          const ids = new Set(messages.map((m: ContactMessage) => m.id));
          expect(ids.has(message.id)).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});
