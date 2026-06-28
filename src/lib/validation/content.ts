import { z } from "zod";

const CONTENT_SECTIONS = ["hero", "about", "rates", "faq", "contact", "hours"] as const;

export const contentSchema = z.object({
  section: z.enum(CONTENT_SECTIONS, {
    errorMap: () => ({
      message: `Section must be one of: ${CONTENT_SECTIONS.join(", ")}`,
    }),
  }),
  content: z.record(z.unknown()),
});

export type ContentInput = z.infer<typeof contentSchema>;
