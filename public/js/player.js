// TuneCamp Central - Global Audio Player

const audio = document.getElementById("player-audio-element");
const playPauseBtn = document.getElementById("btn-play-pause");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");
const prevBtn = document.getElementById("btn-prev");
const nextBtn = document.getElementById("btn-next");

const titleEl = document.getElementById("player-title");
const artistEl = document.getElementById("player-artist");
const coverEl = document.getElementById("player-cover");
const coverPlaceholder = document.getElementById("player-cover-placeholder");

const timeCurrentEl = document.getElementById("time-current");
const timeTotalEl = document.getElementById("time-total");
const progressBar = document.getElementById("player-progress-bar");
const timelineSlider = document.getElementById("player-timeline-slider");
const volumeSlider = document.getElementById("player-volume-slider");
const buyBtn = document.getElementById("player-buy-btn");

let currentTrackList = [];
let currentTrackIndex = -1;
let currentTrack = null;

// Helper to format duration (mm:ss)
function formatDuration(secs) {
    if (isNaN(secs) || !isFinite(secs)) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export const Player = {
    init() {
        // Play/Pause button
        playPauseBtn.addEventListener("click", () => this.togglePlay());

        // Prev/Next buttons
        prevBtn.addEventListener("click", () => this.prev());
        nextBtn.addEventListener("click", () => this.next());

        // Audio events
        audio.addEventListener("timeupdate", () => this.updateProgress());
        audio.addEventListener("durationchange", () => this.updateDuration());
        audio.addEventListener("ended", () => this.next());

        // Timeline Slider
        timelineSlider.addEventListener("input", (e) => {
            const pct = parseFloat(e.target.value);
            if (audio.duration) {
                audio.currentTime = (pct / 100) * audio.duration;
            }
        });

        // Volume Slider
        volumeSlider.addEventListener("input", (e) => {
            audio.volume = parseFloat(e.target.value);
        });

        // Initial volume sync
        audio.volume = parseFloat(volumeSlider.value);
    },

    playTrack(track, trackList = [], buyCallback = null) {
        currentTrack = track;
        currentTrackList = trackList;
        currentTrackIndex = trackList.findIndex(t => t.id === track.id);

        titleEl.textContent = track.title;
        artistEl.textContent = track.artist_name || "Unknown Artist";

        // Handle Cover art
        if (track.cover_path) {
            coverEl.src = track.cover_path;
            coverEl.classList.remove("hidden");
            coverPlaceholder.classList.add("hidden");
        } else {
            coverEl.classList.add("hidden");
            coverPlaceholder.classList.remove("hidden");
        }

        // Set Stream source from GDrive proxy
        audio.src = `/api/storage/gdrive/stream/${track.id}`;
        
        // Buy action setup
        if (track.price > 0 && buyCallback) {
            buyBtn.textContent = `Buy Track $${track.price.toFixed(2)}`;
            buyBtn.onclick = buyCallback;
            buyBtn.classList.remove("hidden");
        } else {
            buyBtn.classList.add("hidden");
        }

        this.play();
    },

    play() {
        audio.play().then(() => {
            this.updateUI(true);
        }).catch(err => {
            console.error("Playback failed:", err);
            this.updateUI(false);
        });
    },

    pause() {
        audio.pause();
        this.updateUI(false);
    },

    togglePlay() {
        if (!audio.src) return;
        if (audio.paused) {
            this.play();
        } else {
            this.pause();
        }
    },

    prev() {
        if (currentTrackIndex > 0) {
            const prevTrack = currentTrackList[currentTrackIndex - 1];
            this.playTrack(prevTrack, currentTrackList);
        }
    },

    next() {
        if (currentTrackIndex >= 0 && currentTrackIndex < currentTrackList.length - 1) {
            const nextTrack = currentTrackList[currentTrackIndex + 1];
            this.playTrack(nextTrack, currentTrackList);
        } else {
            this.pause();
            audio.currentTime = 0;
        }
    },

    updateProgress() {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = `${pct}%`;
        timelineSlider.value = pct;
        timeCurrentEl.textContent = formatDuration(audio.currentTime);
    },

    updateDuration() {
        timeTotalEl.textContent = formatDuration(audio.duration);
    },

    updateUI(playing) {
        if (playing) {
            playIcon.classList.add("hidden");
            pauseIcon.classList.remove("hidden");
        } else {
            playIcon.classList.remove("hidden");
            pauseIcon.classList.add("hidden");
        }
    }
};
