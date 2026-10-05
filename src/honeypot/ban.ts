import type { Env } from "../env.ts";

const API = "https://api.cloudflare.com/client/v4";
const COMMENT_PREFIX = "honeypot:";
const DEFAULT_TTL_SECONDS = 3600;
const DEDUPE_MS = 60_000;
const MAX_PAGES = 20;
const DELETE_CHUNK = 100;

const recentlyBanned = new Map<string, number>();

interface ListItem {
  id: string;
  comment?: string;
  created_on?: string;
}

interface ListPage {
  success: boolean;
  result: ListItem[];
  result_info?: { cursors?: { after?: string } };
}

export type BanResult = "banned" | "mocked" | "skipped" | "failed";

interface BanOptions {
  now?: number;
  mock?: boolean;
}

const MOCK_IP = "203.0.113.1";

function configured(env: Env): env is Env & { CF_API_TOKEN: string; CF_ACCOUNT_ID: string; HONEYPOT_LIST_ID: string } {
  return Boolean(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.HONEYPOT_LIST_ID);
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}

function isLoopbackIp(ip: string | null | undefined): boolean {
  const value = ip?.trim();
  return Boolean(value && (value === "::1" || /^127(\.\d{1,3}){3}$/.test(value)));
}

export function isMockMode(env: Env, hostname: string, ip?: string | null): boolean {
  return env.HONEYPOT_MODE?.trim().toUpperCase() === "MOCK" && (isLocalHost(hostname) || isLoopbackIp(ip));
}

export function getBanTtlSeconds(env: Env): number {
  const value = Number(env.HONEYPOT_BAN_TTL_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_SECONDS;
}

function isIPv4(ip: string): boolean {
  const parts = ip.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function ipv6Prefix64(ip: string): string | null {
  if (!/^[0-9a-f:]+$/i.test(ip) || (ip.match(/::/g) ?? []).length > 1) return null;
  const [head, tail = ""] = ip.split("::");
  const first = head ? head.split(":") : [];
  const last = tail ? tail.split(":") : [];
  const missing = ip.includes("::") ? 8 - first.length - last.length : 0;
  const groups = [...first, ...Array<string>(Math.max(missing, 0)).fill("0"), ...last];
  if (groups.length !== 8 || groups.some((group) => group.length > 4)) return null;
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export function toBanTarget(ip: string | null | undefined): string | null {
  const value = ip?.trim();
  if (!value) return null;
  if (isIPv4(value)) return value;
  return value.includes(":") ? ipv6Prefix64(value) : null;
}

async function cloudflare(env: Env & { CF_API_TOKEN: string }, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json", ...init.headers },
  });
}

export async function banIp(env: Env, ip: string | null | undefined, trap: string, options: BanOptions = {}): Promise<BanResult> {
  const { now = Date.now(), mock = false } = options;
  const target = toBanTarget(ip ?? (mock ? MOCK_IP : null));
  if (!target) return "skipped";

  if (mock) {
    console.warn(JSON.stringify({ event: "honeypot_ban_mock", target, trap, ttlSeconds: getBanTtlSeconds(env) }));
    return "mocked";
  }
  if (!configured(env)) return "skipped";

  const last = recentlyBanned.get(target);
  if (last !== undefined && now - last < DEDUPE_MS) return "skipped";
  recentlyBanned.set(target, now);
  for (const [key, at] of recentlyBanned) if (now - at >= DEDUPE_MS) recentlyBanned.delete(key);

  try {
    const response = await cloudflare(env, `/accounts/${env.CF_ACCOUNT_ID}/rules/lists/${env.HONEYPOT_LIST_ID}/items`, {
      method: "POST",
      body: JSON.stringify([{ ip: target, comment: `${COMMENT_PREFIX}${trap}` }]),
    });
    if (response.ok) return "banned";
    console.error(JSON.stringify({ event: "honeypot_ban_failed", status: response.status }));
  } catch (error) {
    console.error(JSON.stringify({ event: "honeypot_ban_error", message: String(error) }));
  }
  recentlyBanned.delete(target);
  return "failed";
}

export async function purgeExpiredBans(env: Env, now = Date.now()): Promise<number> {
  if (!configured(env)) return 0;
  const ttlMs = getBanTtlSeconds(env) * 1000;
  const base = `/accounts/${env.CF_ACCOUNT_ID}/rules/lists/${env.HONEYPOT_LIST_ID}/items`;
  const expired: string[] = [];

  try {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await cloudflare(env, `${base}?per_page=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      if (!response.ok) throw new Error(`list items ${response.status}`);
      const body = (await response.json()) as ListPage;
      for (const item of body.result ?? []) {
        const created = item.created_on ? Date.parse(item.created_on) : NaN;
        if (item.comment?.startsWith(COMMENT_PREFIX) && Number.isFinite(created) && now - created >= ttlMs) expired.push(item.id);
      }
      cursor = body.result_info?.cursors?.after;
      if (!cursor) break;
    }

    for (let index = 0; index < expired.length; index += DELETE_CHUNK) {
      const items = expired.slice(index, index + DELETE_CHUNK).map((id) => ({ id }));
      const response = await cloudflare(env, base, { method: "DELETE", body: JSON.stringify({ items }) });
      if (!response.ok) throw new Error(`delete items ${response.status}`);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "honeypot_purge_error", message: String(error) }));
    return 0;
  }
  return expired.length;
}

export function resetBanCache(): void {
  recentlyBanned.clear();
}
