import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Env } from "./env.ts";
import { exportLog, exportSpan, isEnabled, newTrace } from "./telemetry.ts";

const realFetch = globalThis.fetch;
let calls: { url: string; headers: Record<string, string>; body: any }[] = [];
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise) } as unknown as ExecutionContext;

function capture() {
  calls = [];
  pending = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("telemetry", () => {
  it("não faz nada sem OTLP_ENDPOINT", async () => {
    capture();
    const env: Env = { ORIGIN_HOST: "origin.example" };
    assert.equal(isEnabled(env), false);
    exportLog(env, ctx, "warn", "honeypot_hit", { trap: "wp-admin" });
    exportSpan(env, ctx, newTrace(), "origin", Date.now(), true);
    await Promise.all(pending);
    assert.equal(calls.length, 0);
  });

  it("envia o log em OTLP com o recurso e a autorização", async () => {
    capture();
    const env: Env = { ORIGIN_HOST: "o", OTLP_ENDPOINT: "https://collector.test/", OTLP_AUTH: "Bearer x" };
    exportLog(env, ctx, "error", "origin_unavailable", { status: 502 });
    await Promise.all(pending);
    assert.equal(calls[0].url, "https://collector.test/v1/logs");
    assert.equal(calls[0].headers.authorization, "Bearer x");
    const record = calls[0].body.resourceLogs[0].scopeLogs[0].logRecords[0];
    assert.equal(record.severityText, "ERROR");
    assert.equal(record.body.stringValue, "origin_unavailable");
    const service = calls[0].body.resourceLogs[0].resource.attributes.find((a: any) => a.key === "service.name");
    assert.equal(service.value.stringValue, "web-worker");
  });

  it("envia o span com o status e gera um traceparent válido", async () => {
    capture();
    const env: Env = { ORIGIN_HOST: "o", OTLP_ENDPOINT: "https://collector.test" };
    const trace = newTrace();
    assert.match(trace.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    exportSpan(env, ctx, trace, "origin fetch", Date.now() - 20, false, { "http.response.status_code": 503 });
    await Promise.all(pending);
    const span = calls[0].body.resourceSpans[0].scopeSpans[0].spans[0];
    assert.equal(calls[0].url, "https://collector.test/v1/traces");
    assert.equal(span.traceId, trace.traceId);
    assert.equal(span.status.code, 2);
  });

  it("ignora a falha do coletor", async () => {
    pending = [];
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    const env: Env = { ORIGIN_HOST: "o", OTLP_ENDPOINT: "https://collector.test" };
    exportLog(env, ctx, "info", "x");
    await assert.doesNotReject(Promise.all(pending));
  });
});
