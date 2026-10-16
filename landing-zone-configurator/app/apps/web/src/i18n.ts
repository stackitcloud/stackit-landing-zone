import { createInstance, type TOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import { englishMessages } from "./locales/en";

export type Language = "de" | "en";
const formattedMessage = Symbol("formatted-interface-message");
export type FormattedMessage = {
  readonly [formattedMessage]: true;
  readonly message: string;
  readonly values: Record<string, unknown>;
};

export function formatMessage(
  message: string,
  values: Record<string, unknown>,
): FormattedMessage {
  return { [formattedMessage]: true, message, values };
}

export const languageStorageKey = "lzc-language";

export function preferredLanguage(
  languages: readonly string[],
  preference?: string | null,
): Language {
  if (preference === "de" || preference === "en") return preference;
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (base === "de" || base === "en") return base;
  }
  return "en";
}

function initialLanguage(): Language {
  let preference: string | null = null;
  try {
    preference = window.localStorage.getItem(languageStorageKey);
  } catch {}
  return preferredLanguage(
    typeof navigator === "undefined" ? [] : navigator.languages,
    preference,
  );
}

export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: initialLanguage(),
  fallbackLng: "en",
  supportedLngs: ["de", "en"],
  initAsync: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false, skipOnVariables: true },
  resources: {
    en: { translation: englishMessages },
    de: {
      translation: Object.fromEntries(
        Object.keys(englishMessages).map((key) => [key, key]),
      ),
    },
  },
});

export function currentLanguage(): Language {
  return i18n.resolvedLanguage === "de" ? "de" : "en";
}

export function t(
  message: string | FormattedMessage,
  options?: TOptions,
): string;
export function t<T>(message: T): T;
export function t(message: unknown, options?: TOptions): unknown {
  if (
    typeof message === "object" &&
    message !== null &&
    formattedMessage in message
  ) {
    const formatted = message as FormattedMessage;
    return t(formatted.message, formatted.values);
  }
  if (typeof message !== "string" || !Object.hasOwn(englishMessages, message))
    return message;
  const translated = i18n.t(message, { ...options, skipInterpolation: true });
  return translated.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) =>
    Object.hasOwn(options ?? {}, key) ? String(options?.[key]) : placeholder,
  );
}

export async function setLanguage(language: Language): Promise<void> {
  try {
    window.localStorage.setItem(languageStorageKey, language);
  } catch {}
  await i18n.changeLanguage(language);
}

i18n.on("languageChanged", (language) => {
  if (typeof document !== "undefined") document.documentElement.lang = language;
});
if (typeof document !== "undefined")
  document.documentElement.lang = currentLanguage();
