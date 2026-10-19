import { cookieLanguage, isLanguagePrefix, languageCookie, localizePath, resolveLanguage, type Language } from "./routing/routing.ts";

export function isPageNavigation(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const destination = request.headers.get("sec-fetch-dest");
  if (destination && destination !== "document") return false;
  if (destination !== "document" && !request.headers.get("accept")?.includes("text/html")) return false;
  const url = new URL(request.url);
  const [, prefix, ...rest] = url.pathname.split("/");
  const path = isLanguagePrefix(prefix) ? `/${rest.join("/")}` : url.pathname;
  const excluded = /^\/(?:api|local-api|assets|branding|images|mock-documents|cdn-cgi|\.well-known)(?:\/|$)/i;
  return !excluded.test(url.pathname) && !excluded.test(path) && !/\.[^/]+$/.test(path);
}

export function requestLanguage(request: Request): Language {
  return resolveLanguage(new URL(request.url).pathname, request.headers.get("cookie") ?? "", request.headers.get("accept-language") ?? "");
}

export function languageRedirect(request: Request): Response | undefined {
  if (!isPageNavigation(request)) return;
  const url = new URL(request.url);
  const language = requestLanguage(request);
  const target = localizePath(url.pathname, language);
  if (target === url.pathname) return;
  return new Response(null, {
    status: 302,
    headers: { location: target + url.search, "cache-control": "no-store", vary: "Cookie, Accept-Language", "content-language": language },
  });
}

export function withLanguagePreference(response: Response, request: Request): Response {
  if (!isPageNavigation(request)) return response;
  const language = requestLanguage(request);
  if (cookieLanguage(request.headers.get("cookie") ?? "") === language) return response;
  const updated = new Response(response.body, response);
  updated.headers.append("set-cookie", languageCookie(language, new URL(request.url).protocol === "https:"));
  updated.headers.set("cache-control", "no-store");
  return updated;
}
