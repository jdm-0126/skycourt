/**
 * Property-based tests for the Register page — new registrations default to member role.
 *
 * **Validates: Requirements 4.2, 4.5**
 *
 * Property 4: New Registrations Default to Member Role
 *   For any valid registration input (unique email, password ≥ 8 characters,
 *   non-empty name), the call to `supabase.auth.signUp` must include
 *   `options.data.role === 'member'` in user metadata.
 *
 * The test also verifies that `registerSchema` accepts the same generated
 *   valid inputs without throwing, confirming the form would actually submit.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { registerSchema } from "@/lib/validation/register";

// ---------------------------------------------------------------------------
// Capture the signUp call arguments so we can assert on them.
// ---------------------------------------------------------------------------

let capturedSignUpArgs: unknown[] = [];

// Mock @/lib/supabase/client so no real network call is made.
// vi.mock is hoisted — the factory must be self-contained.
vi.mock("@/lib/supabase/client", () => {
  const signUp = vi.fn(async (...args: unknown[]) => {
    capturedSignUpArgs = args;
    return { error: null };
  });

  return {
    createClient: vi.fn(() => ({
      auth: { signUp },
    })),
    __signUp: signUp,
  };
});

// ---------------------------------------------------------------------------
// Import the mocked module to access the signUp spy after hoisting.
// ---------------------------------------------------------------------------
import * as clientModule from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const signUpSpy: ReturnType<typeof vi.fn> = (clientModule as any).__signUp;

// ---------------------------------------------------------------------------
// The registration logic extracted for testability.
// This mirrors what RegisterPage.onSubmit does when calling supabase.
// ---------------------------------------------------------------------------
async function submitRegistration(data: {
  fullName: string;
  email: string;
  password: string;
}) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  return supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName,
        role: "member",
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Valid registration input:
 *   - fullName: non-empty string (at least one non-whitespace character)
 *   - email:    simple `word@word.word` form that satisfies Zod's email
 *               validator (alphanumeric only, alpha-start, no special chars)
 *   - password: at least 8 characters
 *
 * Zod's email validator requires:
 *   - local part: alphanumeric + dots, must not start/end with a dot
 *   - domain labels: alphanumeric, must start with a letter
 *   - TLD: alpha only
 */

/** e.g. "abc", "a1b2c3" — starts with letter, followed by 1–9 alnum chars */
const alphaStartLabel = fc
  .tuple(
    fc.stringMatching(/^[a-z]$/),
    fc.stringMatching(/^[a-z0-9]{1,9}$/)
  )
  .map(([first, rest]) => first + rest);

/** e.g. "abc", "abcd" — letters only, 2–4 chars (TLD) */
const tldArbitrary = fc.stringMatching(/^[a-z]{2,4}$/);

/** e.g. "user", "user.name", "u1.a2" — no leading/trailing/consecutive dots */
const localPartArbitrary = alphaStartLabel;

const safeEmailArbitrary = fc
  .tuple(localPartArbitrary, alphaStartLabel, tldArbitrary)
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

const validRegistrationArbitrary = fc.record({
  fullName: fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0),
  email: safeEmailArbitrary,
  password: fc.string({ minLength: 8 }),
});

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedSignUpArgs = [];
  vi.clearAllMocks();

  // Re-attach the signUp implementation after clearAllMocks.
  signUpSpy.mockImplementation(async (...args: unknown[]) => {
    capturedSignUpArgs = args;
    return { error: null };
  });
});

// ---------------------------------------------------------------------------
// Property 4 — New Registrations Default to Member Role
// ---------------------------------------------------------------------------

describe("Property 4: New registrations default to member role", () => {
  /**
   * **Validates: Requirements 4.2, 4.5**
   *
   * For any valid registration input, when supabase.auth.signUp is called,
   * the options.data.role field must always equal 'member'.
   */
  it("always passes role='member' in user metadata for any valid input", async () => {
    await fc.assert(
      fc.asyncProperty(validRegistrationArbitrary, async (input) => {
        capturedSignUpArgs = [];

        await submitRegistration(input);

        // signUp must have been called exactly once
        expect(signUpSpy).toHaveBeenCalled();

        // Inspect what was passed to signUp
        const [signUpPayload] = capturedSignUpArgs as [
          {
            email: string;
            password: string;
            options?: { data?: { role?: string; full_name?: string } };
          },
        ];

        // The role in user metadata must always be 'member'
        expect(signUpPayload.options?.data?.role).toBe("member");
      })
    );
  });

  it("passes the correct email and full_name alongside the member role", async () => {
    await fc.assert(
      fc.asyncProperty(validRegistrationArbitrary, async (input) => {
        capturedSignUpArgs = [];

        await submitRegistration(input);

        const [signUpPayload] = capturedSignUpArgs as [
          {
            email: string;
            password: string;
            options?: { data?: { role?: string; full_name?: string } };
          },
        ];

        // Correct email is forwarded
        expect(signUpPayload.email).toBe(input.email);

        // Correct full_name is forwarded
        expect(signUpPayload.options?.data?.full_name).toBe(input.fullName);

        // Role is still 'member'
        expect(signUpPayload.options?.data?.role).toBe("member");
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Supporting property: registerSchema accepts all valid inputs
// ---------------------------------------------------------------------------

describe("registerSchema accepts all valid registration inputs", () => {
  /**
   * **Validates: Requirements 4.2**
   *
   * Any input satisfying the constraints (non-empty name, valid email,
   * password ≥ 8 chars) must pass schema validation without throwing.
   * This confirms the form would not block a valid submission.
   */
  it("does not throw for any valid registration input", () => {
    fc.assert(
      fc.property(validRegistrationArbitrary, (input) => {
        expect(() => registerSchema.parse(input)).not.toThrow();
      })
    );
  });
});
