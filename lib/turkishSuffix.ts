const UNITS = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

/** The last word Turkish speaks for a whole number: 25 → "beş", 150 → "elli", 200 → "yüz". */
function lastSpokenWord(value: number): string {
    const n = Math.abs(Math.trunc(value));
    if (n === 0) return 'sıfır';
    if (n % 10 !== 0) return UNITS[n % 10];
    if (n % 100 !== 0) return TENS[(n % 100) / 10];
    if (n % 1000 !== 0) return 'yüz';
    if (n % 1_000_000 !== 0) return 'bin';
    return n % 1_000_000_000 !== 0 ? 'milyon' : 'milyar';
}

/**
 * The ablative ending a number written in digits takes in Turkish, with its apostrophe:
 * 10’dan, 25’ten, 50’den, 40’tan. Vowel harmony and consonant assimilation follow the number as it
 * is read aloud, so the ending cannot be fixed in a template.
 */
export function turkishAblative(value: number): string {
    const word = lastSpokenWord(value);
    const vowels = word.match(/[aeıioöuü]/g) ?? ['e'];
    const back = 'aıou'.includes(vowels[vowels.length - 1]);
    const voiceless = /[çfhkpsşt]$/.test(word);
    return `’${voiceless ? 't' : 'd'}${back ? 'a' : 'e'}n`;
}
