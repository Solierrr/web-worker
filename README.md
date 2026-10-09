# cloudflare worker

Worker de borda para o domínio raiz `solarianetwork.site`. Ele encaminha as requisições para `origin.solarianetwork.site` e apresenta uma página temporária com status HTTP 503 quando a origem retorna erro 5xx ou não pode ser acessada.

O Worker não busca o próprio domínio público. A origem usa um hostname separado, fora da route `solarianetwork.site/*`, para evitar recursão.

## configuração necessária

- Mantenha o registro DNS do domínio raiz proxied pela Cloudflare para que a route do Worker receba as requisições.
- Faça `origin.solarianetwork.site` apontar diretamente para o origin do Kong, sem proxy da Cloudflare.
- Configure o Ingress do Web para aceitar `origin.solarianetwork.site` e emitir um certificado TLS para esse hostname. O Ingress atual aceita apenas `solarianetwork.site`.
- A route `solarianetwork.site/*` e o hostname de origem estão configurados em `wrangler.jsonc`.

O Terraform atual define o DNS do domínio raiz com `proxied = false`; ajuste-o para `true` antes de ativar a route. O registro wildcard DNS já cobre o hostname `origin` e permanece DNS-only.

## honeypot

Rotas isca (`/wp-login.php`, `/.env`, `/.git/` etc.) respondem 404 sem chegar à origem e o IP é adicionado a uma Custom List da Cloudflare. Quem usa a lista é uma regra WAF com Managed Challenge, nunca Block permanente.

- A lista de iscas fica em `src/honeypot/paths.json`, gerada a partir do `robots.txt` do web-app (`npm run honeypot:sync`, ou `npm run honeypot:check` para conferir se está em dia). A correspondência é por prefixo e ignora maiúsculas.
- O ban é opcional: sem `CF_API_TOKEN`, `CF_ACCOUNT_ID` e `HONEYPOT_LIST_ID` o Worker só registra o acesso nos logs. Configure o token como secret (`wrangler secret put CF_API_TOKEN`, com permissão de editar listas da conta) e os dois IDs como variáveis. Para testar localmente use `.dev.vars` (modelo em `.dev.vars.example`).
- Modo de teste local: com `HONEYPOT_MODE=MOCK` no `.dev.vars`, o ban é só simulado (log `honeypot_ban_mock`, sem chamar a Cloudflare e com um IP de documentação quando não há `cf-connecting-ip`). A variável só vale quando a requisição é local: host `localhost`/`127.0.0.1`/`[::1]` ou IP do cliente em loopback (o `wrangler dev` usa o host da route, mas entrega `127.0.0.1` como IP). No ar a Cloudflare define o IP real do visitante, então a variável é ignorada e o ban é sempre real, mesmo que ela seja definida por engano.
- IPv4 entra como `/32` e IPv6 como `/64`.
- Listas da Cloudflare não expiram itens sozinhas: um cron (`0 */16 * * *`, às 00:00 e 16:00 UTC) remove os bans criados pelo honeypot que passaram de `HONEYPOT_BAN_TTL_SECONDS` (padrão 3600). Como a limpeza só roda nesses horários, um ban dura de `HONEYPOT_BAN_TTL_SECONDS` até esse tempo mais o intervalo até a próxima execução (no máximo cerca de 17 h com o padrão). Entradas manuais da lista (sem o comentário `honeypot:`) não são tocadas.
- Campo honeypot preenchido em formulário não passa por aqui: o web-app finge sucesso e não bane IP.

## telemetria

Além dos logs do Cloudflare (`observability.enabled` em `wrangler.jsonc`), o Worker pode enviar logs e spans por OTLP/HTTP para o OpenTelemetry Collector. Sem `OTLP_ENDPOINT` nada é enviado.

- `OTLP_ENDPOINT`: base do Collector (o Worker acrescenta `/v1/logs` e `/v1/traces`). O Collector precisa estar acessível pela internet, com autenticação.
- `OTLP_AUTH`: valor do cabeçalho `Authorization`. Configure como secret (`wrangler secret put OTLP_AUTH`).
- `DEPLOYMENT_ENVIRONMENT`: ambiente do recurso (padrão `prod`).
- Eventos enviados: `honeypot_hit` (trap, path, method e país; o IP e o user-agent ficam só nos logs do Cloudflare, nunca no OTLP), `origin_error` (resposta 5xx da origem) e `origin_unreachable`. Cada chamada à origem gera um span e leva o cabeçalho `traceparent`, o que liga o trace do Worker ao do Kong e dos serviços.
- O envio roda em `ctx.waitUntil`, então não atrasa a resposta, e a falha do Collector é ignorada.

## desenvolvimento

```bash
npm install
npm run dev
npm run check
npm test
```

A publicação pode ser feita pela integração GitHub da Cloudflare ou com `npm run deploy`.
