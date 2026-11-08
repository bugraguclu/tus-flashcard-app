import { randomBytes } from 'node:crypto';
import { connect as connectPlain, isIP } from 'node:net';
import type { Socket } from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import { clearTimeout, setTimeout } from 'node:timers';
import { connect as connectTls } from 'node:tls';
import type { ConnectionOptions, TLSSocket } from 'node:tls';

/*
 * Just enough SMTP to hand one message to a relay: implicit TLS or STARTTLS, AUTH PLAIN or LOGIN,
 * one recipient, a text + HTML message. Each message opens its own connection; code mail is rare
 * enough that pooling would only add failure modes.
 */

export interface SmtpOptions {
    host: string;
    port: number;
    user?: string;
    password?: string;
    startTls: boolean;
    implicitTls: boolean;
    clientName: string;
    timeoutMs?: number;
    /** Extra TLS settings (a private CA, for instance). */
    tls?: ConnectionOptions;
}

export interface MailMessage {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
}

export class SmtpError extends Error {
    readonly replyCode: number | null;

    constructor(message: string, replyCode: number | null = null) {
        super(message);
        this.name = 'SmtpError';
        this.replyCode = replyCode;
    }
}

interface Reply {
    code: number;
    lines: string[];
}

/** Splits the byte stream into SMTP replies, joining `250-` continuation lines. */
class ReplyReader {
    private socket: Socket;
    private decoder = new StringDecoder('utf8');
    private buffer = '';
    private pending: string[] = [];
    private readonly replies: Reply[] = [];
    private readonly waiting: Array<{ resolve: (reply: Reply) => void; reject: (error: Error) => void }> = [];
    private failure: Error | null = null;

    private readonly onData = (chunk: Buffer | string) => {
        this.push(typeof chunk === 'string' ? chunk : this.decoder.write(chunk));
    };
    private readonly onError = (error: Error) => this.fail(error);
    private readonly onClose = () => this.fail(new SmtpError('The mail server closed the connection'));

    constructor(socket: Socket) {
        this.socket = socket;
        this.attach(socket);
    }

    attach(socket: Socket): void {
        this.socket = socket;
        this.decoder = new StringDecoder('utf8');
        socket.on('data', this.onData);
        socket.on('error', this.onError);
        socket.on('close', this.onClose);
    }

    /** Stops listening so the socket can be handed to TLS. */
    detach(): void {
        this.socket.off('data', this.onData);
        this.socket.off('error', this.onError);
        this.socket.off('close', this.onClose);
    }

    read(): Promise<Reply> {
        const reply = this.replies.shift();
        if (reply) return Promise.resolve(reply);
        if (this.failure) return Promise.reject(this.failure);
        return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
    }

    fail(error: Error): void {
        this.failure ??= error;
        for (const waiter of this.waiting.splice(0)) waiter.reject(this.failure);
    }

    private push(text: string): void {
        this.buffer += text;
        let newline = this.buffer.indexOf('\n');
        while (newline >= 0) {
            const line = this.buffer.slice(0, newline).replace(/\r$/, '');
            this.buffer = this.buffer.slice(newline + 1);
            this.pending.push(line);
            if (!/^\d{3}-/.test(line)) {
                const code = Number(line.slice(0, 3));
                const reply = { code: Number.isInteger(code) ? code : 0, lines: this.pending.map((entry) => entry.slice(4)) };
                this.pending = [];
                const waiter = this.waiting.shift();
                if (waiter) waiter.resolve(reply);
                else this.replies.push(reply);
            }
            newline = this.buffer.indexOf('\n');
        }
        if (this.buffer.length > 64 * 1024) this.fail(new SmtpError('The mail server sent an overlong reply'));
    }
}

/** `TusAnkiM <no-reply@example.com>` or a bare address. */
export function parseAddress(value: string): { name: string; address: string } {
    const trimmed = value.trim();
    const named = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(trimmed);
    if (named) return { name: named[1].trim().replace(/^"(.*)"$/, '$1'), address: named[2] };
    if (/^[^<>\s]+@[^<>\s]+$/.test(trimmed)) return { name: '', address: trimmed };
    throw new SmtpError(`Not an e-mail address: ${trimmed.slice(0, 80)}`);
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/** RFC 2047 encoded words, folded so no word passes 75 characters. */
function encodeHeader(value: string): string {
    if (PRINTABLE_ASCII.test(value)) return value;
    const words: string[] = [];
    let chunk = '';
    for (const character of value) {
        if (Buffer.byteLength(chunk + character, 'utf8') > 45) {
            words.push(chunk);
            chunk = '';
        }
        chunk += character;
    }
    if (chunk) words.push(chunk);
    return words.map((word) => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`).join('\r\n ');
}

function formatAddress(address: { name: string; address: string }): string {
    if (!address.name) return address.address;
    const name = PRINTABLE_ASCII.test(address.name)
        ? `"${address.name.replace(/["\\]/g, '\\$&')}"`
        : encodeHeader(address.name);
    return `${name} <${address.address}>`;
}

function base64Lines(body: string): string {
    return Buffer.from(body, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
}

/** The message as sent after DATA, without the terminating dot. */
export function buildMessage(
    message: MailMessage,
    extras: { date?: Date; boundary?: string; messageId?: string } = {},
): string {
    for (const header of [message.from, message.to, message.subject]) {
        if (/[\r\n]/.test(header)) throw new SmtpError('Mail headers must be single lines');
    }
    const from = parseAddress(message.from);
    const to = parseAddress(message.to);
    const boundary = extras.boundary ?? `tusankim-${randomBytes(12).toString('hex')}`;
    const messageId = extras.messageId ?? `<${randomBytes(16).toString('hex')}@${from.address.split('@')[1]}>`;
    const part = (type: string, body: string) => [
        `--${boundary}`,
        `Content-Type: ${type}; charset=UTF-8`,
        'Content-Transfer-Encoding: base64',
        '',
        base64Lines(body),
    ].join('\r\n');
    return [
        `From: ${formatAddress(from)}`,
        `To: ${formatAddress(to)}`,
        `Subject: ${encodeHeader(message.subject)}`,
        `Date: ${(extras.date ?? new Date()).toUTCString().replace(/GMT$/, '+0000')}`,
        `Message-ID: ${messageId}`,
        'MIME-Version: 1.0',
        'Auto-Submitted: auto-generated',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        part('text/plain', message.text),
        part('text/html', message.html),
        `--${boundary}--`,
    ].join('\r\n');
}

/** A line that starts with a dot gets a second one, so it cannot end the message early. */
function dotStuff(payload: string): string {
    return payload.replace(/(^|\r\n)\./g, '$1..');
}

function serverName(host: string): string | undefined {
    return isIP(host) ? undefined : host;
}

function open(options: SmtpOptions): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket: Socket = options.implicitTls
            ? connectTls({ host: options.host, port: options.port, servername: serverName(options.host), ...options.tls })
            : connectPlain({ host: options.host, port: options.port });
        const onError = (error: Error) => {
            socket.destroy();
            reject(error);
        };
        socket.once('error', onError);
        socket.once(options.implicitTls ? 'secureConnect' : 'connect', () => {
            socket.off('error', onError);
            resolve(socket);
        });
    });
}

function upgrade(socket: Socket, options: SmtpOptions): Promise<TLSSocket> {
    return new Promise((resolve, reject) => {
        const secure = connectTls({ socket, servername: serverName(options.host), ...options.tls });
        const onError = (error: Error) => reject(error);
        secure.once('error', onError);
        secure.once('secureConnect', () => {
            secure.off('error', onError);
            resolve(secure);
        });
    });
}

async function expectReply(reader: ReplyReader, accepted: number[], label: string): Promise<Reply> {
    const reply = await reader.read();
    if (!accepted.includes(reply.code)) {
        throw new SmtpError(`The mail server refused ${label}: ${reply.code} ${reply.lines.join(' ').slice(0, 200)}`, reply.code);
    }
    return reply;
}

/** Sends one command. `label` names it in errors, so credentials never reach a log. */
function command(socket: Socket, reader: ReplyReader, line: string, accepted: number[], label = line): Promise<Reply> {
    socket.write(`${line}\r\n`);
    return expectReply(reader, accepted, label);
}

async function hello(socket: Socket, reader: ReplyReader, clientName: string): Promise<string[]> {
    const reply = await command(socket, reader, `EHLO ${clientName}`, [250], 'EHLO');
    // The first line is the server's greeting; the rest name its extensions.
    return reply.lines.slice(1).map((line) => line.toUpperCase());
}

function authMechanisms(extensions: string[]): Set<string> {
    const line = extensions.find((entry) => entry.startsWith('AUTH ') || entry.startsWith('AUTH='));
    return new Set(line ? line.slice(5).split(/\s+/).filter(Boolean) : []);
}

async function authenticate(socket: Socket, reader: ReplyReader, options: SmtpOptions, extensions: string[]): Promise<void> {
    const user = options.user ?? '';
    const password = options.password ?? '';
    const mechanisms = authMechanisms(extensions);
    if (mechanisms.has('PLAIN') || !mechanisms.has('LOGIN')) {
        const credentials = Buffer.from(`\u0000${user}\u0000${password}`, 'utf8').toString('base64');
        await command(socket, reader, `AUTH PLAIN ${credentials}`, [235], 'AUTH PLAIN');
        return;
    }
    await command(socket, reader, 'AUTH LOGIN', [334]);
    await command(socket, reader, Buffer.from(user, 'utf8').toString('base64'), [334], 'the user name');
    await command(socket, reader, Buffer.from(password, 'utf8').toString('base64'), [235], 'the password');
}

async function converse(options: SmtpOptions, message: MailMessage, active: { socket: Socket | null }): Promise<void> {
    const sender = parseAddress(message.from).address;
    const recipient = parseAddress(message.to).address;
    const payload = buildMessage(message);

    let socket = await open(options);
    active.socket = socket;
    const reader = new ReplyReader(socket);
    await expectReply(reader, [220], 'the connection');
    let extensions = await hello(socket, reader, options.clientName);

    if (options.startTls && !options.implicitTls) {
        if (!extensions.includes('STARTTLS')) {
            throw new SmtpError('The mail server does not offer STARTTLS (set EMAIL_USE_TLS=0 only for a trusted local relay)');
        }
        await command(socket, reader, 'STARTTLS', [220]);
        reader.detach();
        socket = await upgrade(socket, options);
        active.socket = socket;
        reader.attach(socket);
        extensions = await hello(socket, reader, options.clientName);
    }

    if (options.user) await authenticate(socket, reader, options, extensions);
    await command(socket, reader, `MAIL FROM:<${sender}>`, [250]);
    await command(socket, reader, `RCPT TO:<${recipient}>`, [250, 251]);
    await command(socket, reader, 'DATA', [354]);
    await command(socket, reader, `${dotStuff(payload)}\r\n.`, [250], 'the message');
    socket.write('QUIT\r\n');
    await reader.read().catch(() => undefined);
}

/** Delivers one message to the relay, or rejects with an `SmtpError` / socket error. */
export async function sendSmtp(options: SmtpOptions, message: MailMessage): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 20_000;
    const active: { socket: Socket | null } = { socket: null };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            active.socket?.destroy();
            reject(new SmtpError(`The mail server did not finish within ${timeoutMs} ms`));
        }, timeoutMs);
    });
    try {
        await Promise.race([converse(options, message, active), deadline]);
    } finally {
        if (timer) clearTimeout(timer);
        active.socket?.destroy();
    }
}
