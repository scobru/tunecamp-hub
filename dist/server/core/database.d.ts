import type { Database as DatabaseType } from "better-sqlite3";
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
export declare function createDatabase(dbPath: string): DBService;
//# sourceMappingURL=database.d.ts.map