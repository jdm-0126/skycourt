import { z } from "zod";

export const profileSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  contactNumber: z.string().optional().default(""),
});

export type ProfileInput = z.infer<typeof profileSchema>;
