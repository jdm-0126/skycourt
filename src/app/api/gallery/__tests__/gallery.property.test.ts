/**
 * Property-based tests for Gallery Management
 *
 * **Validates: Requirements 14.3, 14.4, 14.5**
 *
 * Property 23: Gallery Ordering Is Preserved
 *   For any assignment of `display_order` values to gallery images, the gallery
 *   endpoint must return images sorted ascending by `display_order`, and the
 *   public home page gallery preview must use the same ascending order.
 *
 * Property 24: Gallery Deletion Removes from Storage and Records
 *   For any gallery image, after an admin deletes it, no `gallery_images`
 *   record with that ID must exist, and Supabase Storage must have been
 *   instructed to remove the corresponding file.
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns an admin user.
 *   - Mock `@/lib/supabase/admin` with a chainable query builder backed by
 *     an in-memory Map<id, GalleryImageRow>.  The mock supports:
 *       .from("gallery_images").select("*").order("display_order", { ascending: true })
 *       .from("gallery_images").select("id, storage_path").eq("id", id).maybeSingle()
 *       .from("gallery_images").delete().eq("id", id)
 *     and a mock storage client that records remove() calls.
 *   - Generate arbitrary sets of gallery images with random display_order values
 *     and verify the invariants directly against the route handlers.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GalleryImageRow = {
  id: string;
  storage_path: string;
  public_url: string;
  display_order: number;
  uploaded_by: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

let store: Map<string, GalleryImageRow>;
let storageRemoveCalls: string[][];

function resetStore(rows: GalleryImageRow[]) {
  store = new Map(rows.map((r) => [r.id, r]));
  storageRemoveCalls = [];
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
    // Public GET /api/gallery also uses the server client (not admin client)
    from: vi.fn((table: string) => {
      if (table !== "gallery_images") {
        throw new Error(`Unexpected table in server mock: ${table}`);
      }

      type OrderOpts = { ascending?: boolean };

      const builder: Record<string, unknown> = {
        select: vi.fn(() => builder),

        order: vi.fn((_col: string, opts?: OrderOpts) => {
          // Capture ascending flag for later use
          (builder as { _ascending: boolean })._ascending =
            opts?.ascending !== false;
          return builder;
        }),

        // Make the builder thenable — resolves sorted rows
        then(
          resolve: (value: { data: GalleryImageRow[]; error: null }) => void,
          _reject?: (reason: unknown) => void
        ) {
          const rows = Array.from(store.values());
          const ascending = (builder as { _ascending?: boolean })._ascending !== false;
          rows.sort((a, b) =>
            ascending
              ? a.display_order - b.display_order
              : b.display_order - a.display_order
          );
          resolve({ data: rows, error: null });
        },
      };

      return builder;
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin
//
// The DELETE route uses adminClient:
//   .from("gallery_images").select("id, storage_path").eq("id", id).maybeSingle()
//   .from("gallery_images").delete().eq("id", id)
// And storage:
//   .storage.from("gallery").remove([path])
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    const adminDb = {
      from: vi.fn((table: string) => {
        if (table !== "gallery_images") {
          throw new Error(`Unexpected table in admin mock: ${table}`);
        }

        let targetId: string | null = null;
        let operation: "select" | "delete" = "select";

        const builder: Record<string, unknown> = {
          select: vi.fn(() => {
            operation = "select";
            return builder;
          }),

          delete: vi.fn(() => {
            operation = "delete";
            return builder;
          }),

          eq: vi.fn((_col: string, value: string) => {
            targetId = value;
            return builder;
          }),

          maybeSingle: vi.fn(() => {
            // Returns a Promise for the single row fetch used in DELETE route step 3
            const row = targetId ? (store.get(targetId) ?? null) : null;
            if (row) {
              return Promise.resolve({ data: row, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }),

          // Make the builder thenable for the .delete().eq() chain
          then(
            resolve: (value: { data: null; error: null }) => void,
            _reject?: (reason: unknown) => void
          ) {
            if (operation === "delete" && targetId) {
              store.delete(targetId);
            }
            resolve({ data: null, error: null });
          },
        };

        return builder;
      }),
    };

    const adminStorage = {
      storage: {
        from: vi.fn((_bucket: string) => ({
          remove: vi.fn((paths: string[]) => {
            storageRemoveCalls.push(paths);
            return Promise.resolve({ error: null });
          }),
          getPublicUrl: vi.fn((path: string) => ({
            data: { publicUrl: `https://storage.example.com/${path}` },
          })),
          upload: vi.fn(async () => ({ error: null })),
          createBucket: vi.fn(async () => ({ error: null })),
        })),
        createBucket: vi.fn(async () => ({ error: null })),
      },
    };

    return { ...adminDb, ...adminStorage };
  }),
}));

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are set up
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/gallery/route";
import { DELETE } from "@/app/api/gallery/[id]/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGetRequest(): NextRequest {
  return new NextRequest("http://localhost/api/gallery", { method: "GET" });
}

function buildDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/gallery/${id}`, {
    method: "DELETE",
  });
}

/** Simulate the params resolution the Next.js runtime provides */
function buildDeleteParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a single gallery image row */
const galleryImageArbitrary: fc.Arbitrary<GalleryImageRow> = fc.record({
  id: fc.uuid(),
  storage_path: fc
    .uuid()
    .map((u) => `${u}.jpg`),
  public_url: fc
    .uuid()
    .map((u) => `https://storage.example.com/${u}.jpg`),
  display_order: fc.integer({ min: 0, max: 1000 }),
  uploaded_by: fc.option(fc.uuid(), { nil: null }),
  created_at: fc.constant(new Date().toISOString()),
});

/** Arbitrary for a list of 1–15 gallery images with unique IDs */
const galleryImagesArbitrary: fc.Arbitrary<GalleryImageRow[]> = fc
  .array(galleryImageArbitrary, { minLength: 1, maxLength: 15 })
  .filter((imgs) => {
    // Ensure all IDs are unique
    const ids = imgs.map((i) => i.id);
    return new Set(ids).size === ids.length;
  });

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetStore([]);
});

// ===========================================================================
// Property 23: Gallery Ordering Is Preserved
// ===========================================================================

describe("Property 23: Gallery Ordering Is Preserved", () => {
  /**
   * **Validates: Requirements 14.4, 14.5**
   *
   * Core ordering property: for any set of gallery images with any
   * display_order values, GET /api/gallery must return them sorted
   * ascending by display_order.
   */
  it("GET /api/gallery returns images sorted ascending by display_order for any input", async () => {
    await fc.assert(
      fc.asyncProperty(galleryImagesArbitrary, async (images) => {
        resetStore(images);

        const req = buildGetRequest();
        const res = await GET(req as never);

        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: GalleryImageRow[] = body.images ?? [];

        // Must return all images
        expect(returned.length).toBe(images.length);

        // Must be sorted ascending by display_order
        for (let i = 1; i < returned.length; i++) {
          expect(returned[i].display_order).toBeGreaterThanOrEqual(
            returned[i - 1].display_order
          );
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.4, 14.5**
   *
   * Completeness: GET /api/gallery returns all images — no image is omitted.
   */
  it("GET /api/gallery returns all images — no image is omitted", async () => {
    await fc.assert(
      fc.asyncProperty(galleryImagesArbitrary, async (images) => {
        resetStore(images);

        const req = buildGetRequest();
        const res = await GET(req as never);

        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: GalleryImageRow[] = body.images ?? [];

        const returnedIds = new Set(returned.map((img) => img.id));
        for (const img of images) {
          expect(returnedIds.has(img.id)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.4, 14.5**
   *
   * Order identity: the ordering of the returned images by display_order
   * is the same as sorting the input images by display_order.
   * This verifies that the sort is stable and consistent with what the
   * home page gallery preview would render.
   */
  it("returned order matches client-side sort by display_order — same order home page would render", async () => {
    await fc.assert(
      fc.asyncProperty(galleryImagesArbitrary, async (images) => {
        resetStore(images);

        const req = buildGetRequest();
        const res = await GET(req as never);

        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: GalleryImageRow[] = body.images ?? [];

        // The expected order is ascending display_order (matching home page logic)
        const expected = [...images].sort(
          (a, b) => a.display_order - b.display_order
        );

        // Verify each position has the same image ID
        expect(returned.length).toBe(expected.length);
        for (let i = 0; i < returned.length; i++) {
          expect(returned[i].id).toBe(expected[i].id);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.4, 14.5**
   *
   * Single image: a gallery with exactly one image is trivially ordered.
   */
  it("single-image gallery is trivially ordered", async () => {
    await fc.assert(
      fc.asyncProperty(galleryImageArbitrary, async (image) => {
        resetStore([image]);

        const req = buildGetRequest();
        const res = await GET(req as never);

        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: GalleryImageRow[] = body.images ?? [];

        expect(returned.length).toBe(1);
        expect(returned[0].id).toBe(image.id);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 14.4, 14.5**
   *
   * Empty gallery: GET /api/gallery returns an empty array when there are
   * no images.
   */
  it("returns empty array when gallery has no images", async () => {
    resetStore([]);

    const req = buildGetRequest();
    const res = await GET(req as never);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.images).toEqual([]);
  });
});

// ===========================================================================
// Property 24: Gallery Deletion Removes from Storage and Records
// ===========================================================================

describe("Property 24: Gallery Deletion Removes from Storage and Records", () => {
  /**
   * **Validates: Requirements 14.3**
   *
   * Core deletion property: after deleting a gallery image, the image
   * record must no longer exist in the store.
   */
  it("DELETE removes the gallery_images record — image ID no longer in store", async () => {
    await fc.assert(
      fc.asyncProperty(
        galleryImagesArbitrary,
        fc.integer({ min: 0, max: 14 }),
        async (images, indexSeed) => {
          resetStore(images);
          const targetIndex = indexSeed % images.length;
          const target = images[targetIndex];

          const req = buildDeleteRequest(target.id);
          const res = await DELETE(req as never, buildDeleteParams(target.id));

          expect(res.status).toBe(200);
          const body = await res.json();
          expect(body.success).toBe(true);

          // Record must no longer exist in store
          expect(store.has(target.id)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.3**
   *
   * Storage cleanup: after deleting a gallery image, the storage.remove()
   * call must have been made with the correct storage_path.
   */
  it("DELETE calls storage.remove() with the image's storage_path", async () => {
    await fc.assert(
      fc.asyncProperty(
        galleryImagesArbitrary,
        fc.integer({ min: 0, max: 14 }),
        async (images, indexSeed) => {
          resetStore(images);
          const targetIndex = indexSeed % images.length;
          const target = images[targetIndex];

          const req = buildDeleteRequest(target.id);
          const res = await DELETE(req as never, buildDeleteParams(target.id));

          expect(res.status).toBe(200);

          // Storage remove must have been called
          expect(storageRemoveCalls.length).toBeGreaterThan(0);

          // The deleted storage_path must appear in one of the remove calls
          const allRemovedPaths = storageRemoveCalls.flat();
          expect(allRemovedPaths).toContain(target.storage_path);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.3**
   *
   * Non-target records are preserved: after deleting one image, all other
   * images must still exist in the store.
   */
  it("DELETE removes only the targeted image — all other records are preserved", async () => {
    await fc.assert(
      fc.asyncProperty(
        galleryImagesArbitrary,
        fc.integer({ min: 0, max: 14 }),
        async (images, indexSeed) => {
          resetStore(images);
          const targetIndex = indexSeed % images.length;
          const target = images[targetIndex];
          const remaining = images.filter((img) => img.id !== target.id);

          const req = buildDeleteRequest(target.id);
          const res = await DELETE(req as never, buildDeleteParams(target.id));

          expect(res.status).toBe(200);

          // All other records must still be in the store
          for (const img of remaining) {
            expect(store.has(img.id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.3**
   *
   * Non-existent image: DELETE for an image ID not in the store must
   * return 404.
   */
  it("DELETE returns 404 when image does not exist", async () => {
    await fc.assert(
      fc.asyncProperty(
        galleryImagesArbitrary,
        fc.uuid(),
        async (images, nonExistentId) => {
          // Ensure the generated ID is not in the store
          resetStore(images);

          // Skip this run if the UUID happens to collide with an existing ID
          if (store.has(nonExistentId)) return;

          const req = buildDeleteRequest(nonExistentId);
          const res = await DELETE(
            req as never,
            buildDeleteParams(nonExistentId)
          );

          expect(res.status).toBe(404);

          const body = await res.json();
          expect(body.error).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 14.3**
   *
   * Idempotency check: attempting to delete the same image twice — the
   * second attempt must return 404 because the record is already gone.
   */
  it("second DELETE of the same image returns 404", async () => {
    await fc.assert(
      fc.asyncProperty(galleryImagesArbitrary, async (images) => {
        resetStore(images);
        const target = images[0];

        // First delete — should succeed
        const req1 = buildDeleteRequest(target.id);
        const res1 = await DELETE(req1 as never, buildDeleteParams(target.id));
        expect(res1.status).toBe(200);

        // Second delete — should return 404
        const req2 = buildDeleteRequest(target.id);
        const res2 = await DELETE(req2 as never, buildDeleteParams(target.id));
        expect(res2.status).toBe(404);
      }),
      { numRuns: 50 }
    );
  });
});
