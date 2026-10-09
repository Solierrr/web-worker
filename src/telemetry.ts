import type { Env } from "./env.ts";

export type Level = "info" | "warn" | "error";
export type Attributes = Record<string, string | number | boolean | undefined>;

const SEVERITY: Record<Level, number> = { info: 9, warn: 13, error: 17 };
const SCOPE = { name: "web-worker" };

function hex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nano(timeMs: number): string {
  return (BigInt(Math.round(timeMs)) * 1_000_000n).toString();
}

function keyValues(attributes: Attributes) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      key,
      value:
        typeof value === "number"
          ? Number.isInteger(value)
            ? { intValue: String(value) }
            : { doubleValue: value }
          : typeof value === "boolean"
            ? { boolValue: value }
            : { stringValue: String(value) },
    }));
}

function resource(env: Env) {
  return {
    attributes: keyValues({
      "service.name": "web-worker",
      "service.namespace": "solaria",
      "deployment.environment": env.DEPLOYMENT_ENVIRONMENT ?? "prod",
      "telemetry.sdk.language": "webjs",
    }),
  };
}

export function isEnabled(env: Env): boolean {
  return Boolean(env.OTLP_ENDPOINT);
}

async function post(env: Env, path: string, body: unknown): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.OTLP_AUTH) headers.authorization = env.OTLP_AUTH;
  try {
    await fetch(`${env.OTLP_ENDPOINT?.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    return;
  }
}

export function newTrace(): { traceId: string; spanId: string; traceparent: string } {
  const traceId = hex(16);
  const spanId = hex(8);
  return { traceId, spanId, traceparent: `00-${traceId}-${spanId}-01` };
}

export function exportLog(
  env: Env,
  ctx: ExecutionContext,
  level: Level,
  event: string,
  attributes: Attributes = {},
  trace?: { traceId: string; spanId: string },
): void {
  if (!isEnabled(env)) return;
  const body = {
    resourceLogs: [
      {
        resource: resource(env),
        scopeLogs: [
          {
            scope: SCOPE,
            logRecords: [
              {
                timeUnixNano: nano(Date.now()),
                severityNumber: SEVERITY[level],
                severityText: level.toUpperCase(),
                body: { stringValue: event },
                attributes: keyValues({ event, ...attributes }),
                traceId: trace?.traceId,
                spanId: trace?.spanId,
              },
            ],
          },
        ],
      },
    ],
  };
  ctx.waitUntil(post(env, "/v1/logs", body));
}

export function exportSpan(
  env: Env,
  ctx: ExecutionContext,
  trace: { traceId: string; spanId: string },
  name: string,
  startMs: number,
  ok: boolean,
  attributes: Attributes = {},
): void {
  if (!isEnabled(env)) return;
  const body = {
    resourceSpans: [
      {
        resource: resource(env),
        scopeSpans: [
          {
            scope: SCOPE,
            spans: [
              {
                traceId: trace.traceId,
                spanId: trace.spanId,
                name,
                kind: 3,
                startTimeUnixNano: nano(startMs),
                endTimeUnixNano: nano(Date.now()),
                attributes: keyValues(attributes),
                status: { code: ok ? 1 : 2 },
              },
            ],
          },
        ],
      },
    ],
  };
  ctx.waitUntil(post(env, "/v1/traces", body));
}
