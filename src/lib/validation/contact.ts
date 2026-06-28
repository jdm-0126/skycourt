import { z } from "zod";

export const contactSchema = z.object({
  senderName: z.string().min(1, "Name is required"),
  senderEmail: z.string().email("Please enter a valid email address"),
  message: z.string().min(1, "Message is required"),
});

export type ContactInput = z.infer<typeof contactSchema>;
