import type { DBService } from "../core/database.js";
export declare class StripeConnectService {
    private db;
    private stripe;
    private platformFeePct;
    constructor(db: DBService, secretKey?: string);
    isEnabled(): boolean;
    createOnboardingLink(artistId: number, publicUrl: string): Promise<string>;
    checkAccountStatus(artistId: number): Promise<boolean>;
    createCheckoutSession(params: {
        trackId?: number;
        albumId?: number;
        buyerEmail?: string;
        successUrl: string;
        cancelUrl: string;
    }): Promise<{
        id: string;
        url: string | null;
    }>;
}
//# sourceMappingURL=stripe-connect.d.ts.map