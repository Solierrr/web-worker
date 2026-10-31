# Changelog

## [1.3.0](https://github.com/Solierrr/worker-failover/compare/v1.2.0...v1.3.0) (2026-10-31)


### Features

* refresh the unavailable page with the shared logo, canvas, favicon and new copy ([29c7f41](https://github.com/Solierrr/worker-failover/commit/29c7f417501fda41808b029e15dd05a003ffa2bc))


### Bug Fixes

* restore hand logo and original unavailable favicon ([f584f2b](https://github.com/Solierrr/worker-failover/commit/f584f2be39a6f648a3cdb6d07f8fd039bb0ff847))
* update unavailable page branding and desktop typography ([#12](https://github.com/Solierrr/worker-failover/issues/12)) ([8ba086d](https://github.com/Solierrr/worker-failover/commit/8ba086dc1aa28efe4c8d3b1ed3c125ff1bebdfc3))

## [1.2.0](https://github.com/Solierrr/web-worker/compare/v1.1.0...v1.2.0) (2026-10-20)


### Features

* localize edge routing and standalone unavailable page ([#9](https://github.com/Solierrr/web-worker/issues/9)) ([6d78558](https://github.com/Solierrr/web-worker/commit/6d785583788493a281bd5fd01452983a20c531fc))

## [1.1.0](https://github.com/Solierrr/web-worker/compare/v1.0.1...v1.1.0) (2026-10-19)


### Features

* add honeypot trap routes with cloudflare ban ([#6](https://github.com/Solierrr/web-worker/issues/6)) ([9bbcd4d](https://github.com/Solierrr/web-worker/commit/9bbcd4d6290a40ef492a14d98a2fc4ff11a6eb72))
* add otlp telemetry helpers to the worker ([6cab45e](https://github.com/Solierrr/web-worker/commit/6cab45ed5d9005419513b629164e91ade6149ddd))
* align worker unavailable page with web error screens ([8943650](https://github.com/Solierrr/web-worker/commit/8943650dfc389a242593d3a0bcf716bdf49a715c))
* report honeypot hits and origin failures as telemetry ([f9daa3d](https://github.com/Solierrr/web-worker/commit/f9daa3d129881ac3de7b9fe735151ce0487d3dbc))


### Bug Fixes

* detect gateway failures independently of proxy server headers ([62d84a4](https://github.com/Solierrr/web-worker/commit/62d84a4d5df1468ec2bfd3e094aaa26aa7522bcf))
* recognize kong route failures in browser html responses ([1d88eee](https://github.com/Solierrr/web-worker/commit/1d88eeef5a4c4f12a243f13188ecb01f69ba24e6))
* show standalone fallback when kong has no origin route ([556c3fb](https://github.com/Solierrr/web-worker/commit/556c3fb69590f580b3e9fc20c6f974b8b487194a))

## [1.0.1](https://github.com/Solierrr/web-worker/compare/v1.0.0...v1.0.1) (2026-09-30)


### Bug Fixes

* rename worker to web-worker ([15c595a](https://github.com/Solierrr/web-worker/commit/15c595a5e36062f1108981467b77f50c4eb8965d))

## 1.0.0 (2026-09-29)


### Features

* add apex fallback worker ([a7e6b22](https://github.com/Solierrr/cloudflare-worker/commit/a7e6b22dc01ec9bcbd9edbc6f7283b3ae427537d))
