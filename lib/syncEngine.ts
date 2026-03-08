// ============================================================
// TUS Flashcard - Sync Engine
// USN-based delta sync protocol (Anki-compatible concept)
// ============================================================

import type { Note, AnkiCard, Deck, ReviewLog } from './models';

// ---- Sync Protocol Types ----

export interface SyncMeta {
    serverUsn: number;
    clientUsn: number;
    lastSyncAt: number;    // epoch ms
    serverUrl: string;
    authToken: string;
}

export interface SyncPayload {
    // Changes from client → server
    notes: Note[];
    cards: AnkiCard[];
    decks: Deck[];
    revlog: ReviewLog[];
    deletedNoteIds: number[];
    deletedCardIds: number[];
    deletedDeckIds: number[];
    clientUsn: number;
}

export interface SyncResponse {
    // Changes from server → client
    notes: Note[];
    cards: AnkiCard[];
    decks: Deck[];
    revlog: ReviewLog[];
    deletedNoteIds: number[];
    deletedCardIds: number[];
    deletedDeckIds: number[];
    newServerUsn: number;
    fullSyncRequired: boolean;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success' | 'full_sync_required';

export interface SyncResult {
    status: SyncStatus;
    notesPushed: number;
    notesPulled: number;
    cardsPushed: number;
    cardsPulled: number;
    reviewsPushed: number;
    error?: string;
    timestamp: number;
}

// ---- Sync Engine (Client-side) ----

export class SyncEngine {
    private meta: SyncMeta;
    private onStatusChange?: (status: SyncStatus) => void;

    constructor(meta: SyncMeta, onStatusChange?: (status: SyncStatus) => void) {
        this.meta = meta;
        this.onStatusChange = onStatusChange;
    }

    /** Perform incremental sync */
    async sync(): Promise<SyncResult> {
        this.onStatusChange?.('syncing');

        try {
            // 1. Gather local changes since last sync
            const payload = await this.gatherChanges();

            // 2. Send to server and receive changes
            const response = await this.sendToServer(payload);

            if (response.fullSyncRequired) {
                this.onStatusChange?.('full_sync_required');
                return {
                    status: 'full_sync_required',
                    notesPushed: 0, notesPulled: 0,
                    cardsPushed: 0, cardsPulled: 0,
                    reviewsPushed: 0,
                    error: 'Full sync required. Upload or download?',
                    timestamp: Date.now(),
                };
            }

            // 3. Apply server changes locally
            await this.applyChanges(response);

            // 4. Update sync meta
            this.meta.clientUsn = response.newServerUsn;
            this.meta.lastSyncAt = Date.now();

            this.onStatusChange?.('success');

            return {
                status: 'success',
                notesPushed: payload.notes.length,
                notesPulled: response.notes.length,
                cardsPushed: payload.cards.length,
                cardsPulled: response.cards.length,
                reviewsPushed: payload.revlog.length,
                timestamp: Date.now(),
            };
        } catch (error) {
            this.onStatusChange?.('error');
            return {
                status: 'error',
                notesPushed: 0, notesPulled: 0,
                cardsPushed: 0, cardsPulled: 0,
                reviewsPushed: 0,
                error: error instanceof Error ? error.message : 'Sync failed',
                timestamp: Date.now(),
            };
        }
    }

    /** Gather all local changes since last sync USN */
    private async gatherChanges(): Promise<SyncPayload> {
        // TODO: Implement actual DB queries for changed items
        // This is a stub showing the sync protocol structure
        return {
            notes: [],
            cards: [],
            decks: [],
            revlog: [],
            deletedNoteIds: [],
            deletedCardIds: [],
            deletedDeckIds: [],
            clientUsn: this.meta.clientUsn,
        };
    }

    /** Send payload to sync server */
    private async sendToServer(payload: SyncPayload): Promise<SyncResponse> {
        const response = await fetch(`${this.meta.serverUrl}/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.meta.authToken}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Sync server error: ${response.status}`);
        }

        return response.json();
    }

    /** Apply server changes to local database */
    private async applyChanges(response: SyncResponse): Promise<void> {
        // TODO: Apply incoming changes to local SQLite
        // - Merge notes (server wins on conflict)
        // - Merge cards
        // - Add review logs
        // - Apply deletions
        // - Handle deck conflicts
    }

    /** Full upload (replace server with local data) */
    async fullUpload(): Promise<SyncResult> {
        // TODO: Send entire database to server
        return {
            status: 'success',
            notesPushed: 0, notesPulled: 0,
            cardsPushed: 0, cardsPulled: 0,
            reviewsPushed: 0,
            timestamp: Date.now(),
        };
    }

    /** Full download (replace local with server data) */
    async fullDownload(): Promise<SyncResult> {
        // TODO: Download entire database from server
        return {
            status: 'success',
            notesPushed: 0, notesPulled: 0,
            cardsPushed: 0, cardsPulled: 0,
            reviewsPushed: 0,
            timestamp: Date.now(),
        };
    }
}

// ---- Media Sync ----

export interface MediaSyncEntry {
    filename: string;
    checksum: string;
    modified: number;
}

export class MediaSyncEngine {
    private serverUrl: string;
    private authToken: string;

    constructor(serverUrl: string, authToken: string) {
        this.serverUrl = serverUrl;
        this.authToken = authToken;
    }

    /** Get list of media files that need syncing */
    async getChangedMedia(): Promise<{ toUpload: string[]; toDownload: string[] }> {
        // TODO: Compare local media files with server manifest
        return { toUpload: [], toDownload: [] };
    }

    /** Upload a media file */
    async uploadMedia(filename: string, data: ArrayBuffer): Promise<void> {
        await fetch(`${this.serverUrl}/media/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
                'X-Filename': filename,
            },
            body: data,
        });
    }

    /** Download a media file */
    async downloadMedia(filename: string): Promise<ArrayBuffer> {
        const response = await fetch(`${this.serverUrl}/media/${filename}`, {
            headers: { 'Authorization': `Bearer ${this.authToken}` },
        });
        return response.arrayBuffer();
    }
}

// ---- .apkg Import/Export (Basic) ----

export interface ApkgData {
    notes: Note[];
    cards: AnkiCard[];
    revlog: ReviewLog[];
    decks: Deck[];
    noteTypes: any[];
    media: Record<string, string>; // filename → base64 data
}

/** Export collection data to a JSON format (simplified .apkg) */
export function exportToJson(data: ApkgData): string {
    return JSON.stringify({
        version: 2,
        format: 'tus-anki-export',
        exportDate: new Date().toISOString(),
        ...data,
    });
}

/** Import from JSON format */
export function importFromJson(json: string): ApkgData | null {
    try {
        const data = JSON.parse(json);
        if (!data.format || data.format !== 'tus-anki-export') {
            console.warn('Unknown import format');
        }
        return {
            notes: data.notes || [],
            cards: data.cards || [],
            revlog: data.revlog || [],
            decks: data.decks || [],
            noteTypes: data.noteTypes || [],
            media: data.media || {},
        };
    } catch {
        return null;
    }
}
