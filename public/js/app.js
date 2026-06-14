// TuneCamp Central - Single Page Application Engine
import { API } from "./api.js";
import { Player } from "./player.js";

// Global DOM elements
const toastEl = document.getElementById("toast");
const navDiscover = document.getElementById("nav-discover");
const navDashboard = document.getElementById("nav-dashboard");
const navLogin = document.getElementById("nav-login");
const navProfile = document.getElementById("nav-profile");
const userDisplayName = document.getElementById("user-display-name");
const btnLogout = document.getElementById("btn-logout");

// Notification helper
function showToast(message, isError = false) {
    toastEl.textContent = message;
    toastEl.className = isError ? "toast error" : "toast";
    toastEl.classList.remove("hidden");
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        toastEl.classList.add("hidden");
    }, 3000);
}

// Global Nav UI update
function updateNavUI() {
    const user = API.getUser();
    
    // Reset active links
    navDiscover.classList.remove("active");
    navDashboard.classList.remove("active");
    
    const hash = window.location.hash;
    if (hash === "#/" || hash === "") navDiscover.classList.add("active");
    if (hash.startsWith("#/dashboard")) navDashboard.classList.add("active");

    if (user) {
        navLogin.classList.add("hidden");
        navDashboard.classList.remove("hidden");
        navProfile.classList.remove("hidden");
        userDisplayName.textContent = user.username;
    } else {
        navLogin.classList.remove("hidden");
        navDashboard.classList.add("hidden");
        navProfile.classList.add("hidden");
    }
}

// SPA Router
async function handleRoute() {
    const hash = window.location.hash || "#/";
    
    // Hide all views first
    document.querySelectorAll(".view").forEach(view => {
        view.classList.add("hidden");
    });
    
    updateNavUI();

    // 1. Home / Discover Route
    if (hash === "#/" || hash === "") {
        const homeView = document.getElementById("home-view");
        homeView.classList.remove("hidden");
        renderDiscover();
    }
    
    // 2. Auth / Login Route
    else if (hash === "#/login") {
        const loginView = document.getElementById("login-view");
        loginView.classList.remove("hidden");
        setupAuthForms();
    }
    
    // 3. Album View Route (#/album/visions-of-light)
    else if (hash.startsWith("#/album/")) {
        const albumView = document.getElementById("album-view");
        albumView.classList.remove("hidden");
        const slug = hash.split("#/album/")[1];
        renderAlbumDetails(slug);
    }
    
    // 4. Artist View Route (#/artist/slug)
    else if (hash.startsWith("#/artist/")) {
        const artistView = document.getElementById("artist-view");
        artistView.classList.remove("hidden");
        const slug = hash.split("#/artist/")[1];
        renderArtistStorefront(slug);
    }
    
    // 5. Dashboard Route
    else if (hash === "#/dashboard") {
        if (!API.getToken()) {
            window.location.hash = "#/login";
            return;
        }
        const dashboardView = document.getElementById("dashboard-view");
        dashboardView.classList.remove("hidden");
        renderDashboard();
    }
}

// ----------------------------------------------------
// View Renderers
// ----------------------------------------------------

// Render home discover grid
async function renderDiscover() {
    const grid = document.getElementById("featured-albums");
    grid.innerHTML = "<p class='placeholder-text'>Loading featured releases...</p>";

    try {
        const data = await API.getFeaturedAlbums();
        if (!data.albums || data.albums.length === 0) {
            grid.innerHTML = "<p class='placeholder-text'>No albums published on Central yet. Be the first!</p>";
            return;
        }

        grid.innerHTML = data.albums.map(album => `
            <div class="album-item" onclick="window.location.hash = '#/album/${album.slug}'">
                <div class="album-art-wrap">
                    <img src="${album.cover_path || '/api/assets/placeholder.png'}" alt="${album.title}">
                </div>
                <div class="album-item-details">
                    <h3>${album.title}</h3>
                    <p>by ${album.artist_name || 'Artist'}</p>
                    <span class="album-item-price">$${album.price.toFixed(2)}</span>
                </div>
            </div>
        `).join("");
    } catch (err) {
        showToast("Error loading albums: " + err.message, true);
        grid.innerHTML = "<p class='placeholder-text'>Failed to load albums.</p>";
    }
}

// Render album storefront page
async function renderAlbumDetails(slug) {
    const coverImg = document.getElementById("album-cover");
    const titleEl = document.getElementById("album-title");
    const artistLink = document.getElementById("album-artist-name");
    const priceEl = document.getElementById("album-price");
    const buyBtn = document.getElementById("btn-buy-album");
    const tracksContainer = document.getElementById("album-tracks");
    
    tracksContainer.innerHTML = "<p class='placeholder-text'>Loading tracks...</p>";

    try {
        const data = await API.getAlbumDetails(slug);
        const { album, tracks } = data;

        titleEl.textContent = album.title;
        artistLink.textContent = album.artist_name || "Artist";
        artistLink.href = `#/artist/${album.artist_slug || 'unknown'}`;
        priceEl.textContent = album.price.toFixed(2);
        
        if (album.cover_path) {
            coverImg.src = album.cover_path;
        } else {
            coverImg.src = "/api/assets/placeholder.png";
        }

        // Setup buy button
        buyBtn.onclick = async () => {
            try {
                showToast("Opening Stripe checkout...");
                const successUrl = window.location.href;
                const cancelUrl = window.location.href;
                const session = await API.createStripeCheckoutSession(null, album.id, successUrl, cancelUrl);
                if (session.url) {
                    window.location.href = session.url;
                }
            } catch (err) {
                showToast("Purchase failed: " + err.message, true);
            }
        };

        if (!tracks || tracks.length === 0) {
            tracksContainer.innerHTML = "<p class='placeholder-text'>This album has no tracks yet.</p>";
            return;
        }

        tracksContainer.innerHTML = tracks.map((track, idx) => `
            <div class="track-row">
                <button class="btn-play-track" id="play-track-${track.id}">
                    <svg viewBox="0 0 24 24" style="width:18px;height:18px;"><path fill="currentColor" d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                </button>
                <span class="track-num">${idx + 1}</span>
                <span class="track-title">${track.title}</span>
                <span class="track-duration">${track.duration ? (track.duration / 60).toFixed(2) : "0.00"}</span>
                ${track.price > 0 ? `<button class="btn-buy-track" id="buy-track-${track.id}">$${track.price.toFixed(2)}</button>` : ""}
            </div>
        `).join("");

        // Attach listeners for play and buy buttons
        tracks.forEach(track => {
            document.getElementById(`play-track-${track.id}`).addEventListener("click", () => {
                Player.playTrack(track, tracks, async () => {
                    try {
                        const successUrl = window.location.href;
                        const cancelUrl = window.location.href;
                        const session = await API.createStripeCheckoutSession(track.id, null, successUrl, cancelUrl);
                        if (session.url) window.location.href = session.url;
                    } catch (err) {
                        showToast(err.message, true);
                    }
                });
            });

            const buyTrackBtn = document.getElementById(`buy-track-${track.id}`);
            if (buyTrackBtn) {
                buyTrackBtn.addEventListener("click", async () => {
                    try {
                        showToast("Opening Stripe checkout...");
                        const successUrl = window.location.href;
                        const cancelUrl = window.location.href;
                        const session = await API.createStripeCheckoutSession(track.id, null, successUrl, cancelUrl);
                        if (session.url) {
                            window.location.href = session.url;
                        }
                    } catch (err) {
                        showToast("Purchase failed: " + err.message, true);
                    }
                });
            }
        });
    } catch (err) {
        showToast("Error loading album details: " + err.message, true);
    }
}

// Render Artist profile/storefront
async function renderArtistStorefront(slug) {
    showToast("Render artist profile: " + slug);
}

// Render Artist Dashboard
async function renderDashboard() {
    const user = API.getUser();
    const promptSection = document.getElementById("dashboard-setup-profile");
    const artistContent = document.getElementById("dashboard-artist-content");
    
    promptSection.classList.add("hidden");
    artistContent.classList.add("hidden");

    if (user.role !== "artist") {
        promptSection.classList.remove("hidden");
        setupProfileForm();
    } else {
        artistContent.classList.remove("hidden");
        setupArtistDashboard(user.artistId);
    }
}

function setupProfileForm() {
    const form = document.getElementById("form-create-profile");
    form.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById("artist-profile-name").value;
        const slug = document.getElementById("artist-profile-slug").value;

        try {
            await API.createArtistProfile(name, slug);
            showToast("Artist profile created successfully!");
            renderDashboard();
        } catch (err) {
            showToast("Failed to create profile: " + err.message, true);
        }
    };
}

async function setupArtistDashboard(artistId) {
    const btnGDrive = document.getElementById("btn-connect-gdrive");
    const btnStripe = document.getElementById("btn-connect-stripe");
    const stripeBadge = document.getElementById("stripe-badge");
    const gdriveBadge = document.getElementById("gdrive-badge");

    // Connect Google Drive Action
    btnGDrive.onclick = async () => {
        try {
            const data = await API.getGDriveAuthUrl();
            if (data.url) {
                // Open auth consent screen in a new window/tab
                window.open(data.url, "_blank");
            }
        } catch (err) {
            showToast("GDrive connection failed: " + err.message, true);
        }
    };

    // Connect Stripe Connect Action
    btnStripe.onclick = async () => {
        try {
            const data = await API.getStripeOnboardingUrl();
            if (data.url) {
                window.open(data.url, "_blank");
            }
        } catch (err) {
            showToast("Stripe connection failed: " + err.message, true);
        }
    };

    // Populate Target Album Select dropdown
    const selectAlbum = document.getElementById("select-track-album");
    selectAlbum.innerHTML = "<option value=''>-- Choose Album --</option>";
    try {
        const data = await API.getArtistAlbums(artistId);
        if (data.albums) {
            data.albums.forEach(album => {
                const opt = document.createElement("option");
                opt.value = album.id;
                opt.textContent = album.title;
                selectAlbum.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Failed to load artist albums", err);
    }

    // Google Drive Scanner List
    const btnScan = document.getElementById("btn-refresh-gdrive-files");
    const filesList = document.getElementById("gdrive-files-list");
    
    btnScan.onclick = async () => {
        filesList.innerHTML = "<tr><td colspan='3' class='placeholder-td'>Scanning drive folders...</td></tr>";
        try {
            const data = await API.getGDriveFiles();
            if (!data.files || data.files.length === 0) {
                filesList.innerHTML = "<tr><td colspan='3' class='placeholder-td'>No audio files found. Upload some music to your Google Drive first!</td></tr>";
                return;
            }

            filesList.innerHTML = data.files.map(file => `
                <tr>
                    <td>${file.name}</td>
                    <td>${file.size ? (parseInt(file.size, 10)/1024/1024).toFixed(2) + " MB" : "Unknown"}</td>
                    <td>
                        <button class="btn btn-primary btn-sm btn-import-file" data-id="${file.id}" data-name="${file.name}" data-size="${file.size || 0}" data-mime="${file.mimeType}">
                            Import
                        </button>
                    </td>
                </tr>
            `).join("");

            // Setup import buttons
            document.querySelectorAll(".btn-import-file").forEach(btn => {
                btn.onclick = async (e) => {
                    const albumId = selectAlbum.value;
                    if (!albumId) {
                        showToast("Please choose a target album first", true);
                        return;
                    }

                    const target = e.currentTarget;
                    const fileId = target.dataset.id;
                    const filename = target.dataset.name;
                    const size = target.dataset.size;
                    const mime = target.dataset.mime;
                    const title = filename.replace(/\.[^/.]+$/, ""); // Strip extension

                    try {
                        target.disabled = true;
                        target.textContent = "Importing...";
                        
                        await API.createTrack(
                            title,
                            albumId,
                            `gdrive://${fileId}`,
                            0, // Duration (calculating on first stream in simple mode)
                            size,
                            mime,
                            0.99 // Default track price
                        );
                        
                        showToast(`Successfully imported: ${title}`);
                        target.textContent = "Imported";
                        target.classList.replace("btn-primary", "btn-ghost");
                    } catch (err) {
                        showToast("Import failed: " + err.message, true);
                        target.disabled = false;
                        target.textContent = "Import";
                    }
                };
            });
        } catch (err) {
            showToast("Failed to retrieve Google Drive files: " + err.message, true);
            filesList.innerHTML = "<tr><td colspan='3' class='placeholder-td'>Failed scanning drive. Please check connection.</td></tr>";
        }
    };

    // Publish Album Form submission
    const formAlbum = document.getElementById("form-create-album");
    formAlbum.onsubmit = async (e) => {
        e.preventDefault();
        const title = document.getElementById("new-album-title").value;
        const slug = document.getElementById("new-album-slug").value;
        const price = document.getElementById("new-album-price").value;

        try {
            await API.createAlbum(title, slug, price);
            showToast(`Album "${title}" published successfully!`);
            formAlbum.reset();
            setupArtistDashboard(artistId); // Refresh dropdown
        } catch (err) {
            showToast("Failed to create album: " + err.message, true);
        }
    };
}

// Setup Auth views
function setupAuthForms() {
    const form = document.getElementById("form-auth");
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const btnSubmit = document.getElementById("btn-submit-auth");
    
    let isRegisterMode = false;

    tabLogin.onclick = () => {
        isRegisterMode = false;
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        btnSubmit.textContent = "Sign In";
    };

    tabRegister.onclick = () => {
        isRegisterMode = true;
        tabRegister.classList.add("active");
        tabLogin.classList.remove("active");
        btnSubmit.textContent = "Register";
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById("auth-username").value;
        const password = document.getElementById("auth-password").value;

        try {
            if (isRegisterMode) {
                await API.register(username, password);
                showToast("Account created successfully! Signing in...");
            }
            await API.login(username, password);
            showToast("Welcome to TuneCamp Central!");
            window.location.hash = "#/dashboard";
        } catch (err) {
            showToast("Authentication failed: " + err.message, true);
        }
    };
}

// Logout Action
btnLogout.onclick = () => {
    API.clearToken();
    API.clearUser();
    showToast("Signed out successfully.");
    window.location.hash = "#/";
};

// Start SPA and Listeners
window.addEventListener("hashchange", handleRoute);
window.addEventListener("load", () => {
    Player.init();
    handleRoute();
});
