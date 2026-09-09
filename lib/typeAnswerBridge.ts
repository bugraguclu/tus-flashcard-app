export const MAX_TYPE_ANSWER_CHARS = 4096;

const MESSAGE_SOURCE = 'tus-type-answer';

export type TypeAnswerBridgeMessage =
    | { type: 'change'; value: string }
    | { type: 'submit'; value: string };

/**
 * Accept only messages from the one input instance created by the reviewer. Imported card HTML
 * cannot run scripts, but the token check also prevents a colliding element id from impersonating
 * the input if a shared template happens to contain its own #typeans element.
 */
export function parseTypeAnswerBridgeMessage(
    raw: unknown,
    expectedToken: string,
): TypeAnswerBridgeMessage | null {
    if (typeof raw !== 'string' || raw.length > MAX_TYPE_ANSWER_CHARS + 512) return null;

    try {
        const message = JSON.parse(raw) as Record<string, unknown>;
        if (message.source !== MESSAGE_SOURCE || message.token !== expectedToken) return null;
        if (message.type !== 'change' && message.type !== 'submit') return null;
        if (typeof message.value !== 'string' || message.value.length > MAX_TYPE_ANSWER_CHARS) return null;
        return { type: message.type, value: message.value };
    } catch {
        return null;
    }
}

/** Trusted reviewer bridge. Card-authored scripts remain stripped and blocked by CSP. */
export function typeAnswerBridgeScript(token: string, autoFocus: boolean): string {
    const tokenLiteral = JSON.stringify(token);
    const max = MAX_TYPE_ANSWER_CHARS;
    return `(function(){
        var token=${tokenLiteral};
        var candidates=document.querySelectorAll('input[data-tus-type-answer-token]');
        var input=null;
        for(var i=0;i<candidates.length;i++){
            if(candidates[i].getAttribute('data-tus-type-answer-token')===token){input=candidates[i];break;}
        }
        if(!input)return;
        function value(){
            var next=String(input.value||'').slice(0,${max});
            if(input.value!==next)input.value=next;
            return next;
        }
        function post(type){
            if(!window.ReactNativeWebView)return;
            window.ReactNativeWebView.postMessage(JSON.stringify({source:'${MESSAGE_SOURCE}',token:token,type:type,value:value()}));
        }
        if(input.getAttribute('data-tus-type-answer-bound')!=='1'){
            input.setAttribute('data-tus-type-answer-bound','1');
            input.addEventListener('input',function(){post('change');});
            input.addEventListener('keydown',function(event){
                if(event.key!=='Enter')return;
                event.preventDefault();
                post('submit');
            });
        }
        ${autoFocus ? "setTimeout(function(){input.focus();},50);" : ''}
    })();
    true;`;
}
