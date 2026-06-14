import { type Readable } from "stream";
import type { DBService } from "../../../src/server/core/database.js";
export interface GoogleDriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    parents?: string[];
}
export declare class GoogleDriveService {
    private db;
    private clientId;
    private clientSecret;
    private redirectUri;
    constructor(db: DBService, config?: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
    });
    isEnabled(): boolean;
    setRedirectUri(uri: string): void;
    getAuthUrl(userId: number): string;
    exchangeCode(code: string, userId: number): Promise<void>;
    getValidToken(userId: number): Promise<string>;
    listFiles(userId: number, folderId?: string): Promise<GoogleDriveFile[]>;
    listAudioFilesRecursive(userId: number, folderId?: string): Promise<GoogleDriveFile[]>;
    getFileStream(userId: number, fileId: string, range?: string): Promise<{
        stream: Readable;
        status: number;
        headers: any;
    }>;
}
//# sourceMappingURL=gdrive-stream.d.ts.map