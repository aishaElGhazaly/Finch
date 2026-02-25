document.addEventListener("DOMContentLoaded", () => {
    initSearch();
    initSectorFilters();
    initSorting();
    initRowNavigation();
    initRemoveButtons();
    initVisibilityHandling();

    // Default: Big movers today
    activeSortField = "change_pct";
    activeSortDir = "desc";
    sortRows();

    updateCount();

    startLiveUpdates();
});

/* =========================================================
   Config
   ========================================================= */

const POLL_INTERVAL = 60_000;

/* =========================================================
   State
   ========================================================= */

let rows = [...document.querySelectorAll(".clickable-row")];
let activeSector = "ALL";

let activeSortField = null;
let activeSortDir = null;

let pollTimer = null;

/* =========================================================
   Elements
   ========================================================= */

const searchInput = document.getElementById("wlSearch");
const sectorContainer = document.getElementById("wlSectorFilters");

/* =========================================================
   Search + Filter
   ========================================================= */

function initSearch() {
    searchInput?.addEventListener("input", applyFilters);
}

function initSectorFilters() {
    if (!sectorContainer) return;

    const sectors = [...new Set(rows.map(r => r.dataset.sector).filter(Boolean))].sort();

    function chip(label) {
        const btn = document.createElement("button");
        btn.className = "btn btn-sm btn-outline-dark rounded-pill";
        btn.textContent = label;

        btn.onclick = () => {
            activeSector = label;
            sectorContainer.querySelectorAll("button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            applyFilters();
        };

        sectorContainer.appendChild(btn);
    }

    chip("ALL");
    sectors.forEach(chip);
    sectorContainer.querySelector("button")?.classList.add("active");
}

function updateCount() {
    const visibleSymbols = new Set();

    rows.forEach(row => {
        if (row.style.display !== "none") {
            visibleSymbols.add(row.dataset.symbol);
        }
    });

    const el = document.getElementById("wlCount");
    if (el) el.textContent = visibleSymbols.size;
}


function applyFilters() {
    const q = (searchInput?.value || "").toLowerCase();

    rows.forEach(row => {
        const matchesSearch =
            row.dataset.symbol.toLowerCase().startsWith(q) ||
            row.dataset.name.startsWith(q);

        const matchesSector =
            activeSector === "ALL" || row.dataset.sector === activeSector;

        row.style.display = matchesSearch && matchesSector ? "" : "none";
    });

    updateCount();
}

/* =========================================================
   Sorting
   ========================================================= */

function initSorting() {
    document.querySelectorAll("th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const field = th.dataset.sort;
            if (!field) return;

            activeSortDir =
                activeSortField === field && activeSortDir === "desc"
                    ? "asc"
                    : "desc";

            activeSortField = field;

            document.querySelectorAll(".sort-indicator").forEach(i => i.textContent = "");
            const indicator = th.querySelector(".sort-indicator");
            if (indicator) indicator.textContent = activeSortDir === "asc" ? "▲" : "▼";

            sortRows();
            updateCount();
        });
    });
}

function sortRows() {
    if (!activeSortField) return;

    const key = activeSortField === "price" ? "price" : "changePct";

    rows.sort((a, b) => {
        const A = Number(a.dataset[key] ?? 0);
        const B = Number(b.dataset[key] ?? 0);
        return activeSortDir === "asc" ? A - B : B - A;
    });

    rows.forEach(r => r.parentNode.appendChild(r));
}


/* =========================================================
   Live Updates (polling)
   ========================================================= */

function startLiveUpdates() {
    if (pollTimer) clearInterval(pollTimer);

    const refresh = async () => {
        const res = await fetch("/watchlist/snapshots");
        if (!res.ok) return;

        const data = await res.json();
        Object.entries(data).forEach(([symbol, snap]) => {
            updateRow(symbol, snap);
        });

        sortRows();
    };

    refresh();
    pollTimer = setInterval(refresh, POLL_INTERVAL);
}

/* =========================================================
   Row Update + Animation
   ========================================================= */

function updateRow(symbol, snap) {
    document.querySelectorAll(`[data-symbol="${symbol}"]`).forEach(row => {
        animateValue(row, "price", snap.price, formatUSD);
        animateChange(row, snap.change, snap.change_pct);
    });
}

function animateValue(row, key, newVal, formatter) {
    const oldVal = Number(row.dataset[key] ?? 0);
    if (oldVal === newVal) return;

    row.dataset[key] = newVal;

    const el = row.querySelector("[data-price-cell]");
    if (!el) return;

    el.textContent = formatter(newVal);
    flash(row, newVal > oldVal ? "up" : "down");
}

function animateChange(row, change, pct) {
    row.dataset.changePct = pct;

    const el = row.querySelector("[data-change-cell]");
    if (!el) return;

    const sign = pct >= 0 ? "+" : "";
    el.innerHTML = `
        ${sign}${change.toFixed(2)}
        <span class="small">(${sign}${pct.toFixed(2)}%)</span>
    `;

    el.classList.toggle("text-success", pct >= 0);
    el.classList.toggle("text-danger", pct < 0);
}

/* =========================================================
   Flash animation
   ========================================================= */

function flash(row, dir) {
    row.classList.remove("flash-up", "flash-down");
    void row.offsetWidth;
    row.classList.add(dir === "up" ? "flash-up" : "flash-down");

    setTimeout(() => {
        row.classList.remove("flash-up", "flash-down");
    }, 900);
}

/* =========================================================
   Navigation
   ========================================================= */

function initRowNavigation() {
    document.addEventListener("click", e => {
        const row = e.target.closest(".clickable-row");
        if (!row || e.target.closest("button")) return;
        window.location.href = `/stock/${row.dataset.symbol}`;
    });
}

/* =========================================================
   Remove
   ========================================================= */

function initRemoveButtons() {
    document.querySelectorAll(".wl-remove-btn").forEach(btn => {
        btn.onclick = async e => {
            e.stopPropagation();
            const symbol = btn.dataset.symbol;
            const csrf = document.querySelector('meta[name="csrf-token"]').content;

            const res = await fetch(`/watchlist/${symbol}`, {
                method: "POST",
                headers: { "X-CSRFToken": csrf }
            });

            const data = await res.json();
            if (data.status === "removed") {
                document.querySelectorAll(`[data-symbol="${symbol}"]`)
                    .forEach(el => el.remove());
                rows = rows.filter(r => r.dataset.symbol !== symbol);
                updateCount();
            }
        };
    });
}

/* =========================================================
   Visibility handling
   ========================================================= */

function initVisibilityHandling() {
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            clearInterval(pollTimer);
        } else {
            startLiveUpdates();
        }
    });
}

/* =========================================================
   Utils
   ========================================================= */

function formatUSD(v) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    }).format(v);
}
