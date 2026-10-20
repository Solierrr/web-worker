import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPageNavigation, languageRedirect, requestLanguage, withLanguagePreference } from "./language.ts";
import { createUnavailablePage } from "../unavailable.ts";

const page = (path: string, headers: HeadersInit = {}) => new Request(`https://example.com${path}`, { headers: { accept: "text/html", ...headers } });

describe("edge language routing", () => {
  it("chooses URL over cookie and weights browser preferences", () => {
    assert.equal(requestLanguage(page("/pt-BR/painel", { cookie: "solaria_language=en-US", "accept-language": "es" })), "pt-BR");
    assert.equal(requestLanguage(page("/", { cookie: "solaria_language=en-US", "accept-language": "es" })), "en-US");
    assert.equal(requestLanguage(page("/", { "accept-language": "pt;q=0, es;q=0.5, en;q=0.9" })), "en-US");
    assert.equal(requestLanguage(page("/", { "accept-language": "fr" })), "pt-BR");
  });
  it("keeps path, encoded IDs and query on a private redirect", () => {
    const response = languageRedirect(page("/projetos/painel/editar?returnTo=%2Ffoo&x=1", { cookie: "solaria_language=en-US" }));
    assert.equal(response?.status, 302);
    assert.equal(response.headers.get("location"), "/en-US/projects/painel/edit?returnTo=%2Ffoo&x=1");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(languageRedirect(page("/fr-FR/login"))?.headers.get("location"), "/pt-BR/login");
    assert.equal(languageRedirect(page("/pt-br/painel"))?.headers.get("location"), "/pt-BR/painel");
    assert.equal(languageRedirect(page("/en-US/dashboard")), undefined);
  });
  it("leaves APIs, files, non-document requests and methods alone", () => {
    for (const path of ["/api/users", "/en-US/api/users", "/zh-Hant/api/users", "/assets/app.js", "/branding/hands.svg", "/favicon.ico", "/cdn-cgi/trace", "/.well-known/security.txt"]) {
      assert.equal(languageRedirect(page(path)), undefined, path);
    }
    assert.equal(isPageNavigation(new Request("https://example.com/login", { method: "POST", body: "email=example" })), false);
    assert.equal(languageRedirect(page("/login", { "sec-fetch-dest": "script" })), undefined);
    assert.equal(languageRedirect(new Request("https://example.com/login")), undefined);
  });
  it("appends a host-only preference without discarding origin cookies", () => {
    const original = new Response("ok", { headers: { "set-cookie": "session=keep; HttpOnly" } });
    const response = withLanguagePreference(original, page("/es-ES/panel"));
    assert.deepEqual(response.headers.getSetCookie(), ["session=keep; HttpOnly", "solaria_language=es-ES; Path=/; Max-Age=31536000; SameSite=Lax; Secure"]);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
  it("renders translated standalone links with query and safe attribute escaping", () => {
    const html = createUnavailablePage({ language: "en-US", pathname: "/en-US/projects/mensagens/edit", search: '?next=%22&x="<script>' });
    assert.match(html, /<html lang="en-US">/);
    assert.match(html, /We’re temporarily unavailable/);
    assert.match(html, /\/pt-BR\/projetos\/mensagens\/editar\?next=%22&amp;x=&quot;&lt;script&gt;/);
    assert.match(html, /aria-selected="true"/);
    assert.match(html, /id="language-trigger"[^>]*aria-haspopup="listbox"/);
    assert.match(html, /role="listbox"[^>]*hidden/);
    assert.doesNotMatch(html, /<nav class="languages"/);
    assert.doesNotMatch(html, /x="<script>/);
  });
});
