import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  bookingSchema,
  profileSchema,
  contactSchema,
  courtSchema,
  contentSchema,
  adminCreateSchema,
} from "../index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's date as YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns yesterday's date as YYYY-MM-DD */
function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** A valid UUID v4 for court ID tests */
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

/** A full valid operating hours object covering all 7 days */
const VALID_OPERATING_HOURS = {
  monday: { open: "08:00", close: "22:00" },
  tuesday: { open: "08:00", close: "22:00" },
  wednesday: { open: "08:00", close: "22:00" },
  thursday: { open: "08:00", close: "22:00" },
  friday: { open: "08:00", close: "22:00" },
  saturday: { open: "08:00", close: "22:00" },
  sunday: { open: "08:00", close: "22:00" },
};

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------

describe("registerSchema", () => {
  it("accepts valid input", () => {
    const result = registerSchema.safeParse({
      fullName: "Alice",
      email: "alice@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing fullName", () => {
    const result = registerSchema.safeParse({
      email: "alice@example.com",
      password: "password123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("fullName");
    }
  });

  it("rejects empty fullName", () => {
    const result = registerSchema.safeParse({
      fullName: "",
      email: "alice@example.com",
      password: "password123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("fullName");
    }
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      fullName: "Alice",
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("email");
    }
  });

  it("rejects password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      fullName: "Alice",
      email: "alice@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("password");
    }
  });

  it("accepts password of exactly 8 characters", () => {
    const result = registerSchema.safeParse({
      fullName: "Alice",
      email: "alice@example.com",
      password: "12345678",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------

describe("loginSchema", () => {
  it("accepts valid input", () => {
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "anypassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "bad-email",
      password: "anypassword",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("email");
    }
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({
      email: "alice@example.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("password");
    }
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("password");
    }
  });
});

// ---------------------------------------------------------------------------
// bookingSchema
// ---------------------------------------------------------------------------

describe("bookingSchema", () => {
  it("accepts valid input with today's date", () => {
    const result = bookingSchema.safeParse({
      courtId: VALID_UUID,
      bookingDate: today(),
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a past date", () => {
    const result = bookingSchema.safeParse({
      courtId: VALID_UUID,
      bookingDate: yesterday(),
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("bookingDate");
    }
  });

  it("rejects endTime equal to startTime", () => {
    const result = bookingSchema.safeParse({
      courtId: VALID_UUID,
      bookingDate: today(),
      startTime: "09:00",
      endTime: "09:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("endTime");
    }
  });

  it("rejects endTime before startTime", () => {
    const result = bookingSchema.safeParse({
      courtId: VALID_UUID,
      bookingDate: today(),
      startTime: "10:00",
      endTime: "09:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("endTime");
    }
  });

  it("rejects an invalid UUID for courtId", () => {
    const result = bookingSchema.safeParse({
      courtId: "not-a-uuid",
      bookingDate: today(),
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("courtId");
    }
  });

  it("rejects an invalid date format", () => {
    const result = bookingSchema.safeParse({
      courtId: VALID_UUID,
      bookingDate: "20-12-2025", // wrong format
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("bookingDate");
    }
  });
});

// ---------------------------------------------------------------------------
// profileSchema
// ---------------------------------------------------------------------------

describe("profileSchema", () => {
  it("accepts valid input with a contact number", () => {
    const result = profileSchema.safeParse({
      fullName: "Alice",
      contactNumber: "09123456789",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with empty contactNumber (optional field)", () => {
    const result = profileSchema.safeParse({
      fullName: "Alice",
      contactNumber: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input when contactNumber is omitted", () => {
    const result = profileSchema.safeParse({ fullName: "Alice" });
    expect(result.success).toBe(true);
    if (result.success) {
      // default should be applied
      expect(result.data.contactNumber).toBe("");
    }
  });

  it("rejects empty fullName", () => {
    const result = profileSchema.safeParse({
      fullName: "",
      contactNumber: "09123456789",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("fullName");
    }
  });

  it("rejects missing fullName", () => {
    const result = profileSchema.safeParse({ contactNumber: "09123456789" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("fullName");
    }
  });
});

// ---------------------------------------------------------------------------
// contactSchema
// ---------------------------------------------------------------------------

describe("contactSchema", () => {
  it("accepts valid input", () => {
    const result = contactSchema.safeParse({
      senderName: "Guest",
      senderEmail: "guest@example.com",
      message: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing senderName", () => {
    const result = contactSchema.safeParse({
      senderEmail: "guest@example.com",
      message: "Hello",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("senderName");
    }
  });

  it("rejects empty senderName", () => {
    const result = contactSchema.safeParse({
      senderName: "",
      senderEmail: "guest@example.com",
      message: "Hello",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("senderName");
    }
  });

  it("rejects invalid senderEmail", () => {
    const result = contactSchema.safeParse({
      senderName: "Guest",
      senderEmail: "not-an-email",
      message: "Hello",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("senderEmail");
    }
  });

  it("rejects missing message", () => {
    const result = contactSchema.safeParse({
      senderName: "Guest",
      senderEmail: "guest@example.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("message");
    }
  });

  it("rejects empty message", () => {
    const result = contactSchema.safeParse({
      senderName: "Guest",
      senderEmail: "guest@example.com",
      message: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("message");
    }
  });
});

// ---------------------------------------------------------------------------
// courtSchema
// ---------------------------------------------------------------------------

describe("courtSchema", () => {
  it("accepts valid input with all 7 days and status available", () => {
    const result = courtSchema.safeParse({
      name: "Court A",
      operatingHours: VALID_OPERATING_HOURS,
      status: "available",
    });
    expect(result.success).toBe(true);
  });

  it("defaults status to 'available' when omitted", () => {
    const result = courtSchema.safeParse({
      name: "Court B",
      operatingHours: VALID_OPERATING_HOURS,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("available");
    }
  });

  it("rejects missing name", () => {
    const result = courtSchema.safeParse({
      operatingHours: VALID_OPERATING_HOURS,
      status: "available",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("name");
    }
  });

  it("rejects empty name", () => {
    const result = courtSchema.safeParse({
      name: "",
      operatingHours: VALID_OPERATING_HOURS,
      status: "available",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("name");
    }
  });

  it("rejects missing a day in operatingHours (no monday)", () => {
    const { monday, ...withoutMonday } = VALID_OPERATING_HOURS;
    const result = courtSchema.safeParse({
      name: "Court A",
      operatingHours: withoutMonday,
      status: "available",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Error path should point into operatingHours
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("monday"))).toBe(true);
    }
  });

  it("rejects invalid time format in operatingHours", () => {
    const result = courtSchema.safeParse({
      name: "Court A",
      operatingHours: {
        ...VALID_OPERATING_HOURS,
        monday: { open: "8:00", close: "22:00" }, // missing leading zero
      },
      status: "available",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("monday"))).toBe(true);
    }
  });

  it("accepts status 'unavailable'", () => {
    const result = courtSchema.safeParse({
      name: "Court A",
      operatingHours: VALID_OPERATING_HOURS,
      status: "unavailable",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status value", () => {
    const result = courtSchema.safeParse({
      name: "Court A",
      operatingHours: VALID_OPERATING_HOURS,
      status: "closed", // not in enum
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("status");
    }
  });
});

// ---------------------------------------------------------------------------
// contentSchema
// ---------------------------------------------------------------------------

describe("contentSchema", () => {
  it("accepts section 'hero' with content", () => {
    const result = contentSchema.safeParse({
      section: "hero",
      content: { headline: "Hello" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid sections", () => {
    const validSections = ["hero", "about", "rates", "faq", "contact", "hours"] as const;
    for (const section of validSections) {
      const result = contentSchema.safeParse({
        section,
        content: { key: "value" },
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid section", () => {
    const result = contentSchema.safeParse({
      section: "invalid-section",
      content: { key: "value" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("section");
    }
  });

  it("rejects missing section", () => {
    const result = contentSchema.safeParse({
      content: { key: "value" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("section");
    }
  });

  it("rejects missing content", () => {
    const result = contentSchema.safeParse({
      section: "hero",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("content");
    }
  });
});

// ---------------------------------------------------------------------------
// adminCreateSchema
// ---------------------------------------------------------------------------

describe("adminCreateSchema", () => {
  it("accepts valid input", () => {
    const result = adminCreateSchema.safeParse({
      fullName: "Admin",
      email: "admin@example.com",
      password: "adminpass1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = adminCreateSchema.safeParse({
      fullName: "Admin",
      email: "admin@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("password");
    }
  });

  it("accepts password of exactly 8 characters", () => {
    const result = adminCreateSchema.safeParse({
      fullName: "Admin",
      email: "admin@example.com",
      password: "12345678",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = adminCreateSchema.safeParse({
      fullName: "Admin",
      email: "not-an-email",
      password: "adminpass1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("email");
    }
  });

  it("rejects missing fullName", () => {
    const result = adminCreateSchema.safeParse({
      email: "admin@example.com",
      password: "adminpass1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("fullName");
    }
  });

  it("rejects empty fullName", () => {
    const result = adminCreateSchema.safeParse({
      fullName: "",
      email: "admin@example.com",
      password: "adminpass1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("fullName");
    }
  });
});
