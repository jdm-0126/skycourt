import { z } from "zod";

/** Matches HH:MM time strings, e.g. "08:00", "23:59" */
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Matches YYYY-MM-DD date strings */
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const bookingSchema = z
  .object({
    courtId: z.string().uuid("Court ID must be a valid UUID"),
    bookingDate: z
      .string()
      .regex(isoDateRegex, "Date must be in YYYY-MM-DD format")
      .refine(
        (date) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return new Date(date) >= today;
        },
        { message: "Booking date cannot be in the past" },
      ),
    startTime: z
      .string()
      .regex(timeRegex, "Start time must be in HH:MM format"),
    endTime: z.string().regex(timeRegex, "End time must be in HH:MM format"),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

export type BookingInput = z.infer<typeof bookingSchema>;
