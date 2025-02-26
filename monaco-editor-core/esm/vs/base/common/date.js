import { LANGUAGE_DEFAULT } from './platform.js';
export const safeIntl = {
    DateTimeFormat(locales, options) {
        try {
            return new Intl.DateTimeFormat(locales, options);
        }
        catch {
            return new Intl.DateTimeFormat(undefined, options);
        }
    },
    Collator(locales, options) {
        try {
            return new Intl.Collator(locales, options);
        }
        catch {
            return new Intl.Collator(undefined, options);
        }
    },
    Segmenter(locales, options) {
        try {
            return new Intl.Segmenter(locales, options);
        }
        catch {
            return new Intl.Segmenter(undefined, options);
        }
    },
    Locale(tag, options) {
        try {
            return new Intl.Locale(tag, options);
        }
        catch {
            return new Intl.Locale(LANGUAGE_DEFAULT, options);
        }
    }
};
