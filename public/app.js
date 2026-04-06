// Elements
const modeScreen = document.getElementById("mode-screen");
const searchScreen = document.getElementById("search-screen");
const searchArea = document.getElementById("search-area");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const loading = document.getElementById("loading");
const resultsArea = document.getElementById("results-area");
const errorDiv = document.getElementById("error");
const modeSwitchBtn = document.getElementById("mode-switch-btn");
const modeSwitchLabel = document.getElementById("mode-switch-label");
const modeModal = document.getElementById("mode-modal");

let currentMode = null;

const modeInfo = {
    lies:    { label: "How It Really Was" },
    reverse: { label: "Searching What You Want" },
    random:  { label: "Searching Something" },
};

// --- Mode Selection (landing page) ---
document.querySelectorAll("#mode-screen .mode-card").forEach((card) => {
    card.addEventListener("click", () => {
        currentMode = card.dataset.mode;
        modeScreen.classList.add("hidden");
        searchScreen.classList.remove("hidden");
        updateModeSwitchBtn();
        searchInput.focus();
    });
});

function updateModeSwitchBtn() {
    modeSwitchLabel.textContent = modeInfo[currentMode].label;
}

// --- Mode Switch (top right button -> modal) ---
modeSwitchBtn.addEventListener("click", () => {
    modeModal.classList.remove("hidden");
});

document.querySelector(".modal-backdrop").addEventListener("click", () => {
    modeModal.classList.add("hidden");
});

document.querySelectorAll(".modal-mode-card").forEach((card) => {
    card.addEventListener("click", () => {
        currentMode = card.dataset.mode;
        updateModeSwitchBtn();
        modeModal.classList.add("hidden");
        resetToSearch();
    });
});

function resetToSearch() {
    searchArea.className = "search-area centered";
    resultsArea.classList.add("hidden");
    errorDiv.classList.add("hidden");
    searchInput.value = "";
    searchInput.focus();
}

function formatViews(n) {
    if (!n) return "";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M views";
    if (n >= 1000) return (n / 1000).toFixed(0) + "K views";
    return n + " views";
}

function renderSearch(data) {
    // --- Images ---
    const imagesSection = document.getElementById("images-section");
    const imagesGrid = document.getElementById("images-grid");
    imagesGrid.innerHTML = "";
    if (data.images && data.images.length > 0) {
        imagesSection.classList.remove("hidden");
        if (data.image_search_url) {
            document.getElementById("images-more-link").href = data.image_search_url;
        }
        data.images.forEach((img) => {
            const imgEl = document.createElement("img");
            imgEl.src = img.url;
            imgEl.className = "image-thumb";
            imgEl.alt = data.displayed_query || "";
            imgEl.loading = "lazy";
            imgEl.onerror = () => imgEl.remove();
            imgEl.addEventListener("click", () => {
                window.open(img.url, "_blank");
            });
            imagesGrid.appendChild(imgEl);
        });
    } else {
        imagesSection.classList.add("hidden");
    }

    // --- Videos ---
    const videosSection = document.getElementById("videos-section");
    const videosGrid = document.getElementById("videos-grid");
    videosGrid.innerHTML = "";
    if (data.videos && data.videos.length > 0) {
        videosSection.classList.remove("hidden");
        data.videos.forEach((vid) => {
            const a = document.createElement("a");
            a.href = vid.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.className = "video-card";

            const thumbWrap = document.createElement("div");
            thumbWrap.className = "video-thumb-wrap";

            if (vid.thumbnail) {
                const thumb = document.createElement("img");
                thumb.src = vid.thumbnail;
                thumb.alt = vid.title;
                thumb.loading = "lazy";
                thumbWrap.appendChild(thumb);
            }

            if (vid.duration) {
                const dur = document.createElement("span");
                dur.className = "video-duration";
                dur.textContent = vid.duration;
                thumbWrap.appendChild(dur);
            }

            const info = document.createElement("div");
            info.className = "video-info";

            const title = document.createElement("div");
            title.className = "video-title";
            title.textContent = vid.title;

            const meta = document.createElement("div");
            meta.className = "video-meta";
            const parts = [];
            if (vid.publisher) parts.push(vid.publisher);
            const views = formatViews(vid.views);
            if (views) parts.push(views);
            meta.textContent = parts.join(" · ");

            info.appendChild(title);
            info.appendChild(meta);
            a.appendChild(thumbWrap);
            a.appendChild(info);
            videosGrid.appendChild(a);
        });
    } else {
        videosSection.classList.add("hidden");
    }

    // --- Links ---
    const linksContainer = document.getElementById("result-links");
    linksContainer.innerHTML = "";
    if (data.links && data.links.length > 0) {
        data.links.forEach((link) => {
            const a = document.createElement("a");
            a.href = link.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.className = "search-link";

            const urlSpan = document.createElement("span");
            urlSpan.className = "link-url";
            try {
                urlSpan.textContent = new URL(link.url).hostname;
            } catch {
                urlSpan.textContent = link.url;
            }

            const titleSpan = document.createElement("span");
            titleSpan.className = "link-title";
            titleSpan.textContent = link.title;

            a.appendChild(urlSpan);
            a.appendChild(titleSpan);

            if (link.snippet) {
                const snippetSpan = document.createElement("span");
                snippetSpan.className = "link-snippet";
                snippetSpan.textContent = link.snippet;
                a.appendChild(snippetSpan);
            }

            linksContainer.appendChild(a);
        });
    }
}

// --- Search ---
async function doSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchArea.className = "search-area top";
    loading.classList.remove("hidden");
    resultsArea.classList.add("hidden");
    errorDiv.classList.add("hidden");

    try {
        const resp = await fetch("/search-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, mode: currentMode }),
        });

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedContent = "";
        let data = {};

        function processEvent(eventData) {
            try {
                const msg = JSON.parse(eventData);
                if (msg.type === "error") {
                    loading.classList.add("hidden");
                    errorDiv.classList.remove("hidden");
                    document.getElementById("error-message").textContent = msg.message;
                    return;
                }
                if (msg.type === "meta") {
                    loading.classList.add("hidden");
                    searchInput.value = msg.displayed_query;
                    resultsArea.classList.remove("hidden");
                    document.getElementById("result-title").textContent = msg.displayed_query;
                    document.getElementById("result-content").textContent = "";
                    // Clear old search results
                    document.getElementById("images-section").classList.add("hidden");
                    document.getElementById("images-grid").innerHTML = "";
                    document.getElementById("videos-section").classList.add("hidden");
                    document.getElementById("videos-grid").innerHTML = "";
                    document.getElementById("result-links").innerHTML = "";
                    data = msg;
                }
                if (msg.type === "token") {
                    streamedContent += msg.text;
                    document.getElementById("result-content").textContent = streamedContent;
                }
                if (msg.type === "content") {
                    streamedContent = msg.text;
                    document.getElementById("result-content").textContent = msg.text;
                }
                if (msg.type === "search") {
                    Object.assign(data, msg);
                    renderSearch(data);
                }
                if (msg.type === "done" && !data.links) {
                    // lies mode — no search results to render
                }
            } catch {}
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    processEvent(line.slice(6));
                }
            }
        }
        // process remaining
        if (buffer.startsWith("data: ")) {
            processEvent(buffer.slice(6));
        }

        loading.classList.add("hidden");
    } catch (err) {
        loading.classList.add("hidden");
        errorDiv.classList.remove("hidden");
        document.getElementById("error-message").textContent =
            "Something went wrong. Is the server running?";
    }
}

searchBtn.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
});
