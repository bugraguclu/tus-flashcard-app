import { describe, expect, it } from 'vitest';
import {
    BKA_TAG_TOPICS,
    classifyBkaTopic,
    classifyBkaTopicByContent,
    classifyBkaTopicByTag,
    getBkaTopicNames,
} from './bkaTaxonomy';
import { BKA_CONTENT_TOPICS } from './bkaContentTopics';

describe('BKA topic placement', () => {
    it('lets the author\'s own tag decide, never the card text', () => {
        // Text that the content pass would place in Kardiyoloji, tagged by the author as Hemato.
        const text = 'Kalp yetmezliginde {{c1::ACE-i}} mortaliteyi azaltir';
        expect(classifyBkaTopicByContent('Dahiliye BKA', text)).toBe('Kardiyoloji');
        expect(classifyBkaTopic('Dahiliye BKA', ['Hemato'], text)).toBe('Hematoloji');
    });

    it('places an unlabeled note by its text', () => {
        expect(classifyBkaTopic('Anatomi BKA', [], 'Plexus brachialis {{c1::C5-T1}} koklerinden olusur'))
            .toBe('Üst Ekstremite');
        expect(classifyBkaTopic('Patoloji BKA', [], 'Alport sendromunda BM {{c1::basket filesi}} gorunumu'))
            .toBe('Böbrek ve Üriner Sistem Patolojisi');
    });

    it('leaves a note no rule claims in the course deck', () => {
        expect(classifyBkaTopic('Anatomi BKA', [], 'Bu notta hicbir konu terimi gecmiyor')).toBeNull();
        // No rule set is allowed to end in a catch-all: an unmatched note must stay ungrouped.
        for (const [course, rules] of Object.entries(BKA_CONTENT_TOPICS)) {
            expect(classifyBkaTopicByContent(course, 'zzzz yyyy xxxx'), course).toBeNull();
            expect(rules.every((rule) => rule.keywords.length > 0)).toBe(true);
        }
    });

    it('reads the question stem before the answer', () => {
        // "pons" would pull this into Nöroanatomi; the card is asking about the sphenoid sinus.
        expect(classifyBkaTopicByContent('Anatomi BKA', 'sinüs sphenoidalis arka komşu ---> {{c1::pons}}'))
            .toBe('Baş ve Boyun');
        // With no subject term in the stem, the whole note is read instead.
        expect(classifyBkaTopicByContent('Anatomi BKA', 'En onde geçen: {{c1::m. tibialis posterior}}'))
            .toBe('Alt Ekstremite');
    });

    it('matches abbreviations as whole words and Turkish terms as word prefixes', () => {
        // "ARA" is akut romatizmal ateş; it must not claim a card that merely says "aralık".
        expect(classifyBkaTopicByContent('Pediatri BKA', 'Iki doz arasindaki aralik ne olmali'))
            .not.toBe('Romatoloji');
        expect(classifyBkaTopicByContent('Küçük Stajlar BKA', 'Turner sendromunda boy kisaligi'))
            .not.toBe('Üroloji');
        // A Turkish term still matches through its suffixes.
        expect(classifyBkaTopicByContent('Genel Cerrahi BKA', 'Memede ele gelen kitle')).toBe('Meme');
    });

    it('offers a subdeck for every name either pass can produce', () => {
        for (const course of Object.keys(BKA_TAG_TOPICS)) {
            const names = getBkaTopicNames(course);
            expect(new Set(names).size, `${course} has duplicate topic names`).toBe(names.length);
            for (const rule of BKA_TAG_TOPICS[course]) expect(names).toContain(rule.name);
            for (const rule of BKA_CONTENT_TOPICS[course] ?? []) expect(names).toContain(rule.name);
        }
        // Every course the content rules mention is a real course in the tag table.
        for (const course of Object.keys(BKA_CONTENT_TOPICS)) {
            expect(BKA_TAG_TOPICS, `${course} is not a source deck`).toHaveProperty(course);
        }
    });

    it('never creates two subdecks for the same topic', () => {
        // A content rule that renamed the author's "Tiroit" label would split one subject in two.
        for (const course of Object.keys(BKA_TAG_TOPICS)) {
            const content = (BKA_CONTENT_TOPICS[course] ?? []).map((rule) => rule.name);
            for (const tagTopic of BKA_TAG_TOPICS[course]) {
                const nearMiss = content.find((name) => (
                    name !== tagTopic.name && (name.startsWith(tagTopic.name) || tagTopic.name.startsWith(name))
                ));
                expect(nearMiss, `${course}: "${tagTopic.name}" vs "${nearMiss}"`).toBeUndefined();
            }
        }
    });

    it('keeps the mock-exam course on tags alone', () => {
        // "Deneme 1..4" are exam sets, not subjects; no card text can say which set it came from.
        expect(BKA_CONTENT_TOPICS['Deneme ve Soru BKA']).toBeUndefined();
        expect(classifyBkaTopicByTag('Deneme ve Soru BKA', ['1', 'Deneme'])).toBe('Deneme 1');
    });
});
