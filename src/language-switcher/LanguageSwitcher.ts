import { languages, localizePath, type Language } from "../i18n/routing/routing.ts";

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}

export function languageSwitcher({ language, pathname, search, label }: { language: Language; pathname: string; search: string; label: string }) {
  const names = { "pt-BR": "Português", "en-US": "English", "es-ES": "Español" };
  const options = languages.map((target) => `<li role="presentation"><a role="option" aria-selected="${target === language}" href="${escapeAttribute(localizePath(pathname, target) + search)}" lang="${target}" hreflang="${target}">${names[target]}</a></li>`).join("");
  return `<div class="language-switcher">
<button id="language-trigger" type="button" aria-label="${escapeAttribute(label)}" aria-haspopup="listbox" aria-controls="language-options" aria-expanded="false">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/></svg>
<svg class="language-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6l6 -6"/></svg>
</button>
<ul id="language-options" class="language-menu" role="listbox" aria-label="${escapeAttribute(label)}" hidden>${options}</ul>
</div>`;
}

export const languageSwitcherStyles = `
.language-switcher { position: fixed; top: 1.5rem; right: 1.5rem; z-index: 20; }
.language-switcher button { display: flex; height: 2.25rem; align-items: center; gap: .25rem; padding: 0 .5rem; border: 0; border-radius: .25rem; background: transparent; color: inherit; cursor: pointer; transition: background-color 150ms; }
.language-switcher button:hover { background: #f3f4f6; }
.language-switcher button:focus-visible { outline: 2px solid var(--color-operational-ink); outline-offset: 2px; }
.language-chevron { transition: transform 250ms; }
[aria-expanded="true"] .language-chevron { transform: rotate(180deg); }
.language-menu { position: absolute; right: 0; top: 100%; width: max-content; max-width: calc(100vw - 3rem); margin: .25rem 0 0; padding: 0; overflow: hidden; border-radius: .5rem; background: white; box-shadow: 0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a; list-style: none; }
.language-menu[hidden] { display: none; }
.language-menu a { display: block; padding: .5rem 1rem; color: var(--color-operational-ink); font-size: 1rem; font-weight: 500; line-height: 1.5; text-decoration: none; }
.language-menu a:hover, .language-menu a:focus, .language-menu a[aria-selected="true"] { outline: none; background: #4444440d; }
@media (prefers-reduced-motion: reduce) { .language-chevron { transition: none; } }
`;

export const languageSwitcherScript = `
const languageControl = document.querySelector('.language-switcher');
const languageButton = document.getElementById('language-trigger');
const languageMenu = document.getElementById('language-options');
const languageOptions = Array.from(languageMenu.querySelectorAll('a'));
languageOptions.forEach(link => { link.hash = location.hash; });
function showLanguageMenu(open) {
  languageButton.setAttribute('aria-expanded', String(open));
  languageMenu.hidden = !open;
}
languageButton.addEventListener('click', () => showLanguageMenu(languageMenu.hidden));
languageButton.addEventListener('keydown', event => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  showLanguageMenu(true);
  languageOptions[event.key === 'ArrowDown' ? 0 : languageOptions.length - 1].focus();
});
document.addEventListener('click', event => { if (!languageControl.contains(event.target)) showLanguageMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || languageMenu.hidden) return;
  showLanguageMenu(false);
  languageButton.focus();
});
languageMenu.addEventListener('keydown', event => {
  const index = languageOptions.indexOf(document.activeElement);
  let next;
  if (event.key === 'ArrowDown') next = (index + 1) % languageOptions.length;
  else if (event.key === 'ArrowUp') next = (index - 1 + languageOptions.length) % languageOptions.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = languageOptions.length - 1;
  else if (event.key === ' ') { event.preventDefault(); document.activeElement.click(); return; }
  else return;
  event.preventDefault();
  languageOptions[next].focus();
});
`;
