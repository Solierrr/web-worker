import { type Language } from "./i18n/routing/routing.ts";
import { unavailableCopy } from "./unavailable.copy.ts";
import { faviconSvg } from "./unavailable.favicon.ts";
import { canvasMarkup, canvasScript, canvasStyles } from "./unavailable.canvas.ts";
import { logoMarkup, logoScript } from "./unavailable.logo.ts";
import { languageSwitcher, languageSwitcherScript, languageSwitcherStyles } from "./language-switcher/LanguageSwitcher.ts";

const faviconHref = `data:image/svg+xml;base64,${btoa(faviconSvg)}`;

export function createUnavailablePage({ language = "pt-BR", pathname = "/", search = "" }: {
  language?: Language; pathname?: string; search?: string;
} = {}) {
  const copy = unavailableCopy[language];
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${copy.title}</title>
<link rel="icon" type="image/svg+xml" href="${faviconHref}">
<style>
:root { color-scheme: light; --text-subtitle: 1.65rem; --text-label: 1.2rem; --color-operational-surface: #fafafa; --color-operational-ink: #242628; --color-operational-muted: #62676f; font-family: system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--color-operational-surface); color: var(--color-operational-ink); }
main { position: relative; isolation: isolate; min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 3rem 1.5rem; }
.content { position: relative; width: 100%; max-width: 44rem; display: flex; flex-direction: column; align-items: center; gap: 1.5rem; padding: 1rem; text-align: center; }
@media (min-width: 640px) { .content { padding: 1.5rem; } }
@media (min-width: 1024px) { :root { --text-subtitle: 2rem; --text-label: 1.35rem; } .content { max-width: 52rem; gap: 2rem; } }
.copy { width: 100%; max-width: 48rem; display: flex; flex-direction: column; gap: .25rem; }
h1 { margin: 0; font-size: var(--text-subtitle); font-weight: 600; line-height: 1.25; }
p { margin: 0; color: var(--color-operational-muted); font-size: var(--text-label); line-height: 1.625; }
.logo { width: 8rem; height: 8rem; flex-shrink: 0; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; touch-action: manipulation; }
.logo svg { width: 100%; height: 100%; overflow: visible; }
.logo:focus-visible { outline: 2px solid var(--color-operational-ink); outline-offset: 8px; }
${canvasStyles}
${languageSwitcherStyles}
</style>
</head>
<body>
${languageSwitcher({ language, pathname, search, label: copy.language })}
<main>
${canvasMarkup}
<div class="content">
${logoMarkup(copy.logo)}
<div class="copy"><h1>${copy.heading}</h1><p>${copy.message}</p></div>
</div>
</main>
<script>
${logoScript}
${canvasScript}
${languageSwitcherScript}
</script>
</body>
</html>`;
}
