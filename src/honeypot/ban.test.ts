import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Env } from "../env.ts";
import { banIp, getBanTtlSeconds, isMockMode, purgeExpiredBans, resetBanCache, toBanTarget } from "./ban.ts";

const env: Env = { ORIGIN_HOST: "origin.example", CF_API_TOKEN: "token", CF_ACCOUNT_ID: "acc", HONEYPOT_LIST_ID: "list", HONEYPOT_BAN_TTL_SECONDS: "600" };
const realFetch = globalThis.fetch;
const realError = console.error;
let calls: { url: string; init?: RequestInit }[] = [];

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  resetBanCache();
  console.error = () => undefined;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

describe("toBanTarget", () => {
  it("aceita IPv4 e reduz IPv6 para /64", () => {
    assert.equal(toBanTarget("203.0.113.9"), "203.0.113.9");
    assert.equal(toBanTarget("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
    assert.equal(toBanTarget("2001:DB8::1"), "2001:db8:0:0::/64");
  });

  it("rejeita valores invalidos", () => {
    for (const value of [null, undefined, "", "300.1.1.1", "abc", "1.2.3", "1::2::3", "::ffff:1.2.3.4"]) {
      assert.equal(toBanTarget(value), null, String(value));
    }
  });
});

describe("getBanTtlSeconds", () => {
  it("usa o valor configurado ou o padrao de 1h", () => {
    assert.equal(getBanTtlSeconds(env), 600);
    assert.equal(getBanTtlSeconds({ ORIGIN_HOST: "x" }), 3600);
    assert.equal(getBanTtlSeconds({ ORIGIN_HOST: "x", HONEYPOT_BAN_TTL_SECONDS: "-5" }), 3600);
  });
});

describe("isMockMode", () => {
  const mock: Env = { ORIGIN_HOST: "x", HONEYPOT_MODE: "MOCK" };

  it("so vale em host local", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]", "app.localhost"]) assert.equal(isMockMode(mock, host), true, host);
  });

  it("vale quando o IP do cliente e loopback, como no wrangler dev que usa o host da route", () => {
    for (const ip of ["127.0.0.1", "127.1.2.3", "::1"]) assert.equal(isMockMode(mock, "solarianetwork.site", ip), true, ip);
  });

  it("ignora IPs publicos ou parecidos com loopback", () => {
    for (const ip of ["203.0.113.9", "128.0.0.1", "127.0.0.1.evil", null, undefined]) assert.equal(isMockMode(mock, "solarianetwork.site", ip), false, String(ip));
  });

  it("e ignorado no dominio publico, mesmo com a variavel definida", () => {
    for (const host of ["solarianetwork.site", "origin.solarianetwork.site", "localhost.evil.com"]) assert.equal(isMockMode(mock, host), false, host);
  });

  it("fica desligado sem a variavel ou com outro valor", () => {
    assert.equal(isMockMode({ ORIGIN_HOST: "x" }, "localhost"), false);
    assert.equal(isMockMode({ ORIGIN_HOST: "x", HONEYPOT_MODE: "LIVE" }, "localhost"), false);
  });
});

describe("banIp", () => {
  it("no modo mock nao chama a API, simula o ban e usa um IP de teste sem cf-connecting-ip", async () => {
    mockFetch(() => new Response("{}"));
    const warn = console.warn;
    const logs: string[] = [];
    console.warn = (message: string) => void logs.push(message);
    try {
      assert.equal(await banIp(env, null, "/.env", { mock: true }), "mocked");
      assert.equal(await banIp({ ORIGIN_HOST: "x" }, "203.0.113.9", "/.env", { mock: true }), "mocked");
    } finally {
      console.warn = warn;
    }
    assert.equal(calls.length, 0);
    assert.equal(JSON.parse(logs[0]).target, "203.0.113.1");
    assert.equal(JSON.parse(logs[0]).event, "honeypot_ban_mock");
  });

  it("adiciona o IP na lista com comentario do honeypot", async () => {
    mockFetch(() => new Response("{}", { status: 200 }));
    assert.equal(await banIp(env, "203.0.113.9", "/wp-login.php"), "banned");
    assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/acc/rules/lists/list/items");
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), [{ ip: "203.0.113.9", comment: "honeypot:/wp-login.php" }]);
    assert.equal((calls[0].init?.headers as Record<string, string>).authorization, "Bearer token");
  });

  it("nao chama a API sem configuracao ou sem IP valido", async () => {
    mockFetch(() => new Response("{}"));
    assert.equal(await banIp({ ORIGIN_HOST: "x" }, "203.0.113.9", "/.env"), "skipped");
    assert.equal(await banIp(env, null, "/.env"), "skipped");
    assert.equal(calls.length, 0);
  });

  it("evita repetir o ban do mesmo IP em sequencia", async () => {
    mockFetch(() => new Response("{}"));
    await banIp(env, "203.0.113.9", "/.env", { now: 1000 });
    assert.equal(await banIp(env, "203.0.113.9", "/.git/", { now: 2000 }), "skipped");
    assert.equal(await banIp(env, "203.0.113.9", "/.git/", { now: 100_000 }), "banned");
    assert.equal(calls.length, 2);
  });

  it("nao propaga erro da API e permite nova tentativa", async () => {
    mockFetch(() => new Response("{}", { status: 500 }));
    assert.equal(await banIp(env, "203.0.113.9", "/.env"), "failed");
    mockFetch(() => new Response("{}", { status: 200 }));
    assert.equal(await banIp(env, "203.0.113.9", "/.env"), "banned");
  });

  it("nao propaga excecao de rede", async () => {
    mockFetch(() => {
      throw new Error("rede");
    });
    assert.equal(await banIp(env, "203.0.113.9", "/.env"), "failed");
  });
});

describe("purgeExpiredBans", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const old = "2026-10-05T11:00:00Z";
  const fresh = "2026-10-05T11:59:00Z";

  it("remove so os bans do honeypot que passaram do TTL", async () => {
    mockFetch((_url, init) => {
      if (init?.method === "DELETE") return new Response("{}");
      return Response.json({
        success: true,
        result: [
          { id: "a", comment: "honeypot:/.env", created_on: old },
          { id: "b", comment: "honeypot:/.env", created_on: fresh },
          { id: "c", comment: "bloqueio manual", created_on: old },
          { id: "d", created_on: old },
        ],
        result_info: {},
      });
    });
    assert.equal(await purgeExpiredBans(env, now), 1);
    const deletion = calls.find((call) => call.init?.method === "DELETE");
    assert.deepEqual(JSON.parse(String(deletion?.init?.body)), { items: [{ id: "a" }] });
  });

  it("percorre as paginas pelo cursor", async () => {
    mockFetch((url, init) => {
      if (init?.method === "DELETE") return new Response("{}");
      return url.includes("cursor=next")
        ? Response.json({ result: [{ id: "b", comment: "honeypot:/.env", created_on: old }], result_info: {} })
        : Response.json({ result: [{ id: "a", comment: "honeypot:/.env", created_on: old }], result_info: { cursors: { after: "next" } } });
    });
    assert.equal(await purgeExpiredBans(env, now), 2);
  });

  it("nao faz nada sem configuracao e nao propaga erro", async () => {
    mockFetch(() => new Response("{}", { status: 500 }));
    assert.equal(await purgeExpiredBans({ ORIGIN_HOST: "x" }, now), 0);
    assert.equal(calls.length, 0);
    assert.equal(await purgeExpiredBans(env, now), 0);
  });
});
