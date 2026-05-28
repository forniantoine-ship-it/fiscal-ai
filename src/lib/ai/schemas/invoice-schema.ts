import { z } from "zod";

export const CATEGORY_HINTS = [
  "furniture",
  "works",
  "electronics",
  "kitchen",
  "appliance",
  "other",
] as const;

export const invoiceSchema = z.object({
  supplierName: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  totalTtc: z.number().nullable(),
  vatAmount: z.number().nullable(),
  currency: z.string().nullable(),
  categoryHint: z.enum(CATEGORY_HINTS).nullable(),
});

export type InvoiceData = z.infer<typeof invoiceSchema>;
