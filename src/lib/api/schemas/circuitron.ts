import { z } from "zod";

export const circuitronOptionsSchema = z
  .object({
    noFootprintSearch: z.boolean().optional(),
    keepSkidl: z.boolean().optional(),
    dev: z.boolean().optional(),
    model: z.string().max(256).optional(),
  })
  .strict()
  .optional();

export const circuitronGenerateBodySchema = z
  .object({
    prompt: z.string().min(1, "PCB design prompt is required").max(120_000),
    projectName: z.string().max(200).optional(),
    conversationContext: z.string().max(200_000).optional(),
    options: circuitronOptionsSchema,
  })
  .strict();

export const pcbDirectGenerateBodySchema = z
  .object({
    prompt: z.string().min(1, "Prompt is required").max(120_000),
    projectName: z.string().max(200).optional(),
  })
  .strict();
