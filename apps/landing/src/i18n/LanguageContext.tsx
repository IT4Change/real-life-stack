import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { translations, type Translation } from './translations'

export const SUPPORTED_LANGUAGES = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'he', label: 'עברית', flag: '🇮🇱', rtl: true },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

interface LanguageContextValue {
  language: LanguageCode
  setLanguage: (code: LanguageCode) => void
  t: Translation
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const STORAGE_KEY = 'rls-language'

function detectInitialLanguage(): LanguageCode {
  const validLangs = SUPPORTED_LANGUAGES.map((l) => l.code) as string[]

  const urlLang = new URLSearchParams(window.location.search).get('lang')
  if (urlLang && validLangs.includes(urlLang)) return urlLang as LanguageCode

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && validLangs.includes(stored)) return stored as LanguageCode

  const browserLang = navigator.language.split('-')[0]
  if (validLangs.includes(browserLang)) return browserLang as LanguageCode

  return 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(detectInitialLanguage)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language)
    document.documentElement.lang = language
    const rtl = SUPPORTED_LANGUAGES.find((l) => l.code === language && 'rtl' in l)
    document.documentElement.dir = rtl ? 'rtl' : 'ltr'
  }, [language])

  const t = translations[language] ?? translations.en

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
