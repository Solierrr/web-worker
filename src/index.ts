import type { Env } from "./env.ts";
import { banIp, isMockMode, purgeExpiredBans } from "./honeypot/ban.ts";
import { decoyResponse, matchHoneypot } from "./honeypot/honeypot.ts";

const unavailablePage = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Solaria temporariamente indisponível</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #f7f8fa; color: #17202a; }
      main { max-width: 32rem; margin: 1.5rem; padding: 2rem; border: 1px solid #e5e7eb; border-radius: 1rem; background: white; }
      h1 { margin-top: 0; font-size: 1.5rem; }
      p { line-height: 1.6; color: #4b5563; }
    </style>
  </head>
  <body>
    <main>
      <h1>Estamos voltando em breve</h1>
      <p>O Solaria está temporariamente indisponível. Tente novamente em alguns minutos.</p>
    </main>
  </body>
</html>`;

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

    try {
      const originRequest = new Request(originUrl, request);
      const response = await fetch(originRequest);

      // Pass client errors through; only origin failures use the fallback.
      return response.status >= 500 ? serviceUnavailable() : response;
    } catch {
      // DNS, TLS, or connection failures mean the ephemeral origin is offline.
      return serviceUnavailable();
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(purgeExpiredBans(env));
  },
} satisfies ExportedHandler<Env>;
