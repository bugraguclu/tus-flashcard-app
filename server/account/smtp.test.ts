import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { SmtpError, sendSmtp } from './smtp.ts';
import { codeMail } from './mailer.ts';

/*
 * A plain-text SMTP relay that answers like a real one and remembers the conversation, so the
 * client's commands, credentials and the message it builds can be read back exactly.
 */
interface Relay {
    port: number;
    commands: string[];
    messages: string[];
}

const servers: Server[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

function startRelay(options: { extensions?: string[]; rejectRecipient?: boolean } = {}): Promise<Relay> {
    const relay: Relay = { port: 0, commands: [], messages: [] };
    const extensions = options.extensions ?? ['AUTH PLAIN LOGIN', '8BITMIME'];
    const server = createServer((socket: Socket) => {
        let buffer = '';
        let inData = false;
        socket.write('220 relay.test ESMTP ready\r\n');
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            while (true) {
                if (inData) {
                    const end = buffer.indexOf('\r\n.\r\n');
                    if (end < 0) return;
                    relay.messages.push(buffer.slice(0, end));
                    buffer = buffer.slice(end + 5);
                    inData = false;
                    socket.write('250 2.0.0 queued\r\n');
                    continue;
                }
                const lineEnd = buffer.indexOf('\r\n');
                if (lineEnd < 0) return;
                const line = buffer.slice(0, lineEnd);
                buffer = buffer.slice(lineEnd + 2);
                relay.commands.push(line);
                const verb = line.split(' ')[0].toUpperCase();
                if (verb === 'EHLO') {
                    const lines = ['relay.test greets you', ...extensions];
                    socket.write(lines.map((entry, index) => `250${index === lines.length - 1 ? ' ' : '-'}${entry}`).join('\r\n') + '\r\n');
                } else if (verb === 'AUTH') socket.write('235 2.7.0 authenticated\r\n');
                else if (verb === 'MAIL') socket.write('250 2.1.0 sender ok\r\n');
                else if (verb === 'RCPT') socket.write(options.rejectRecipient ? '550 5.1.1 no such user\r\n' : '250 2.1.5 recipient ok\r\n');
                else if (verb === 'DATA') {
                    inData = true;
                    socket.write('354 end with <CRLF>.<CRLF>\r\n');
                } else if (verb === 'QUIT') {
                    socket.end('221 2.0.0 bye\r\n');
                } else socket.write('500 unknown\r\n');
            }
        });
        socket.on('error', () => undefined);
    });
    servers.push(server);
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            relay.port = (server.address() as { port: number }).port;
            resolve(relay);
        });
    });
}

function decodePart(message: string, type: string): string {
    const start = message.indexOf(`Content-Type: ${type}; charset=UTF-8`);
    expect(start).toBeGreaterThan(-1);
    const body = message.slice(message.indexOf('\r\n\r\n', start) + 4).split('\r\n--')[0];
    return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8');
}

describe('SMTP delivery', () => {
    it('authenticates, addresses and delivers a Turkish text + HTML message', async () => {
        const relay = await startRelay();
        const mail = codeMail({ purpose: 'reset', code: '482913', name: 'Ayşe Yılmaz', locale: 'tr' });
        await sendSmtp(
            { host: '127.0.0.1', port: relay.port, user: 'posta@tusankim.app', password: 'şifre-1', startTls: false, implicitTls: false, clientName: 'tusankim-test', timeoutMs: 5000 },
            { from: 'TusAnkiM <posta@tusankim.app>', to: 'ayse@example.com', ...mail },
        );

        expect(relay.commands[0]).toBe('EHLO tusankim-test');
        const auth = relay.commands.find((line) => line.startsWith('AUTH PLAIN '));
        expect(Buffer.from(auth!.slice('AUTH PLAIN '.length), 'base64').toString('utf8')).toBe('\u0000posta@tusankim.app\u0000şifre-1');
        expect(relay.commands).toContain('MAIL FROM:<posta@tusankim.app>');
        expect(relay.commands).toContain('RCPT TO:<ayse@example.com>');
        expect(relay.commands.at(-1)).toBe('QUIT');

        const [message] = relay.messages;
        const subject = /^Subject: =\?UTF-8\?B\?([^?]+)\?=/m.exec(message)?.[1];
        expect(Buffer.from(subject!, 'base64').toString('utf8')).toBe('482913 · TusAnkiM şifre yenileme kodunuz');
        expect(message).toMatch(/^Message-ID: <[0-9a-f]+@tusankim\.app>$/m);
        expect(decodePart(message, 'text/plain')).toContain('482 913');
        expect(decodePart(message, 'text/plain')).toContain('Merhaba Ayşe Yılmaz,');
        expect(decodePart(message, 'text/html')).toContain('Şifrenizi yenileyin');
    });

    it('escapes the learner’s name in the HTML part', () => {
        const mail = codeMail({ purpose: 'verify', code: '123456', name: '<b>Ali</b>', locale: 'en' });
        expect(mail.html).toContain('Hi &lt;b&gt;Ali&lt;/b&gt;,');
        expect(mail.html).not.toContain('<b>Ali</b>');
        expect(mail.subject).toBe('123456 · your TusAnkiM verification code');
    });

    it('reports a refused recipient with the relay’s reply code', async () => {
        const relay = await startRelay({ rejectRecipient: true });
        const sending = sendSmtp(
            { host: '127.0.0.1', port: relay.port, startTls: false, implicitTls: false, clientName: 'tusankim-test', timeoutMs: 5000 },
            { from: 'posta@tusankim.app', to: 'nobody@example.com', subject: 'x', text: 'x', html: '<p>x</p>' },
        );
        await expect(sending).rejects.toBeInstanceOf(SmtpError);
        await expect(sending).rejects.toMatchObject({ replyCode: 550 });
    });

    it('refuses to send in the clear when STARTTLS was asked for but not offered', async () => {
        const relay = await startRelay({ extensions: ['AUTH PLAIN'] });
        await expect(sendSmtp(
            { host: '127.0.0.1', port: relay.port, user: 'u', password: 'p', startTls: true, implicitTls: false, clientName: 'tusankim-test', timeoutMs: 5000 },
            { from: 'posta@tusankim.app', to: 'a@example.com', subject: 'x', text: 'x', html: '<p>x</p>' },
        )).rejects.toThrow(/STARTTLS/);
        // The password never left the client.
        expect(relay.commands.some((line) => line.startsWith('AUTH'))).toBe(false);
    });

    it('refuses header injection through the subject', async () => {
        await expect(sendSmtp(
            { host: '127.0.0.1', port: 9, startTls: false, implicitTls: false, clientName: 'x', timeoutMs: 1000 },
            { from: 'a@example.com', to: 'b@example.com', subject: 'hi\r\nBcc: victim@example.com', text: 'x', html: 'x' },
        )).rejects.toThrow(/single lines/);
    });
});
