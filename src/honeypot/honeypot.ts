import data from "./paths.json" with { type: "json" };

export interface Honeypot {
  trap: string;
}

function buildTraps(paths: string[]): string[] {
  return paths
    .map((path) => path.trim().toLowerCase())
    .filter((path) => path.startsWith("/") && path.length > 1);
}

const traps = buildTraps(data.paths);

function normalizePath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(path);
  } catch {}
  return path.toLowerCase().replace(/\/{2,}/g, "/");
}

export function matchHoneypot(pathname: string, list: string[] = traps): Honeypot | null {
  const path = normalizePath(pathname);
  for (const trap of list) {
    if (path.startsWith(trap) || (trap.endsWith("/") && path === trap.slice(0, -1))) return { trap };
  }
  return null;
}

export function decoyResponse(): Response {
  return new Response("<!doctype html><title>404 Not Found</title><h1>Not Found</h1>", {
    status: 404,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export { buildTraps };
