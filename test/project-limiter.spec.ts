import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { ProjectLimiter } from "../src/durable-objects/project-limiter";
import type { LimitReservation, ProjectLimits } from "../src/types";

const openLimits: ProjectLimits = {
  rpm_limit: 1_000,
  concurrency_limit: 1_000,
  daily_request_limit: null,
  monthly_request_limit: null,
  daily_cost_limit_cents: null,
  monthly_cost_limit_cents: null,
};

function reservation(
  requestId: string,
  limits: Partial<ProjectLimits> = {},
  cost = 1,
  modelLimits: { daily?: number | null; monthly?: number | null } = {},
  modelId = "model-test",
): LimitReservation {
  return {
    requestId,
    estimatedCostCents: cost,
    limits: { ...openLimits, ...limits },
    modelId,
    modelDailyCostLimitCents: modelLimits.daily ?? null,
    modelMonthlyCostLimitCents: modelLimits.monthly ?? null,
  };
}

function limiter(name: string) {
  return env.PROJECT_LIMITER.getByName(`${name}-${crypto.randomUUID()}`);
}

function runLimiter(
  stub: DurableObjectStub,
  callback: (instance: ProjectLimiter) => void,
) {
  return runInDurableObject(stub, (instance) => callback(instance as unknown as ProjectLimiter));
}

describe("ProjectLimiter durable object", () => {
  it("enforces RPM and concurrency and releases concurrency on completion", async () => {
    const rpmStub = limiter("rpm");
    await runLimiter(rpmStub, (instance) => {
      expect(instance.reserve(reservation("rpm-1", { rpm_limit: 1 }))).toEqual({ allowed: true });
      expect(instance.reserve(reservation("rpm-2", { rpm_limit: 1 }))).toEqual({
        allowed: false,
        code: "RATE_LIMIT_EXCEEDED",
      });
    });

    const concurrencyStub = limiter("concurrency");
    await runLimiter(concurrencyStub, (instance) => {
      expect(instance.reserve(reservation("concurrency-1", { concurrency_limit: 1 }))).toEqual({
        allowed: true,
      });
      expect(instance.reserve(reservation("concurrency-2", { concurrency_limit: 1 }))).toEqual({
        allowed: false,
        code: "CONCURRENCY_LIMIT_EXCEEDED",
      });
      instance.complete("concurrency-1", 1, "model-test");
      expect(instance.reserve(reservation("concurrency-3", { concurrency_limit: 1 }))).toEqual({
        allowed: true,
      });
    });
  });

  it("enforces daily and monthly request and cost limits", async () => {
    const dailyRequest = limiter("daily-request");
    await runLimiter(dailyRequest, (instance) => {
      expect(instance.reserve(reservation("daily-request-1", { daily_request_limit: 1 }))).toEqual({
        allowed: true,
      });
      instance.complete("daily-request-1", 1, "model-test");
      expect(instance.reserve(reservation("daily-request-2", { daily_request_limit: 1 }))).toEqual({
        allowed: false,
        code: "DAILY_LIMIT_EXCEEDED",
      });
    });

    const monthlyRequest = limiter("monthly-request");
    await runLimiter(monthlyRequest, (instance) => {
      expect(instance.reserve(reservation("monthly-request-1", { monthly_request_limit: 1 }))).toEqual({
        allowed: true,
      });
      instance.complete("monthly-request-1", 1, "model-test");
      expect(instance.reserve(reservation("monthly-request-2", { monthly_request_limit: 1 }))).toEqual({
        allowed: false,
        code: "MONTHLY_LIMIT_EXCEEDED",
      });
    });

    const dailyCost = limiter("daily-cost");
    await runLimiter(dailyCost, (instance) => {
      expect(instance.reserve(reservation("daily-cost-1", { daily_cost_limit_cents: 5 }, 3))).toEqual({
        allowed: true,
      });
      instance.complete("daily-cost-1", 4, "model-test");
      expect(instance.reserve(reservation("daily-cost-2", { daily_cost_limit_cents: 5 }, 2))).toEqual({
        allowed: false,
        code: "DAILY_LIMIT_EXCEEDED",
      });
    });

    const monthlyCost = limiter("monthly-cost");
    await runLimiter(monthlyCost, (instance) => {
      expect(instance.reserve(reservation("monthly-cost-1", { monthly_cost_limit_cents: 5 }, 3))).toEqual({
        allowed: true,
      });
      instance.complete("monthly-cost-1", 4, "model-test");
      expect(instance.reserve(reservation("monthly-cost-2", { monthly_cost_limit_cents: 5 }, 2))).toEqual({
        allowed: false,
        code: "MONTHLY_LIMIT_EXCEEDED",
      });
    });
  });

  it("enforces per-model daily and monthly cost limits", async () => {
    const daily = limiter("model-daily");
    await runLimiter(daily, (instance) => {
      expect(instance.reserve(reservation("model-daily-1", {}, 3, { daily: 4 }))).toEqual({ allowed: true });
      instance.complete("model-daily-1", 3, "model-test");
      expect(instance.reserve(reservation("model-daily-2", {}, 2, { daily: 4 }))).toEqual({
        allowed: false,
        code: "MODEL_DAILY_LIMIT_EXCEEDED",
      });
    });

    const monthly = limiter("model-monthly");
    await runLimiter(monthly, (instance) => {
      expect(instance.reserve(reservation("model-monthly-1", {}, 3, { monthly: 4 }))).toEqual({
        allowed: true,
      });
      instance.complete("model-monthly-1", 3, "model-test");
      expect(instance.reserve(reservation("model-monthly-2", {}, 2, { monthly: 4 }))).toEqual({
        allowed: false,
        code: "MODEL_MONTHLY_LIMIT_EXCEEDED",
      });
    });
  });

  it("moves reserved model cost to the model that actually served a fallback request", async () => {
    const stub = limiter("fallback-model-cost");
    await runLimiter(stub, (instance) => {
      expect(instance.reserve(reservation("fallback-1", {}, 5, { daily: 5 }, "model-primary"))).toEqual({ allowed: true });
      instance.complete("fallback-1", 2, "model-backup");

      expect(instance.reserve(reservation("primary-again", {}, 5, { daily: 5 }, "model-primary"))).toEqual({ allowed: true });
      instance.complete("primary-again", 0, "model-primary");

      expect(instance.reserve(reservation("backup-over", {}, 4, { daily: 5 }, "model-backup"))).toEqual({
        allowed: false,
        code: "MODEL_DAILY_LIMIT_EXCEEDED",
      });
    });
  });
});
