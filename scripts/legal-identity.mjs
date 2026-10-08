export const legalIdentityPlaceholders = [
    /\[YAYINCI YASAL ADI\]/,
    /\[LEGAL PUBLISHER NAME\]/,
    /\[AÇIK ADRES\]/,
    /\[ADDRESS\]/,
    /\[E-POSTA\]/,
    /\[EMAIL\]/,
    /\[APP STORE CONNECT HESAP SAHİBİNİN YASAL ADI\]/,
];

export function hasLegalIdentityPlaceholders(text) {
    return legalIdentityPlaceholders.some((pattern) => pattern.test(text));
}
