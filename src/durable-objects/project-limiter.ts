import { DurableObject } from "cloudflare:workers";
import type { Env, LimitDecision, LimitReservation, ProjectLimits } from "../types";

type CounterRow = { value: number };
type ReservationRow = { day_scope: string; month_scope: string; estimated_cost_cents: number; model_id: string };

export class ProjectLimiter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      try {
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS counters (
            scope TEXT PRIMARY KEY,
            request_count INTEGER NOT NULL DEFAULT 0,
            cost_cents INTEGER NOT NULL DEFAULT 0,
            inflight INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS rpm_events (
            request_id TEXT PRIMARY KEY,
            created_at_ms INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_rpm_events_created ON rpm_events(created_at_ms);
          CREATE TABLE IF NOT EXISTS reservations (
            request_id TEXT PRIMARY KEY,
            day_scope TEXT NOT NULL,
            month_scope TEXT NOT NULL,
            estimated_cost_cents INTEGER NOT NULL,
            model_id TEXT NOT NULL DEFAULT ''
          );
        `);
        const reservationColumns = this.ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(reservations)").toArray();
        if (!reservationColumns.some((column) => column.name === "model_id")) {
          this.ctx.storage.sql.exec("ALTER TABLE reservations ADD COLUMN model_id TEXT NOT NULL DEFAULT ''");
        }
      } catch (error) {
        console.error(JSON.stringify({ event: "limiter_init_failed", error: String(error) }));
      }
    });
  }

  reserve(reservation: LimitReservation): LimitDecision {
    const now = Date.now();
    const dayScope = dayScopeFor(now);
    const monthScope = monthScopeFor(now);
    this.ctx.storage.sql.exec("DELETE FROM rpm_events WHERE created_at_ms < ?", now - 60_000);

    const rpm = this.count("SELECT COUNT(*) AS value FROM rpm_events");
    if (rpm >= reservation.limits.rpm_limit) return { allowed: false, code: "RATE_LIMIT_EXCEEDED" };

    const daily = this.counter(dayScope);
    const monthly = this.counter(monthScope);
    const modelDailyScope = `model:${reservation.modelId}:${dayScope}`;
    const modelMonthlyScope = `model:${reservation.modelId}:${monthScope}`;
    const modelDaily = this.counter(modelDailyScope);
    const modelMonthly = this.counter(modelMonthlyScope);
    const global = this.counter("inflight");
    if (global.inflight >= reservation.limits.concurrency_limit) {
      return { allowed: false, code: "CONCURRENCY_LIMIT_EXCEEDED" };
    }

    if (exceeds(daily.request_count, 1, reservation.limits.daily_request_limit) ||
        exceeds(daily.cost_cents, reservation.estimatedCostCents, reservation.limits.daily_cost_limit_cents)) {
      return { allowed: false, code: "DAILY_LIMIT_EXCEEDED" };
    }
    if (exceeds(monthly.request_count, 1, reservation.limits.monthly_request_limit) ||
        exceeds(monthly.cost_cents, reservation.estimatedCostCents, reservation.limits.monthly_cost_limit_cents)) {
      return { allowed: false, code: "MONTHLY_LIMIT_EXCEEDED" };
    }
    if (exceeds(modelDaily.cost_cents, reservation.estimatedCostCents, reservation.modelDailyCostLimitCents)) {
      return { allowed: false, code: "MODEL_DAILY_LIMIT_EXCEEDED" };
    }
    if (exceeds(modelMonthly.cost_cents, reservation.estimatedCostCents, reservation.modelMonthlyCostLimitCents)) {
      return { allowed: false, code: "MODEL_MONTHLY_LIMIT_EXCEEDED" };
    }

    this.ctx.storage.sql.exec("INSERT INTO rpm_events(request_id, created_at_ms) VALUES (?, ?)", reservation.requestId, now);
    this.ctx.storage.sql.exec(
      "INSERT INTO reservations(request_id, day_scope, month_scope, estimated_cost_cents, model_id) VALUES (?, ?, ?, ?, ?)",
      reservation.requestId,
      dayScope,
      monthScope,
      reservation.estimatedCostCents,
      reservation.modelId,
    );
    this.increment(dayScope, 1, reservation.estimatedCostCents, 0);
    this.increment(monthScope, 1, reservation.estimatedCostCents, 0);
    this.increment(modelDailyScope, 0, reservation.estimatedCostCents, 0);
    this.increment(modelMonthlyScope, 0, reservation.estimatedCostCents, 0);
    this.increment("inflight", 0, 0, 1);
    return { allowed: true };
  }

  complete(requestId: string, chargedCostCents: number, modelId: string): void {
    const reservation = this.ctx.storage.sql
      .exec<ReservationRow>("SELECT day_scope, month_scope, estimated_cost_cents, model_id FROM reservations WHERE request_id = ?", requestId)
      .toArray()[0];
    if (!reservation) return;
    const adjustment = chargedCostCents - reservation.estimated_cost_cents;
    if (adjustment !== 0) {
      this.increment(reservation.day_scope, 0, adjustment, 0);
      this.increment(reservation.month_scope, 0, adjustment, 0);
    }
    const reservedModelId = reservation.model_id || modelId;
    if (reservedModelId === modelId) {
      if (adjustment !== 0) {
        this.increment(`model:${modelId}:${reservation.day_scope}`, 0, adjustment, 0);
        this.increment(`model:${modelId}:${reservation.month_scope}`, 0, adjustment, 0);
      }
    } else {
      this.increment(`model:${reservedModelId}:${reservation.day_scope}`, 0, -reservation.estimated_cost_cents, 0);
      this.increment(`model:${reservedModelId}:${reservation.month_scope}`, 0, -reservation.estimated_cost_cents, 0);
      this.increment(`model:${modelId}:${reservation.day_scope}`, 0, chargedCostCents, 0);
      this.increment(`model:${modelId}:${reservation.month_scope}`, 0, chargedCostCents, 0);
    }
    this.increment("inflight", 0, 0, -1);
    this.ctx.storage.sql.exec("DELETE FROM reservations WHERE request_id = ?", requestId);
  }

  private count(query: string): number {
    return this.ctx.storage.sql.exec<CounterRow>(query).one().value;
  }

  private counter(scope: string): { request_count: number; cost_cents: number; inflight: number } {
    const row = this.ctx.storage.sql.exec<{ request_count: number; cost_cents: number; inflight: number }>(
      "SELECT request_count, cost_cents, inflight FROM counters WHERE scope = ?",
      scope,
    ).toArray()[0];
    return row ?? { request_count: 0, cost_cents: 0, inflight: 0 };
  }

  private increment(scope: string, requests: number, cost: number, inflight: number): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO counters(scope, request_count, cost_cents, inflight) VALUES (?, ?, ?, ?)
       ON CONFLICT(scope) DO UPDATE SET
         request_count = request_count + excluded.request_count,
         cost_cents = cost_cents + excluded.cost_cents,
         inflight = MAX(0, inflight + excluded.inflight)`,
      scope,
      requests,
      cost,
      inflight,
    );
  }
}

function exceeds(current: number, addition: number, limit: number | null): boolean {
  return limit !== null && current + addition > limit;
}

function dayScopeFor(timestamp: number): string {
  return `day:${new Date(timestamp).toISOString().slice(0, 10)}`;
}

function monthScopeFor(timestamp: number): string {
  return `month:${new Date(timestamp).toISOString().slice(0, 7)}`;
}
