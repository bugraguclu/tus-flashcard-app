import { isOptionLetter, type OptionLetter } from './pastExamPack';

/**
 * The reviewer's bridge to a "TUS Sorusu" card (lib/tusQuestionCard.ts): a tap on an option
 * answers the question, a double tap or a long press strikes the option out, and repeating either
 * brings it back — the gestures TUSBuddy's question reader uses.
 *
 * Card content cannot run script (lib/cardContentSecurity.ts), so this is trusted reviewer code.
 * One source serves both platforms: iOS injects it into the card's WebView, and on web the
 * reviewer runs it against the card iframe's document, which is same-origin but script-free.
 */

const MESSAGE_SOURCE = 'tus-question';

/** Longer than a deliberate double tap, short enough that a single tap still feels immediate. */
export const TUS_QUESTION_DOUBLE_TAP_MS = 280;
export const TUS_QUESTION_LONG_PRESS_MS = 500;

/** Accept a choice only from the bridge bound by this card view. */
export function parseTusQuestionMessage(raw: unknown, expectedToken: string): OptionLetter | null {
    if (typeof raw !== 'string' || raw.length > 512) return null;
    try {
        const message = JSON.parse(raw) as Record<string, unknown>;
        if (message.source !== MESSAGE_SOURCE || message.token !== expectedToken || message.type !== 'choose') return null;
        return isOptionLetter(message.letter) ? message.letter : null;
    } catch {
        return null;
    }
}

/**
 * The binder, as the body of a function of `document` and `window`. It posts the chosen letter
 * through `window.ReactNativeWebView.postMessage`, which on web is a stand-in the reviewer passes.
 * Written in ES5 for the oldest WebView the app supports.
 */
export function tusQuestionBinderSource(token: string): string {
    return `
        var token = ${JSON.stringify(token)};
        var root = document.querySelector('.tusq');
        if (!root || root.classList.contains('tusq-revealed') || root.getAttribute('data-tusq-bound') === '1') return;
        root.setAttribute('data-tusq-bound', '1');
        var DOUBLE_TAP_MS = ${TUS_QUESTION_DOUBLE_TAP_MS};
        var LONG_PRESS_MS = ${TUS_QUESTION_LONG_PRESS_MS};
        var MOVE_TOLERANCE = 10;
        var locked = false;
        var pendingTap = null;
        var press = null;
        var ignoreClicksUntil = 0;

        function post(letter) {
            var bridge = window.ReactNativeWebView;
            if (bridge) bridge.postMessage(JSON.stringify({ source: '${MESSAGE_SOURCE}', token: token, type: 'choose', letter: letter }));
        }
        function eliminate(option) {
            if (locked) return;
            var eliminated = !option.classList.contains('tusq-eliminated');
            if (eliminated) option.classList.add('tusq-eliminated');
            else option.classList.remove('tusq-eliminated');
            option.setAttribute('aria-disabled', eliminated ? 'true' : 'false');
        }
        function choose(option) {
            if (locked || option.classList.contains('tusq-eliminated')) return;
            locked = true;
            option.classList.add('tusq-picked');
            post(option.getAttribute('data-letter'));
        }
        function cancelPress() {
            if (press) clearTimeout(press.timer);
            press = null;
        }
        function startPress(option, point) {
            cancelPress();
            if (locked || !point) return;
            var current = { option: option, x: point.clientX, y: point.clientY, timer: 0 };
            current.timer = setTimeout(function () {
                if (press !== current) return;
                press = null;
                // The finger is still down: the click it lifts into must not count as a tap.
                ignoreClicksUntil = Date.now() + 800;
                eliminate(option);
            }, LONG_PRESS_MS);
            press = current;
        }
        function movePress(point) {
            if (!press || !point) return;
            if (Math.abs(point.clientX - press.x) > MOVE_TOLERANCE || Math.abs(point.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
        }
        function tap(option) {
            if (locked || Date.now() < ignoreClicksUntil) return;
            if (pendingTap && pendingTap.option === option) {
                clearTimeout(pendingTap.timer);
                pendingTap = null;
                eliminate(option);
                return;
            }
            if (pendingTap) clearTimeout(pendingTap.timer);
            var current = { option: option, timer: 0 };
            current.timer = setTimeout(function () {
                if (pendingTap !== current) return;
                pendingTap = null;
                choose(option);
            }, DOUBLE_TAP_MS);
            pendingTap = current;
        }
        function bind(option) {
            option.addEventListener('touchstart', function (event) { startPress(option, event.touches && event.touches[0]); }, { passive: true });
            option.addEventListener('touchmove', function (event) { movePress(event.touches && event.touches[0]); }, { passive: true });
            option.addEventListener('touchend', cancelPress);
            option.addEventListener('touchcancel', cancelPress);
            option.addEventListener('mousedown', function (event) { if (event.button === 0) startPress(option, event); });
            option.addEventListener('mousemove', function (event) { movePress(event); });
            option.addEventListener('mouseup', cancelPress);
            option.addEventListener('mouseleave', cancelPress);
            option.addEventListener('contextmenu', function (event) { event.preventDefault(); });
            option.addEventListener('click', function (event) {
                event.preventDefault();
                tap(option);
            });
        }
        var options = root.querySelectorAll('.tusq-option[data-letter]');
        for (var index = 0; index < options.length; index++) bind(options[index]);
    `;
}

/** iOS: the script injected into the card's WebView. */
export function tusQuestionBridgeScript(token: string): string {
    return `(function(document, window){${tusQuestionBinderSource(token)}})(document, window);true;`;
}

/**
 * Web: bind the card iframe's options from the reviewer's own page. The binder is the same source
 * the native WebView runs, compiled here because the sandboxed iframe runs no script of its own.
 */
export function bindTusQuestionDocument(doc: Document, token: string, onMessage: (raw: string) => void): void {
    // eslint-disable-next-line no-new-func
    const binder = new Function('document', 'window', tusQuestionBinderSource(token)) as (
        document: Document,
        window: { ReactNativeWebView: { postMessage: (data: string) => void } },
    ) => void;
    binder(doc, { ReactNativeWebView: { postMessage: onMessage } });
}
