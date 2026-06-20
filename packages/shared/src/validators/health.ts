import { z } from "zod";

/** Pool-level metrics from the database connection pool. */
export const healthPoolSchema = z.object({
  active: z.number().int().nonnegative(),
  idle: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
}).strict();

/** Database section of the health response. */
export const healthDbSchema = z.object({
  pool: healthPoolSchema,
}).strict();

/** Full /api/health response when the server is healthy and db is available. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  db: healthDbSchema,
}).strict();
