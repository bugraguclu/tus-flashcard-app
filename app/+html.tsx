import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import { WEB_APP_DEVELOPMENT_CSP, WEB_APP_PRODUCTION_CSP } from '../lib/webAppContentSecurityPolicy';

export default function Root({ children }: { children: React.ReactNode }) {
    const csp = process.env.NODE_ENV === 'production' ? WEB_APP_PRODUCTION_CSP : WEB_APP_DEVELOPMENT_CSP;
    return (
        <html lang="tr">
            <head>
                <meta charSet="utf-8" />
                <meta httpEquiv="Content-Security-Policy" content={csp} />
                <meta name="referrer" content="no-referrer" />
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                <meta name="description" content="Aralıklı tekrarla çalışılan, çevrimdışı kullanılabilen TUS kartları." />
                {/* Installable like the iPhone app: home-screen icon, standalone window, theme bar. */}
                <link rel="manifest" href="/manifest.webmanifest" />
                <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-title" content="TusAnkiM" />
                <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                <meta name="theme-color" media="(prefers-color-scheme: light)" content="#e8f5f0" />
                <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
                <ScrollViewStyleReset />
            </head>
            <body>{children}</body>
        </html>
    );
}
