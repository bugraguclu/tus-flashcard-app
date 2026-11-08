import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ getDB: () => { throw new Error('not used'); } }));

import { mergeCatalogTags } from './catalogLearnerState';

describe('catalog tags across a package refresh', () => {
    it('keeps what the learner added and removed, and takes the package’s own changes', () => {
        // Installed with [konu-a, eski]; the learner removed konu-a and added marked. The new
        // package renames eski to yeni and adds ek.
        expect(mergeCatalogTags(['konu-a', 'yeni', 'ek'], ['eski', 'marked'], ['konu-a', 'eski']))
            .toEqual(['yeni', 'ek', 'marked']);
    });

    it('gives an untouched note the new package’s tags', () => {
        expect(mergeCatalogTags(['Kardiyoloji', 'yeni'], ['Kardiyo'], ['Kardiyo'])).toEqual(['Kardiyoloji', 'yeni']);
    });

    it('matches tags the way the rest of the app does, ignoring case', () => {
        expect(mergeCatalogTags(['Leech'], ['leech', 'Marked'], ['LEECH'])).toEqual(['Leech', 'Marked']);
    });

    it('keeps every installed tag on a note installed before the package’s tags were recorded', () => {
        expect(mergeCatalogTags(['konu-a', 'yeni'], ['konu-a', 'eski', 'marked'], undefined))
            .toEqual(['konu-a', 'eski', 'marked']);
    });
});
