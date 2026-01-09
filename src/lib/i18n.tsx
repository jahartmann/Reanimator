'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import de from '@/locales/de.json';
import en from '@/locales/en.json';

type Translations = typeof de;
type Language = 'de' | 'en';

const translations: Record<Language, Translations> = { de, en };

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>('de');

    useEffect(() => {
        // Load saved language from localStorage
        const savedLang = localStorage.getItem('language') as Language;
        if (savedLang && (savedLang === 'de' || savedLang === 'en')) {
            setLanguageState(savedLang);
        }
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('language', lang);
    };

    const t = (key: string): string => {
        const keys = key.split('.');
        let value: unknown = translations[language];

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = (value as Record<string, unknown>)[k];
            } else {
                console.warn(`Translation missing: ${key}`);
                return key;
            }
        }

        return typeof value === 'string' ? value : key;
    };

    return (
        <I18nContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useTranslation() {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useTranslation must be used within an I18nProvider');
    }
    return context;
}
