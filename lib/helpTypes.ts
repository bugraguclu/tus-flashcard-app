import type { SupportedLocale } from './i18n';

export type HelpGroupId =
    | 'getting-started'
    | 'studying'
    | 'cards'
    | 'progress'
    | 'data'
    | 'app'
    | 'help';

export interface HelpGroupDefinition {
    readonly id: HelpGroupId;
    readonly title: Record<SupportedLocale, string>;
    readonly articleIds: readonly string[];
}

/**
 * Canonical grouping from docs/user-guide/in-app/00-help-center.md.
 * Keeps the topic list order identical in Turkish and English.
 */
export const HELP_GROUPS: readonly HelpGroupDefinition[] = [
    {
        id: 'getting-started',
        title: { tr: 'Başlarken', en: 'Getting started' },
        articleIds: ['welcome', 'concepts', 'quick-start'],
    },
    {
        id: 'studying',
        title: { tr: 'Çalışma', en: 'Studying' },
        articleIds: ['decks', 'studying', 'deck-options', 'fsrs', 'filtered-decks'],
    },
    {
        id: 'cards',
        title: { tr: 'Kartlar', en: 'Cards' },
        articleIds: ['editing', 'note-types', 'browser'],
    },
    {
        id: 'progress',
        title: { tr: 'İlerleme', en: 'Progress' },
        articleIds: ['statistics', 'stopwatch'],
    },
    {
        id: 'data',
        title: { tr: 'Veriler', en: 'Your data' },
        articleIds: ['import-export', 'backups', 'anki'],
    },
    {
        id: 'app',
        title: { tr: 'Uygulama', en: 'The app' },
        articleIds: ['settings', 'automation', 'tus-cards'],
    },
    {
        id: 'help',
        title: { tr: 'Yardım', en: 'Help' },
        articleIds: ['faq', 'glossary'],
    },
];

export type HelpCalloutTone = 'anki' | 'web' | 'warning' | 'note';

export type HelpInline =
    | { readonly kind: 'text'; readonly text: string }
    | { readonly kind: 'bold'; readonly text: string }
    | { readonly kind: 'italic'; readonly text: string }
    | { readonly kind: 'code'; readonly text: string }
    | {
        readonly kind: 'link';
        readonly text: string;
        readonly articleId?: string;
        readonly sectionId?: string;
        readonly url?: string;
    };

export type HelpBlock =
    | { readonly kind: 'paragraph'; readonly inlines: readonly HelpInline[] }
    | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly (readonly HelpInline[])[] }
    | { readonly kind: 'callout'; readonly tone: HelpCalloutTone; readonly blocks: readonly HelpBlock[] }
    | {
        readonly kind: 'table';
        readonly headers: readonly (readonly HelpInline[])[];
        readonly rows: readonly (readonly (readonly HelpInline[])[])[];
    }
    | { readonly kind: 'code'; readonly text: string };

export interface HelpSection {
    readonly id: string;
    readonly explicitAnchor: boolean;
    readonly level: 2 | 3;
    readonly title: string;
    readonly parentTitle?: string;
    readonly blocks: readonly HelpBlock[];
}

export interface HelpArticle {
    readonly id: string;
    readonly file: string;
    readonly order: number;
    readonly title: string;
    readonly summary: string;
    readonly groupId: HelpGroupId;
    readonly introBlocks: readonly HelpBlock[];
    readonly sections: readonly HelpSection[];
}

export interface HelpLinkTarget {
    readonly article: string;
    readonly section?: string;
}
