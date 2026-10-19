import { routePatterns, routeWords } from "./routing.data.ts";

export const languages = ["pt-BR", "en-US", "es-ES"] as const;
export type Language = (typeof languages)[number];
export const languageCookieName = "solaria_language";
export function isLanguagePrefix(value: string): boolean {
  return /^[a-z]{2}(?:-[a-z0-9]{2,8})*$/i.test(value) || /^[a-z]{3}(?:-[a-z0-9]{2,8})+$/i.test(value);
}
const patterns = routePatterns.flatMap((pattern) => {
  const keys = pattern.split("/");
  return keys.map((_, index) => keys.slice(0, index + 1));
});

export function normalizeLanguage(value: string | undefined): Language | undefined {
  const lower = value?.toLowerCase();
  return languages.find((lang) => lang.toLowerCase() === lower) ?? languages.find((lang) => lang.split("-")[0] === lower?.split("-")[0]);
}

export function cookieLanguage(cookie: string): Language | undefined {
  const value = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${languageCookieName}=`))
    ?.slice(languageCookieName.length + 1);
  return languages.find((lang) => lang === value);
}

export function preferredLanguage(acceptLanguage: string): Language {
  const choices = acceptLanguage
    .split(",")
    .map((item, index) => {
      const [tag, ...parameters] = item.trim().split(";");
      const weight = parameters.find((value) => value.trim().startsWith("q="));
      const quality = weight ? Number(weight.trim().slice(2)) : 1;
      return { language: normalizeLanguage(tag.trim()), quality, index };
    })
    .filter((item) => item.language && Number.isFinite(item.quality) && item.quality > 0 && item.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return choices[0]?.language ?? "pt-BR";
}

export function resolveLanguage(pathname: string, cookie = "", acceptLanguage = ""): Language {
  return normalizeLanguage(pathname.split("/")[1]) ?? cookieLanguage(cookie) ?? preferredLanguage(acceptLanguage);
}

export function languageCookie(language: Language, secure: boolean): string {
  return `${languageCookieName}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function localizePath(pathname: string, target: Language): string {
  const parts = pathname.split("/").slice(1);
  const first = parts[0] ?? "";
  const sourcePrefix = normalizeLanguage(first);
  if (sourcePrefix || isLanguagePrefix(first)) parts.shift();
  const targetWords: Record<string, string> = routeWords[target];
  const match = (sourcePrefix ? [sourcePrefix] : languages)
    .flatMap((source) => {
      const sourceWords: Record<string, string> = routeWords[source];
      return patterns.filter(
        (pattern) =>
          pattern.length <= parts.length &&
          pattern.every((key, index) => key.startsWith(":") || parts[index] === (key.startsWith("$") ? key.slice(1) : sourceWords[key])),
      );
    })
    .sort((a, b) => b.filter((key) => !key.startsWith(":")).length - a.filter((key) => !key.startsWith(":")).length || b.length - a.length)[0];
  const translated = parts.map((part, index) => {
    const key = match?.[index];
    return key && !key.startsWith(":") && !key.startsWith("$") ? targetWords[key] : part;
  });
  return `/${target}${translated.join("/") ? `/${translated.join("/")}` : ""}`;
}
