import { describe, expect, it } from 'vitest';
import {
    MAX_TYPE_ANSWER_CHARS,
    parseTypeAnswerBridgeMessage,
    typeAnswerBridgeScript,
} from './typeAnswerBridge';

describe('typed-answer WebView bridge', () => {
    const token = 'runtime-token';

    it('accepts only bounded change and submit messages carrying the runtime token', () => {
        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'tus-type-answer', token, type: 'change', value: 'mitoz',
        }), token)).toEqual({ type: 'change', value: 'mitoz' });
        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'tus-type-answer', token, type: 'submit', value: 'mayoz',
        }), token)).toEqual({ type: 'submit', value: 'mayoz' });

        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'tus-type-answer', token: 'wrong', type: 'change', value: 'x',
        }), token)).toBeNull();
        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'card-template', token, type: 'change', value: 'x',
        }), token)).toBeNull();
        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'tus-type-answer', token, type: 'change', value: 'x'.repeat(MAX_TYPE_ANSWER_CHARS + 1),
        }), token)).toBeNull();
        expect(parseTypeAnswerBridgeMessage('{broken', token)).toBeNull();
    });

    it('binds only the token-matched input and enables focus only when requested', () => {
        const passive = typeAnswerBridgeScript(token, false);
        const focused = typeAnswerBridgeScript(token, true);

        expect(passive).toContain('data-tus-type-answer-token');
        expect(passive).toContain(JSON.stringify(token));
        expect(passive).not.toContain('input.focus()');
        expect(focused).toContain('input.focus()');
        expect(focused).toContain(`slice(0,${MAX_TYPE_ANSWER_CHARS})`);
    });
});
