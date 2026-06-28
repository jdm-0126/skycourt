import { z } from "zod";

export const adminCreateSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AdminCreateInput = z.infer<typeof adminCreateSchema>;
