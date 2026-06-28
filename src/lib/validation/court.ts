import { z } from "zod";

/** Matches HH:MM time strings, e.g. "08:00", "22:00" */
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayHoursSchema = z.object({
  open: z.string().regex(timeRegex, "Open time must be in HH:MM format"),
  close: z.string().regex(timeRegex, "Close time must be in HH:MM format"),
});

export const courtSchema = z.object({
  name: z.string().min(1, "Court name is required"),
  operatingHours: z.object({
    monday: dayHoursSchema,
    tuesday: dayHoursSchema,
    wednesday: dayHoursSchema,
    thursday: dayHoursSchema,
    friday: dayHoursSchema,
    saturday: dayHoursSchema,
    sunday: dayHoursSchema,
  }),
  status: z.enum(["available", "unavailable"]).default("available"),
});

export type CourtInput = z.infer<typeof courtSchema>;
