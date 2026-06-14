// TuneCamp Central - API Client Wrapper

const BASE_URL = "/api";

export const API = {
    getToken() {
        return localStorage.getItem("tunecamp_jwt");
    },
    
    setToken(token) {
        localStorage.setItem("tunecamp_jwt", token);
    },
    
    clearToken() {
        localStorage.removeItem("tunecamp_jwt");
    },
    
    getUser() {
        const userStr = localStorage.getItem("tunecamp_user");
        try {
            return userStr ? JSON.parse(userStr) : null;
        } catch {
            return null;
        }
    },
    
    setUser(user) {
        localStorage.setItem("tunecamp_user", JSON.stringify(user));
    },
    
    clearUser() {
        localStorage.removeItem("tunecamp_user");
    },

    async request(endpoint, options = {}) {
        const token = this.getToken();
        const headers = {
            "Content-Type": "application/json",
            ...options.headers
        };

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        const response = await fetch(`${BASE_URL}${endpoint}`, config);
        
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.error || `Request failed: ${response.status}`);
        }

        return response.json();
    },

    // Auth
    async login(username, password) {
        const data = await this.request("/auth/login", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
        if (data.token) {
            this.setToken(data.token);
            this.setUser(data.user);
        }
        return data;
    },

    async register(username, password) {
        return this.request("/auth/register", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
    },

    // Artist Profile Setup
    async createArtistProfile(name, slug) {
        const data = await this.request("/artist/profile", {
            method: "POST",
            body: JSON.stringify({ name, slug })
        });
        if (data.token) {
            // Update token with artist role & ID
            this.setToken(data.token);
            const user = this.getUser();
            if (user) {
                user.role = "artist";
                user.artistId = data.artistId;
                this.setUser(user);
            }
        }
        return data;
    },

    // Stripe Connect
    async getStripeOnboardingUrl() {
        return this.request("/payments/stripe/onboarding");
    },

    // Google Drive
    async getGDriveAuthUrl() {
        return this.request("/storage/gdrive/auth");
    },

    async getGDriveFiles() {
        return this.request("/storage/gdrive/files");
    },

    // Catalog Creation
    async createAlbum(title, slug, price) {
        return this.request("/catalog/albums", {
            method: "POST",
            body: JSON.stringify({ title, slug, price: parseFloat(price) })
        });
    },

    async createTrack(title, albumId, filePath, duration, fileSize, mimeType, price) {
        return this.request("/catalog/tracks", {
            method: "POST",
            body: JSON.stringify({
                title,
                albumId,
                filePath,
                duration: parseFloat(duration),
                fileSize: parseInt(fileSize, 10),
                mimeType,
                price: parseFloat(price)
            })
        });
    },

    // Catalog Retrieval
    async getFeaturedAlbums() {
        // Since there is no featured endpoint, we query a central artist or we mock featured albums
        // For development, we'll try to list all albums or handle mock if artist ID is unknown.
        // In the real central app, we would query the database for all public albums.
        // Let's assume we can pass a special parameter or query. We will implement it dynamically.
        return this.request("/catalog/albums?artistId=1").catch(() => ({ albums: [] }));
    },

    async getArtistAlbums(artistId) {
        return this.request(`/catalog/albums?artistId=${artistId}`);
    },

    async getAlbumDetails(slug) {
        return this.request(`/catalog/albums/${slug}`);
    },

    // Stripe Purchases
    async createStripeCheckoutSession(trackId, albumId, successUrl, cancelUrl) {
        return this.request("/payments/stripe/create-session", {
            method: "POST",
            body: JSON.stringify({ trackId, albumId, successUrl, cancelUrl })
        });
    }
};
