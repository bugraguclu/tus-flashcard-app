/**
 * Çıkmış TUS Denemeleri: the bundled pack of past TUS exams, as data.
 *
 * The pack is a zip built by scripts/build-past-exam-pack.ts: `questions.json` in the format
 * below, plus its images under an Anki-style `media` manifest. This module holds what both ends
 * share — the format, the checks every question must pass, and the names, tags and identities an
 * exam and a question take in the collection — and nothing that touches the database, so the
 * build script can run it under Node.
 */

export const PAST_EXAM_PACK_FORMAT = 1;

/** Root of the deck tree; each of its children is one exam. */
export const PAST_EXAM_ROOT_DECK = 'Çıkmış TUS Denemeleri';

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
export type OptionLetter = typeof OPTION_LETTERS[number];

/** Basic sciences come first in every TUS booklet; the rest are clinical. */
const BASIC_SCIENCE_COURSES = new Set(['Anatomi', 'Fizyoloji', 'Biyokimya', 'Mikrobiyoloji', 'Patoloji', 'Farmakoloji']);

export interface PastExamQuestion {
    /** Stable source id. The note's guid comes from it, so a newer pack updates the same note. */
    id: number;
    year: number;
    /** Sitting within the year: 1 for the first (spring) exam, 2 for the second. */
    exam: number;
    /** Question number in the booklet. */
    number: number;
    course: string;
    unit: string;
    /** HTML. Images are referenced by bare media filenames. */
    stem: string;
    /** Five options, A to E, as HTML. */
    options: string[];
    answer: OptionLetter;
    /** HTML shown under the answer; absent for most questions. */
    explanation?: string;
}

export interface PastExamPack {
    format: typeof PAST_EXAM_PACK_FORMAT;
    questions: PastExamQuestion[];
}

export interface PastExamSummary {
    year: number;
    exam: number;
    questions: number;
}

/** Counts the deck list shows before the pack is installed, written next to the pack. */
export interface PastExamManifest {
    format: number;
    /** Hash of the pack's questions; recorded when it is installed. */
    version: string;
    questions: number;
    media: number;
    explanations: number;
    firstYear: number;
    lastYear: number;
    exams: PastExamSummary[];
}

export function buildPastExamManifest(pack: PastExamPack, media: number, version: string): PastExamManifest {
    const exams = summarizePastExams(pack.questions);
    return {
        format: PAST_EXAM_PACK_FORMAT,
        version,
        questions: pack.questions.length,
        media,
        explanations: pack.questions.filter((question) => question.explanation).length,
        firstYear: Math.min(...exams.map((exam) => exam.year)),
        lastYear: Math.max(...exams.map((exam) => exam.year)),
        exams,
    };
}

export class PastExamPackError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PastExamPackError';
    }
}

export function isOptionLetter(value: unknown): value is OptionLetter {
    return typeof value === 'string' && (OPTION_LETTERS as readonly string[]).includes(value);
}

function positiveInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Read `questions.json`. Every question is checked, and one bad question rejects the whole pack:
 * installing part of an exam would leave a deck that silently skips questions.
 */
export function parsePastExamPack(raw: unknown): PastExamPack {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PastExamPackError('Soru paketi okunamadı.');
    const record = raw as Record<string, unknown>;
    if (record.format !== PAST_EXAM_PACK_FORMAT) {
        throw new PastExamPackError(`Desteklenmeyen soru paketi sürümü: ${String(record.format)}.`);
    }
    if (!Array.isArray(record.questions) || record.questions.length === 0) {
        throw new PastExamPackError('Soru paketinde soru yok.');
    }

    const seenIds = new Set<number>();
    const seenSlots = new Set<string>();
    const questions = record.questions.map((entry, index): PastExamQuestion => {
        const fail = (reason: string): never => {
            throw new PastExamPackError(`Soru paketindeki ${index + 1}. soru geçersiz: ${reason}.`);
        };
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('kayıt değil');
        const item = entry as Record<string, unknown>;
        const id = positiveInteger(item.id) ?? fail('kimlik');
        const year = positiveInteger(item.year) ?? fail('yıl');
        const exam = positiveInteger(item.exam) ?? fail('dönem');
        const number = positiveInteger(item.number) ?? fail('soru numarası');
        const course = nonEmptyString(item.course) ?? fail('ders');
        const unit = nonEmptyString(item.unit) ?? fail('konu');
        const stem = nonEmptyString(item.stem) ?? fail('soru metni');
        if (!Array.isArray(item.options) || item.options.length !== OPTION_LETTERS.length) fail('beş seçenek yok');
        const options = (item.options as unknown[]).map((option) => nonEmptyString(option) ?? fail('boş seçenek'));
        if (!isOptionLetter(item.answer)) fail('cevap anahtarı');
        if (item.explanation !== undefined && typeof item.explanation !== 'string') fail('açıklama');
        if (year < 1990 || year > 2100 || exam > 4) fail('sınav tarihi');
        if (seenIds.has(id)) fail(`${id} kimliği tekrar ediyor`);
        const slot = `${year}-${exam}-${number}`;
        if (seenSlots.has(slot)) fail(`${slot} numarası tekrar ediyor`);
        seenIds.add(id);
        seenSlots.add(slot);
        const explanation = typeof item.explanation === 'string' && item.explanation.trim() !== ''
            ? item.explanation
            : undefined;
        return {
            id, year, exam, number, course, unit, stem, options,
            answer: item.answer as OptionLetter,
            ...(explanation ? { explanation } : {}),
        };
    });
    return { format: PAST_EXAM_PACK_FORMAT, questions };
}

/** Newest exam first, then booklet order: the order the deck list and the study queue use. */
export function comparePastExamQuestions(left: PastExamQuestion, right: PastExamQuestion): number {
    return right.year - left.year || right.exam - left.exam || left.number - right.number;
}

export function summarizePastExams(questions: readonly PastExamQuestion[]): PastExamSummary[] {
    const byExam = new Map<string, PastExamSummary>();
    for (const question of questions) {
        const key = pastExamKey(question.year, question.exam);
        const summary = byExam.get(key) ?? { year: question.year, exam: question.exam, questions: 0 };
        summary.questions += 1;
        byExam.set(key, summary);
    }
    return [...byExam.values()].sort((left, right) => right.year - left.year || right.exam - left.exam);
}

export function pastExamKey(year: number, exam: number): string {
    return `${year}-${exam}`;
}

/** The exam's deck under the root, e.g. "2026-1 TUS": short enough for one line in the deck list. */
export function pastExamDeckLeaf(year: number, exam: number): string {
    return `${year}-${exam} TUS`;
}

export function pastExamDeckName(year: number, exam: number, rootDeckName: string = PAST_EXAM_ROOT_DECK): string {
    return `${rootDeckName}::${pastExamDeckLeaf(year, exam)}`;
}

const GUID_PREFIX = 'tus-cikmis-';

export function pastExamGuid(questionId: number): string {
    return `${GUID_PREFIX}${questionId}`;
}

export function isPastExamGuid(guid: unknown): boolean {
    return typeof guid === 'string' && guid.startsWith(GUID_PREFIX);
}

export function pastExamCourseGroup(course: string): 'Temel Bilimler' | 'Klinik Bilimler' {
    return BASIC_SCIENCE_COURSES.has(course) ? 'Temel Bilimler' : 'Klinik Bilimler';
}

/** Anki tags cannot hold spaces; each word joins with an underscore, as Anki users write them. */
function tagPart(value: string): string {
    return value.trim().replace(/\s+/g, '_').replace(/:+/g, '_');
}

/**
 * Tags that make an exam's questions findable outside its deck: `tag:Ders::Anatomi` gathers one
 * course across all 54 exams, `tag:Konu::Anatomi::Eklemler` one unit, and a filtered deck can be
 * built on either.
 */
export function pastExamTags(question: Pick<PastExamQuestion, 'year' | 'exam' | 'course' | 'unit'>): string[] {
    return [
        `Çıkmış_TUS::${question.year}_${question.exam}`,
        tagPart(pastExamCourseGroup(question.course)),
        `Ders::${tagPart(question.course)}`,
        `Konu::${tagPart(question.course)}::${tagPart(question.unit)}`,
    ];
}

/** "2026-1 TUS · Soru 14", printed above the question. */
export function pastExamQuestionLabel(question: Pick<PastExamQuestion, 'year' | 'exam' | 'number'>): string {
    return `${pastExamDeckLeaf(question.year, question.exam)} · Soru ${question.number}`;
}

/** The note's fields, in the order of the "TUS Sorusu" note type (lib/tusQuestionCard.ts). */
export function pastExamNoteFields(question: PastExamQuestion): string[] {
    return [
        question.stem,
        ...question.options,
        question.answer,
        question.explanation ?? '',
        question.course,
        question.unit,
        pastExamQuestionLabel(question),
    ];
}
