/**
 * Property-based tests for password validation in registerSchema.
 *
 * Property 5: Password Validation Rejects Short Passwords
 * Validates: Requirements 4.4
 *
 * For any password string with length < 8, registerSchema.safeParse() must
 * fail with a ZodError on the password field.
 *
 * Inverse: for any password string with length >= 8, validation passes
 * (no error on the password field), given otherwise-valid inputs.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { registerSchema } from "@/lib/validation/register";

/** A valid base input with only the password replaced per test. */
const validBase = {
  fullName: "Test User",
  email: "testuser@example.com",
};

describe("Property 5: Password Validation Rejects Short Passwords", () => {
  /**
   * **Validates: Requirements 4.4**
   *
   * For ALL strings with length 0..7, registerSchema must reject the input
   * with a ZodError that targets the password field.
   */
  it("rejects any password shorter than 8 characters", () => {
    fc.assert(
      fc.property(
        // Generate strings of length 0 to 7 (inclusive)
        fc.string({ maxLength: 7 }),
        (shortPassword) => {
          const result = registerSchema.safeParse({
            ...validBase,
            password: shortPassword,
          });

          // Must fail
          expect(result.success).toBe(false);

          if (!result.success) {
            const passwordErrors = result.error.errors.filter(
              (e) => e.path[0] === "password"
            );
            // There must be at least one error on the password field
            expect(passwordErrors.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 4.4**
   *
   * For ALL strings with length >= 8, registerSchema must NOT produce
   * any error on the password field (given otherwise-valid name and email).
   */
  it("accepts any password with 8 or more characters", () => {
    fc.assert(
      fc.property(
        // Generate strings of length 8 or more
        fc.string({ minLength: 8 }),
        (validPassword) => {
          const result = registerSchema.safeParse({
            ...validBase,
            password: validPassword,
          });

          if (!result.success) {
            // Any errors present must NOT be on the password field
            const passwordErrors = result.error.errors.filter(
              (e) => e.path[0] === "password"
            );
            expect(passwordErrors).toHaveLength(0);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
