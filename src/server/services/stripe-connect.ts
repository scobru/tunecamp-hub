import Stripe from "stripe";
import type { DBService } from "../core/database.js";
import dotenv from "dotenv"
dotenv.config()

export class StripeConnectService {
    private stripe: InstanceType<typeof Stripe> | null = null;
    private platformFeePct = 0.10; // 10% platform fee

    constructor(private db: DBService, secretKey?: string) {
        const key = secretKey || process.env.STRIPE_SECRET_KEY;
        if (key) {
            this.stripe = new Stripe(key);
        } else {
            console.warn("⚠️ Stripe Connect Service initialized without a secret key. Payments will be disabled.");
        }
    }

    isEnabled(): boolean {
        return this.stripe !== null;
    }

    async createOnboardingLink(artistId: number, publicUrl: string): Promise<string> {
        if (!this.stripe) throw new Error("Stripe not configured");

        const artist = this.db.getArtistById(artistId);
        if (!artist) throw new Error("Artist not found");

        let stripeAccountId = artist.stripe_connect_id;

        if (!stripeAccountId) {
            // Create a new Express Custom account for the artist
            const account = await this.stripe.accounts.create({
                type: "express",
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
                business_profile: {
                    name: artist.name,
                    url: `${publicUrl}/artist/${artist.slug}`
                }
            });
            stripeAccountId = account.id;
            this.db.updateStripeConnect(artistId, stripeAccountId, 0);
        }

        // Generate onboarding account link
        const accountLink = await this.stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: `${publicUrl}/api/payments/stripe/onboarding?artistId=${artistId}`,
            return_url: `${publicUrl}/api/payments/stripe/onboarding-complete?artistId=${artistId}`,
            type: "account_onboarding",
        });

        return accountLink.url;
    }

    async checkAccountStatus(artistId: number): Promise<boolean> {
        if (!this.stripe) return false;

        const artist = this.db.getArtistById(artistId);
        if (!artist || !artist.stripe_connect_id) return false;

        const account = await this.stripe.accounts.retrieve(artist.stripe_connect_id);
        const completed = account.details_submitted ? 1 : 0;
        
        this.db.updateStripeConnect(artistId, artist.stripe_connect_id, completed);
        return account.details_submitted;
    }

    async createCheckoutSession(params: {
        trackId?: number;
        albumId?: number;
        buyerEmail?: string;
        successUrl: string;
        cancelUrl: string;
    }): Promise<{ id: string; url: string | null }> {
        if (!this.stripe) throw new Error("Stripe not configured");

        let title = "";
        let price = 0;
        let currency = "USD";
        let artistId = 0;

        if (params.trackId) {
            const track = this.db.getTrackById(params.trackId);
            if (!track) throw new Error("Track not found");
            title = track.title;
            price = track.price;
            currency = track.currency || "USD";
            artistId = track.artist_id;
        } else if (params.albumId) {
            const album = this.db.getAlbumById(params.albumId);
            if (!album) throw new Error("Album not found");
            title = album.title;
            price = album.price;
            currency = album.currency || "USD";
            artistId = album.artist_id;
        } else {
            throw new Error("Either trackId or albumId must be provided");
        }

        const artist = this.db.getArtistById(artistId);
        if (!artist || !artist.stripe_connect_id || !artist.stripe_onboarding_completed) {
            throw new Error("Artist has not configured Stripe payments yet");
        }

        if (price <= 0) {
            throw new Error("Item price must be greater than zero for card payments");
        }

        const totalCents = Math.round(price * 100);
        const applicationFeeCents = Math.round(totalCents * this.platformFeePct);

        const session = await this.stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{
                price_data: {
                    currency: currency.toLowerCase(),
                    product_data: {
                        name: title,
                    },
                    unit_amount: totalCents,
                },
                quantity: 1,
            }],
            mode: "payment",
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
            customer_email: params.buyerEmail,
            payment_intent_data: {
                application_fee_amount: applicationFeeCents,
                transfer_data: {
                    destination: artist.stripe_connect_id,
                },
            },
            metadata: {
                trackId: params.trackId ? params.trackId.toString() : "",
                albumId: params.albumId ? params.albumId.toString() : "",
            }
        });

        return { id: session.id, url: session.url };
    }
}
