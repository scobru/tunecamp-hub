import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import fs from "fs-extra";
import path from "path";

export interface DBService {
    db: DatabaseType;
    getArtistBySlug(slug: string): any;
    getArtistById(id: number): any;
    getArtistByOwnerId(ownerId: number): any;
    createArtist(name: string, slug: string, ownerId: number): number;
    updateStripeConnect(artistId: number, connectId: string, completed: number): void;
    
    createUser(username: string, passwordHash: string, role: string): number;
    getUserByUsername(username: string): any;
    getUserById(id: number): any;
    updateUserArtistId(userId: number, artistId: number): void;

    createAlbum(title: string, slug: string, artistId: number, ownerId: number, price: number, currency: string): number;
    getAlbumsByArtist(artistId: number): any[];
    getAllAlbums(): any[];
    getAlbumBySlug(slug: string): any;
    getAlbumById(id: number): any;
    
    createTrack(title: string, albumId: number, artistId: number, ownerId: number, filePath: string, duration: number, fileSize: number, mimeType: string, price: number, currency: string): number;
    getTracksByAlbum(albumId: number): any[];
    getTrackById(id: number): any;
    
    getStorageAccount(userId: number, provider: string): any;
    upsertStorageAccount(userId: number, provider: string, email: string, accessToken: string, refreshToken: string, expiryDate: number): void;
    
    createUnlockCode(code: string, releaseId?: number, trackId?: number): void;
    getUnlockCode(code: string): any;
    useUnlockCode(code: string): void;
}

export function createDatabase(dbPath: string): DBService {
    // Ensure parent dir exists
    fs.ensureDirSync(path.dirname(dbPath));
    const db = new Database(dbPath);
    
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = NORMAL");

    // Initialize multi-tenant tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS artists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            bio TEXT,
            photo_path TEXT,
            links TEXT,
            wallet_address TEXT,
            stripe_connect_id TEXT DEFAULT NULL,
            stripe_onboarding_completed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
            role TEXT NOT NULL DEFAULT 'user', -- 'admin' (central), 'artist', 'user' (listener)
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
            owner_id INTEGER REFERENCES admin(id) ON DELETE CASCADE,
            date TEXT,
            cover_path TEXT,
            genre TEXT,
            description TEXT,
            price REAL DEFAULT 0,
            currency TEXT DEFAULT 'USD',
            status TEXT DEFAULT 'draft', -- 'draft', 'published'
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
            artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
            owner_id INTEGER REFERENCES admin(id) ON DELETE CASCADE,
            track_num INTEGER,
            duration REAL,
            file_path TEXT, -- gdrive://{fileId} or local
            mime_type TEXT DEFAULT 'audio/mpeg',
            file_size INTEGER DEFAULT 0,
            price REAL DEFAULT 0,
            currency TEXT DEFAULT 'USD',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS storage_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES admin(id) ON DELETE CASCADE,
            provider TEXT NOT NULL,
            account_email TEXT,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            expiry_date INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, provider)
        );

        CREATE TABLE IF NOT EXISTS unlock_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            release_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
            track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
            is_used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            redeemed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_artists_slug ON artists(slug);
        CREATE INDEX IF NOT EXISTS idx_admin_username ON admin(username);
        CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
    `);

    return {
        db,
        
        getArtistBySlug(slug: string) {
            return db.prepare("SELECT * FROM artists WHERE slug = ?").get(slug);
        },
        
        getArtistById(id: number) {
            return db.prepare("SELECT * FROM artists WHERE id = ?").get(id);
        },

        getArtistByOwnerId(ownerId: number) {
            return db.prepare(`
                SELECT a.* FROM artists a
                JOIN admin u ON u.artist_id = a.id
                WHERE u.id = ?
            `).get(ownerId);
        },

        createArtist(name: string, slug: string, ownerId: number) {
            return db.transaction(() => {
                const info = db.prepare("INSERT INTO artists (name, slug) VALUES (?, ?)")
                    .run(name, slug);
                const artistId = info.lastInsertRowid as number;
                db.prepare("UPDATE admin SET artist_id = ?, role = 'artist' WHERE id = ?")
                    .run(artistId, ownerId);
                return artistId;
            })();
        },

        updateStripeConnect(artistId: number, connectId: string, completed: number) {
            db.prepare("UPDATE artists SET stripe_connect_id = ?, stripe_onboarding_completed = ? WHERE id = ?")
                .run(connectId, completed, artistId);
        },

        createUser(username: string, passwordHash: string, role: string) {
            const info = db.prepare("INSERT INTO admin (username, password_hash, role) VALUES (?, ?, ?)")
                .run(username, passwordHash, role);
            return info.lastInsertRowid as number;
        },

        getUserByUsername(username: string) {
            return db.prepare("SELECT * FROM admin WHERE username = ?").get(username);
        },

        getUserById(id: number) {
            return db.prepare("SELECT * FROM admin WHERE id = ?").get(id);
        },

        updateUserArtistId(userId: number, artistId: number) {
            db.prepare("UPDATE admin SET artist_id = ?, role = 'artist' WHERE id = ?")
                .run(artistId, userId);
        },

        createAlbum(title: string, slug: string, artistId: number, ownerId: number, price: number, currency: string) {
            const info = db.prepare(`
                INSERT INTO albums (title, slug, artist_id, owner_id, price, currency)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(title, slug, artistId, ownerId, price, currency);
            return info.lastInsertRowid as number;
        },

        getAlbumsByArtist(artistId: number) {
            return db.prepare("SELECT * FROM albums WHERE artist_id = ?").all(artistId);
        },

        getAllAlbums() {
            return db.prepare(`
                SELECT a.*, art.name as artist_name, art.slug as artist_slug
                FROM albums a
                JOIN artists art ON art.id = a.artist_id
            `).all();
        },

        getAlbumBySlug(slug: string) {
            return db.prepare("SELECT * FROM albums WHERE slug = ?").get(slug);
        },

        getAlbumById(id: number) {
            return db.prepare("SELECT * FROM albums WHERE id = ?").get(id);
        },

        createTrack(title: string, albumId: number, artistId: number, ownerId: number, filePath: string, duration: number, fileSize: number, mimeType: string, price: number, currency: string) {
            // Get current track count in album for track_num
            const countRow = db.prepare("SELECT COUNT(*) as cnt FROM tracks WHERE album_id = ?").get(albumId) as { cnt: number };
            const trackNum = countRow.cnt + 1;
            
            const info = db.prepare(`
                INSERT INTO tracks (title, album_id, artist_id, owner_id, track_num, duration, file_path, mime_type, file_size, price, currency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(title, albumId, artistId, ownerId, trackNum, duration, filePath, mimeType, fileSize, price, currency);
            return info.lastInsertRowid as number;
        },

        getTracksByAlbum(albumId: number) {
            return db.prepare("SELECT * FROM tracks WHERE album_id = ? ORDER BY track_num ASC").all(albumId);
        },

        getTrackById(id: number) {
            return db.prepare("SELECT * FROM tracks WHERE id = ?").get(id);
        },

        getStorageAccount(userId: number, provider: string) {
            return db.prepare("SELECT * FROM storage_accounts WHERE user_id = ? AND provider = ?").get(userId, provider);
        },

        upsertStorageAccount(userId: number, provider: string, email: string, accessToken: string, refreshToken: string, expiryDate: number) {
            db.prepare(`
                INSERT INTO storage_accounts (user_id, provider, account_email, access_token, refresh_token, expiry_date)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, provider) DO UPDATE SET
                    account_email = excluded.account_email,
                    access_token = excluded.access_token,
                    refresh_token = excluded.refresh_token,
                    expiry_date = excluded.expiry_date
            `).run(userId, provider, email, accessToken, refreshToken, expiryDate);
        },

        createUnlockCode(code: string, releaseId?: number, trackId?: number) {
            db.prepare("INSERT INTO unlock_codes (code, release_id, track_id) VALUES (?, ?, ?)")
                .run(code, releaseId || null, trackId || null);
        },

        getUnlockCode(code: string) {
            return db.prepare("SELECT * FROM unlock_codes WHERE code = ?").get(code);
        },

        useUnlockCode(code: string) {
            db.prepare("UPDATE unlock_codes SET is_used = 1, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?")
                .run(code);
        }
    };
}
