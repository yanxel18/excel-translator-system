import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translate, type Locale } from "./locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (message: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function initialLocale(): Locale {
  const saved = localStorage.getItem("excel-translator-locale");
  return saved === "ja" || saved === "zh" ? saved : "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (next) => {
        localStorage.setItem("excel-translator-locale", next);
        updateLocale(next);
      },
      t: (message) => translate(locale, message),
    }),
    [locale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider.");
  return value;
}
