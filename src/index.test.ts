import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import worker from "./index.ts";
import { resetBanCache } from "./honeypot/ban.ts";
import type { Env } from "./env.ts";

const env: Env = { ORIGIN_HOST: "origin.example", CF_API_TOKEN: "token", CF_ACCOUNT_ID: "acc", HONEYPOT_LIST_ID: "list" };
const realFetch = globalThis.fetch;
const realWarn = console.warn;
let outbound: string[] = [];
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise) } as unknown as ExecutionContext;

beforeEach(() => {
  outbound = [];
  pending = [];
  resetBanCache();
  console.warn = () => undefined;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    outbound.push(input instanceof Request ? input.url : String(input));
    return new Response("origin ok", { status: 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});

describe("worker", () => {
  it("responde a isca com 404 sem chamar a origem e bane o IP em segundo plano", async () => {
    const request = new Request("https://solarianetwork.site/wp-login.php", { headers: { "cf-connecting-ip": "203.0.113.9" } });
    const response = await worker.fetch(request, env, ctx);
    await Promise.all(pending);
    assert.equal(response.status, 404);
    assert.deepEqual(outbound, ["https://api.cloudflare.com/client/v4/accounts/acc/rules/lists/list/items"]);
  });

  it("isca sem configuracao de ban so devolve o 404", async () => {
    const response = await worker.fetch(new Request("https://solarianetwork.site/.env"), { ORIGIN_HOST: "origin.example" }, ctx);
    await Promise.all(pending);
    assert.equal(response.status, 404);
    assert.deepEqual(outbound, []);
  });

  it("encaminha rotas normais para a origem sem banir ninguem", async () => {
    const request = new Request("https://solarianetwork.site/pt-BR/login", { headers: { "cf-connecting-ip": "203.0.113.9" } });
    const response = await worker.fetch(request, env, ctx);
    assert.equal(response.status, 200);
    assert.deepEqual(outbound, ["https://origin.example/pt-BR/login"]);
    assert.equal(pending.length, 0);
  });

  it("modo mock em localhost simula o ban sem chamar a Cloudflare", async () => {
    const response = await worker.fetch(new Request("http://localhost:8787/.env"), { ...env, HONEYPOT_MODE: "MOCK" }, ctx);
    await Promise.all(pending);
    assert.equal(response.status, 404);
    assert.deepEqual(outbound, []);
  });

  it("modo mock tambem vale com o host da route quando o IP e loopback", async () => {
    const request = new Request("https://solarianetwork.site/.env", { headers: { "cf-connecting-ip": "127.0.0.1" } });
    await worker.fetch(request, { ...env, HONEYPOT_MODE: "MOCK" }, ctx);
    await Promise.all(pending);
    assert.deepEqual(outbound, []);
  });

  it("ignora o modo mock no dominio publico e bane de verdade", async () => {
    const request = new Request("https://solarianetwork.site/.env", { headers: { "cf-connecting-ip": "203.0.113.9" } });
    await worker.fetch(request, { ...env, HONEYPOT_MODE: "MOCK" }, ctx);
    await Promise.all(pending);
    assert.deepEqual(outbound, ["https://api.cloudflare.com/client/v4/accounts/acc/rules/lists/list/items"]);
  });

  it("mantem o 503 quando a origem falha", async () => {
    globalThis.fetch = (async () => new Response("erro", { status: 502 })) as typeof fetch;
    const response = await worker.fetch(new Request("https://solarianetwork.site/pt-BR/login"), env, ctx);
    assert.equal(response.status, 503);
  });
});
