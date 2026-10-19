import { createUnavailablePage } from "./unavailable.ts";

import type { Env } from "./env.ts";
import { banIp, isMockMode, purgeExpiredBans } from "./honeypot/ban.ts";
import { decoyResponse, matchHoneypot } from "./honeypot/honeypot.ts";
import { exportLog, exportSpan, newTrace } from "./telemetry.ts";

const unavailablePage = createUnavailablePage({ rotateShape: true });

function serviceUnavailable(): Response {
  return new Response(unavailablePage, {
    status: 503,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "retry-after": "60",
      "x-content-type-options": "nosniff",
    },
  });
}

async function isUnavailableOrigin(response: Response): Promise<boolean> {
  if (response.status >= 500) return true;
  if (response.status !== 404 || !response.headers.get("server")?.toLowerCase().startsWith("kong/")) return false;
  try {
    const body: unknown = await response.clone().json();
    return typeof body === "object" && body !== null && "message" in body && body.message === "no Route matched with those values";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const publicUrl = new URL(request.url);

    const honeypot = matchHoneypot(publicUrl.pathname);
    if (honeypot) {
      const ip = request.headers.get("cf-connecting-ip");
      console.warn(
        JSON.stringify({
          event: "honeypot_hit",
          trap: honeypot.trap,
          path: publicUrl.pathname,
          method: request.method,
          ip,
          country: request.cf?.country,
          userAgent: request.headers.get("user-agent"),
        }),
      );
      exportLog(env, ctx, "warn", "honeypot_hit", {
        trap: honeypot.trap,
        path: publicUrl.pathname,
        method: request.method,
        country: typeof request.cf?.country === "string" ? request.cf.country : undefined,
      });
      ctx.waitUntil(banIp(env, ip, honeypot.trap, { mock: isMockMode(env, publicUrl.hostname, ip) }));
      return decoyResponse();
    }

    const originHost = env.ORIGIN_HOST?.trim().toLowerCase();

    // Never fetch the public hostname: it is covered by this Worker's route.
    if (!originHost || originHost === publicUrl.hostname.toLowerCase()) {
      return serviceUnavailable();
    }

    const originUrl = new URL(publicUrl);
    originUrl.protocol = "https:";
    originUrl.hostname = originHost;
    originUrl.port = "";

    const trace = newTrace();
    const startedAt = Date.now();
    try {
      const originRequest = new Request(originUrl, request);
      originRequest.headers.set("traceparent", trace.traceparent);
      const response = await fetch(originRequest);
      const unavailable = await isUnavailableOrigin(response);

      exportSpan(env, ctx, trace, `origin ${request.method}`, startedAt, !unavailable, {
        "http.request.method": request.method,
        "http.response.status_code": response.status,
        "server.address": originHost,
      });

      if (unavailable) {
        exportLog(env, ctx, "error", "origin_error", { status: response.status, path: publicUrl.pathname }, trace);
        return serviceUnavailable();
      }
      return response;
    } catch {
      // DNS, TLS, or connection failures mean the ephemeral origin is offline.
      exportSpan(env, ctx, trace, `origin ${request.method}`, startedAt, false, {
        "http.request.method": request.method,
        "server.address": originHost,
      });
      exportLog(env, ctx, "error", "origin_unreachable", { path: publicUrl.pathname }, trace);
      return serviceUnavailable();
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(purgeExpiredBans(env));
  },
} satisfies ExportedHandler<Env>;
