import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import { createDatabase } from "./core/database.js";
import { StripeConnectService } from "./services/stripe-connect.js";
import { GoogleDriveService } from "./services/gdrive-stream.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.TUNECAMP_PORT || 1971;
const DB_PATH = process.env.TUNECAMP_DB_PATH || "./tunecamp-central.db";
const JWT_SECRET = process.env.TUNECAMP_JWT_SECRET || "central-secret-key-123456";
// Initialize DB
const dbService = createDatabase(DB_PATH);
// Initialize Services
const stripeService = new StripeConnectService(dbService);
const gdriveService = new GoogleDriveService(dbService);
const app = express();
app.use(express.json());
app.use(cors());
// Middleware for JWT Authentication
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token)
        return res.status(401).json({ error: "Access token required" });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err)
            return res.status(403).json({ error: "Invalid token" });
        req.user = user;
        next();
    });
}
// Optional Auth Middleware
function optionalAuthenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
        req.user = null;
        return next();
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err)
            req.user = null;
        else
            req.user = user;
        next();
    });
}
// ----------------------------------------------------
// Health Endpoint
// ----------------------------------------------------
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        app: "TuneCamp Central Hub",
        timestamp: new Date().toISOString(),
        stripeEnabled: stripeService.isEnabled(),
        gdriveEnabled: gdriveService.isEnabled()
    });
});
// ----------------------------------------------------
// Authentication Routes
// ----------------------------------------------------
app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }
    try {
        const existing = dbService.getUserByUsername(username);
        if (existing) {
            return res.status(400).json({ error: "Username already exists" });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = dbService.createUser(username, passwordHash, "user");
        res.status(201).json({ success: true, userId });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }
    try {
        const user = dbService.getUserByUsername(username);
        if (!user) {
            return res.status(400).json({ error: "Invalid username or password" });
        }
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: "Invalid username or password" });
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role, artistId: user.artist_id }, JWT_SECRET, { expiresIn: "24h" });
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                artistId: user.artist_id
            }
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ----------------------------------------------------
// Artist Routes
// ----------------------------------------------------
app.post("/api/artist/profile", authenticateToken, (req, res) => {
    const { name, slug } = req.body;
    if (!name || !slug) {
        return res.status(400).json({ error: "Artist name and slug required" });
    }
    try {
        const userId = req.user.id;
        const user = dbService.getUserById(userId);
        if (user.artist_id) {
            return res.status(400).json({ error: "User already has an artist profile" });
        }
        const existingSlug = dbService.getArtistBySlug(slug);
        if (existingSlug) {
            return res.status(400).json({ error: "Artist slug is already taken" });
        }
        const artistId = dbService.createArtist(name, slug, userId);
        // Return a fresh token with artistId embedded
        const token = jwt.sign({ id: user.id, username: user.username, role: "artist", artistId }, JWT_SECRET, { expiresIn: "24h" });
        res.status(201).json({ success: true, artistId, token });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ----------------------------------------------------
// Stripe Connect Routes
// ----------------------------------------------------
app.get("/api/payments/stripe/onboarding", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const artist = dbService.getArtistByOwnerId(userId);
        if (!artist) {
            return res.status(400).json({ error: "Artist profile not found" });
        }
        const host = req.get("host");
        const publicUrl = `${req.protocol}://${host}`;
        const url = await stripeService.createOnboardingLink(artist.id, publicUrl);
        res.json({ url });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get("/api/payments/stripe/onboarding-complete", async (req, res) => {
    const artistId = parseInt(req.query.artistId, 10);
    if (!artistId)
        return res.status(400).send("Missing artistId");
    try {
        const completed = await stripeService.checkAccountStatus(artistId);
        if (completed) {
            res.send("<h1>Stripe Connect setup completed successfully! You can now close this tab.</h1>");
        }
        else {
            res.send("<h1>Stripe Connect setup pending. Please try onboarding again.</h1>");
        }
    }
    catch (err) {
        res.status(500).send(`Error checking Stripe status: ${err.message}`);
    }
});
app.post("/api/payments/stripe/create-session", optionalAuthenticateToken, async (req, res) => {
    const { trackId, albumId, successUrl, cancelUrl } = req.body;
    try {
        const buyerEmail = req.user ? req.user.username : undefined;
        const session = await stripeService.createCheckoutSession({
            trackId: trackId ? parseInt(trackId, 10) : undefined,
            albumId: albumId ? parseInt(albumId, 10) : undefined,
            buyerEmail,
            successUrl,
            cancelUrl
        });
        res.json(session);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ----------------------------------------------------
// Google Drive Storage Routes
// ----------------------------------------------------
app.get("/api/storage/gdrive/auth", authenticateToken, (req, res) => {
    const userId = req.user.id;
    const host = req.get("host");
    const publicUrl = `${req.protocol}://${host}`;
    gdriveService.setRedirectUri(`${publicUrl}/api/storage/gdrive/callback`);
    const url = gdriveService.getAuthUrl(userId);
    res.json({ url });
});
app.get("/api/storage/gdrive/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
        return res.status(400).send("Missing code or state parameters");
    }
    try {
        const userId = parseInt(state, 10);
        const host = req.get("host");
        const publicUrl = `${req.protocol}://${host}`;
        gdriveService.setRedirectUri(`${publicUrl}/api/storage/gdrive/callback`);
        await gdriveService.exchangeCode(code, userId);
        res.send("<h1>Google Drive successfully connected to TuneCamp Central! You can close this tab now.</h1>");
    }
    catch (err) {
        res.status(500).send(`OAuth Error: ${err.message}`);
    }
});
app.get("/api/storage/gdrive/files", authenticateToken, async (req, res) => {
    try {
        const files = await gdriveService.listAudioFilesRecursive(req.user.id);
        res.json({ files });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get("/api/storage/gdrive/stream/:trackId", async (req, res) => {
    const trackId = parseInt(req.params.trackId, 10);
    if (!trackId)
        return res.status(400).json({ error: "Invalid track ID" });
    try {
        const track = dbService.getTrackById(trackId);
        if (!track)
            return res.status(404).json({ error: "Track not found" });
        // Retrieve file ID from gdrive://path format
        const gdrivePrefix = "gdrive://";
        if (!track.file_path.startsWith(gdrivePrefix)) {
            return res.status(400).json({ error: "Track is not stored on Google Drive" });
        }
        const fileId = track.file_path.substring(gdrivePrefix.length);
        const ownerId = track.owner_id;
        const range = req.headers.range;
        const { stream, status, headers } = await gdriveService.getFileStream(ownerId, fileId, range);
        // Pipe stream response back to client with range headers
        res.status(status);
        res.set(headers);
        stream.pipe(res);
    }
    catch (err) {
        console.error("GDrive stream failed:", err);
        res.status(500).json({ error: "Streaming failed: " + err.message });
    }
});
// ----------------------------------------------------
// Catalog Routes (Multi-Tenant)
// ----------------------------------------------------
app.post("/api/catalog/albums", authenticateToken, (req, res) => {
    const { title, slug, price, currency } = req.body;
    if (!title || !slug)
        return res.status(400).json({ error: "Title and slug are required" });
    try {
        const user = dbService.getUserById(req.user.id);
        if (!user.artist_id)
            return res.status(403).json({ error: "Artist profile required to create catalog items" });
        const albumId = dbService.createAlbum(title, slug, user.artist_id, user.id, price || 0, currency || "USD");
        res.status(201).json({ success: true, albumId });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post("/api/catalog/tracks", authenticateToken, (req, res) => {
    const { title, albumId, filePath, duration, fileSize, mimeType, price, currency } = req.body;
    if (!title || !albumId || !filePath) {
        return res.status(400).json({ error: "Title, albumId, and filePath are required" });
    }
    try {
        const user = dbService.getUserById(req.user.id);
        if (!user.artist_id)
            return res.status(403).json({ error: "Artist profile required to create catalog items" });
        const album = dbService.getAlbumById(parseInt(albumId, 10));
        if (!album || album.artist_id !== user.artist_id) {
            return res.status(403).json({ error: "Unauthorized access to this album" });
        }
        const trackId = dbService.createTrack(title, album.id, user.artist_id, user.id, filePath, duration || 0, fileSize || 0, mimeType || "audio/mpeg", price || 0, currency || "USD");
        res.status(201).json({ success: true, trackId });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get("/api/catalog/albums", (req, res) => {
    const artistId = req.query.artistId ? parseInt(req.query.artistId, 10) : null;
    try {
        const albums = artistId ? dbService.getAlbumsByArtist(artistId) : dbService.getAllAlbums();
        res.json({ albums });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get("/api/catalog/albums/:slug", (req, res) => {
    try {
        const album = dbService.getAlbumBySlug(req.params.slug);
        if (!album)
            return res.status(404).json({ error: "Album not found" });
        const tracks = dbService.getTracksByAlbum(album.id);
        res.json({ album, tracks });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
const publicPath = path.join(__dirname, "../../../public");
app.use(express.static(publicPath));
app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "Not found" });
    }
    res.sendFile(path.join(publicPath, "index.html"));
});
app.listen(PORT, () => {
    console.log(`🚀 TuneCamp Central Hub running at http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map