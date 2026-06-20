import { describe, expect, it } from "vitest";
import {
  healthDbSchema,
  healthPoolSchema,
  healthResponseSchema,
} from "@paperclipai/shared/validators/health";

describe("/api/health contract", () => {
  describe("healthPoolSchema", () => {
    it("accepts a valid pool snapshot", () => {
      expect(healthPoolSchema.parse({
        active: 1,
        idle: 2,
        total: 3,
      })).toEqual({
        active: 1,
        idle: 2,
        total: 3,
      });
    });

    it("rejects negative values", () => {
      expect(() => healthPoolSchema.parse({
        active: -1,
        idle: 0,
        total: 0,
      })).toThrow();
    });

    it("rejects non-integer values", () => {
      expect(() => healthPoolSchema.parse({
        active: 1.5,
        idle: 2,
        total: 3,
      })).toThrow();
    });

    it("rejects extra fields", () => {
      expect(() => healthPoolSchema.parse({
        active: 1,
        idle: 2,
        total: 3,
        max: 10,
      })).toThrow();
    });
  });

  describe("healthDbSchema", () => {
    it("accepts a valid db section", () => {
      expect(healthDbSchema.parse({
        pool: { active: 0, idle: 2, total: 2 },
      })).toEqual({
        pool: { active: 0, idle: 2, total: 2 },
      });
    });

    it("rejects missing pool field", () => {
      expect(() => healthDbSchema.parse({})).toThrow();
    });
  });

  describe("healthResponseSchema", () => {
    it("accepts the standard healthy response shape", () => {
      expect(healthResponseSchema.parse({
        status: "ok",
        db: { pool: { active: 1, idle: 2, total: 3 } },
      })).toMatchObject({
        status: "ok",
        db: {
          pool: {
            active: expect.any(Number),
            idle: expect.any(Number),
            total: expect.any(Number),
          },
        },
      });
    });

    it("rejects non-ok status", () => {
      expect(() => healthResponseSchema.parse({
        status: "unhealthy",
        db: { pool: { active: 0, idle: 0, total: 0 } },
      })).toThrow();
    });

    it("rejects missing db field", () => {
      expect(() => healthResponseSchema.parse({ status: "ok" })).toThrow();
    });

    it("rejects extra top-level fields", () => {
      expect(() => healthResponseSchema.parse({
        status: "ok",
        db: { pool: { active: 0, idle: 0, total: 0 } },
        version: "1.0.0",
      })).toThrow();
    });
  });
});
