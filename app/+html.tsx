import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import { FIELD_ROW_FOCUS_CSS } from '../lib/fieldRowFocus';
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
                {/* What a chat app or social site shows for a shared link; `og:title` comes per page from PageTitle. */}
                <meta property="og:site_name" content="TusAnkiM" />
                <meta property="og:type" content="website" />
                <meta property="og:description" content="Aralıklı tekrarla çalışılan, çevrimdışı kullanılabilen TUS kartları." />
                <meta property="og:image" content="/icons/icon-512.png" />
                <meta name="twitter:card" content="summary" />
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
                {/* A field drawn as a row wears its focus ring on the row, not inside it. */}
                <style dangerouslySetInnerHTML={{ __html: FIELD_ROW_FOCUS_CSS }} />
            </head>
            <body>{children}</body>
        </html>
    );
}
