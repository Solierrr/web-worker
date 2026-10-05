import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildTraps, decoyResponse, matchHoneypot } from "./honeypot.ts";

const list = buildTraps(["/wp-login.php", "/wp-admin/", "/phpMyAdmin/", "/.env", "/", "invalido"]);

describe("matchHoneypot", () => {
  it("ignora entradas sem barra inicial e a raiz", () => {
    assert.deepEqual(list, ["/wp-login.php", "/wp-admin/", "/phpmyadmin/", "/.env"]);
  });

  it("casa por prefixo, como o robots.txt", () => {
    assert.equal(matchHoneypot("/wp-admin/setup-config.php", list)?.trap, "/wp-admin/");
    assert.equal(matchHoneypot("/.env.bak", list)?.trap, "/.env");
  });

  it("casa a pasta sem a barra final", () => {
    assert.equal(matchHoneypot("/wp-admin", list)?.trap, "/wp-admin/");
  });

  it("ignora maiusculas, barras duplicadas e codificacao", () => {
    assert.equal(matchHoneypot("/PHPMYADMIN/index.php", list)?.trap, "/phpmyadmin/");
    assert.equal(matchHoneypot("//wp-login.php", list)?.trap, "/wp-login.php");
    assert.equal(matchHoneypot("/%77p-login.php", list)?.trap, "/wp-login.php");
  });

  it("nao casa rotas reais da SPA nem caminhos parecidos", () => {
    for (const path of ["/", "/pt-BR/login", "/pt-BR/admin", "/wp-loginx", "/env", "/wp"]) {
      assert.equal(matchHoneypot(path, list), null, path);
    }
  });

  it("nao falha com codificacao invalida", () => {
    assert.equal(matchHoneypot("/%E0%A4%A", list), null);
  });
});

describe("decoyResponse", () => {
  it("devolve 404 sem cache", () => {
    const response = decoyResponse();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

describe("paths.json", () => {
  it("so tem iscas validas e nenhuma rota real do app", () => {
    const data = JSON.parse(readFileSync(new URL("./paths.json", import.meta.url), "utf8")) as { paths: string[] };
    assert.ok(data.paths.length > 0);
    assert.equal(buildTraps(data.paths).length, data.paths.length);
    for (const real of ["/pt-BR/login", "/en-US/admin/dashboard", "/es-ES/painel", "/index.html", "/favicon.svg", "/robots.txt"]) {
      assert.equal(matchHoneypot(real), null, real);
    }
  });
});
