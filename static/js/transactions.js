document.addEventListener("DOMContentLoaded", () => {
    initSearch();
    initRangeFilter();
    initPagination();
    applyFilters();
});

/* =========================================================
   Config
   ========================================================= */

const PAGE_SIZE = 15;

/* =========================================================
   State
   ========================================================= */

let allTrades = window.TRADE_DATA || [];
let filteredTrades = [...allTrades];

let currentPage = 1;
let activeRange = "30";

/* =========================================================
   Elements
   ========================================================= */

const tableBody = document.getElementById("txTableBody");
const mobileList = document.getElementById("txMobileList");
const pagination = document.getElementById("txPagination");

const searchInput = document.getElementById("txSearch");
const rangeSelect = document.getElementById("txRange");
const countEl = document.getElementById("txCount");

/* =========================================================
   Init
   ========================================================= */

function initSearch() {
    searchInput?.addEventListener("input", () => {
        currentPage = 1;
        applyFilters();
    });
}

function initRangeFilter() {
    rangeSelect?.addEventListener("change", () => {
        activeRange = rangeSelect.value;
        currentPage = 1;
        applyFilters();
    });
}

function initPagination() {
    pagination.addEventListener("click", e => {
        const btn = e.target.closest("[data-page]");
        if (!btn) return;

        currentPage = Number(btn.dataset.page);
        render();
    });
}

/* =========================================================
   Filtering
   ========================================================= */

function applyFilters() {
    const q = (searchInput?.value || "").toLowerCase();

    filteredTrades = allTrades.filter(t => {
        const matchesSymbol = t.symbol.toLowerCase().startsWith(q);
        const matchesRange = withinRange(t.created_at, activeRange);
        return matchesSymbol && matchesRange;
    });

    render();
}

function withinRange(ts, range) {
    if (range === "all") return true;

    const days = Number(range);
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days);

    return parseUTC(ts) >= cutoff;
}

/* =========================================================
   Rendering
   ========================================================= */

function render() {
    renderTable();
    renderMobile();
    renderPagination();
    updateCount();
}

function renderTable() {
    if (!tableBody) return;

    tableBody.innerHTML = "";

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredTrades.slice(start, start + PAGE_SIZE);

    for (const t of pageItems) {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="tx-date" data-ts="${t.created_at}"></td>

            <td>
                <a href="/stock/${t.symbol}" class="fw-semibold trade-link">
                    ${t.symbol}
                </a>
            </td>

            <td>
                ${t.type}
                <span class="text-muted small">
                    · ${t.order_source === "MARKET" ? "MKT" : "LMT"}
                </span>
            </td>

            <td class="d-none d-sm-table-cell text-end">
                ${t.shares}
            </td>

            <td class="d-none d-md-table-cell text-end">
                ${usd(t.price)}
            </td>

            <td class="d-none d-lg-table-cell text-end">
                ${usd(t.total)}
            </td>

            <td class="text-end">
                ${formatPL(t.realized_pl)}
            </td>
        `;

        tableBody.appendChild(tr);
    }

    formatDates();
}

function renderMobile() {
    if (!mobileList) return;

    mobileList.innerHTML = "";

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredTrades.slice(start, start + PAGE_SIZE);

    for (const t of pageItems) {
        const card = document.createElement("div");
        card.className = "card mb-2 shadow-sm rounded-3";

        card.innerHTML = `
            <div class="card-body py-3 px-3">

                <div class="d-flex justify-content-between mb-1">
                    <span class="fw-semibold">
                        ${t.symbol}
                    </span>

                    <span class="fw-semibold">
                        ${formatPL(t.realized_pl)}
                    </span>
                </div>

                <div class="text-muted small mb-1">
                    ${t.type} · ${t.order_source === "MARKET" ? "MKT" : "LMT"}
                </div>

                <div class="text-muted small">
                    ${t.shares} shares @ ${usd(t.price)}
                </div>

                <div class="text-muted small tx-date-mobile" data-ts="${t.created_at}"></div>
            </div>
        `;

        mobileList.appendChild(card);
    }

    formatDates();
}

/* =========================================================
   Pagination
   ========================================================= */

function renderPagination() {
    pagination.innerHTML = "";

    const totalPages = Math.ceil(filteredTrades.length / PAGE_SIZE);
    if (totalPages <= 1) return;

    const maxVisible = 5; // pages around current
    const half = Math.floor(maxVisible / 2);

    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, currentPage + half);

    if (currentPage <= half) {
        start = 1;
        end = Math.min(totalPages, maxVisible);
    }

    if (currentPage + half >= totalPages) {
        end = totalPages;
        start = Math.max(1, totalPages - maxVisible + 1);
    }

    const add = (label, page, disabled = false, active = false) => {
        const li = document.createElement("li");
        li.className = `
            page-item
            ${disabled ? "disabled" : ""}
            ${active ? "active" : ""}
        `;

        li.innerHTML = `<button class="page-link">${label}</button>`;

        if (!disabled && !active) {
            li.onclick = () => {
                currentPage = page;
                render();
            };
        }

        pagination.appendChild(li);
    };

    // Prev
    add("«", currentPage - 1, currentPage === 1);

    // First + ellipsis
    if (start > 1) {
        add("1", 1);
        if (start > 2) add("…", null, true);
    }

    // Window
    for (let p = start; p <= end; p++) {
        add(p, p, false, p === currentPage);
    }

    // Last + ellipsis
    if (end < totalPages) {
        if (end < totalPages - 1) add("…", null, true);
        add(totalPages, totalPages);
    }

    // Next
    add("»", currentPage + 1, currentPage === totalPages);
}


/* =========================================================
   Count
   ========================================================= */

function updateCount() {
    if (countEl) countEl.textContent = filteredTrades.length;
}

/* =========================================================
   Formatting helpers
   ========================================================= */

function usd(v) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    }).format(v);
}

function formatPL(v) {
    if (v === null || v === undefined) {
        return `<span class="text-muted">—</span>`;
    }

    if (v > 0) {
        return `<span class="text-success">+${usd(v)}</span>`;
    }

    if (v < 0) {
        return `<span class="text-danger">${usd(v)}</span>`;
    }

    return `<span class="text-muted">${usd(v)}</span>`;
}

/* =========================================================
   Dates
   ========================================================= */

function formatDates() {
    document.querySelectorAll(".tx-date").forEach(el => {
        if (el.dataset.ts) {
            el.textContent = formatFullDate(el.dataset.ts);
        }
    });

    document.querySelectorAll(".tx-date-mobile").forEach(el => {
        if (el.dataset.ts) {
            el.textContent = formatMobileDate(el.dataset.ts);
        }
    });
}

function formatFullDate(ts) {
    const d = parseUTC(ts);
    let text = d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });

    text = text.replace(/, (\d)/, " $1");
    const lastComma = text.lastIndexOf(",");
    if (lastComma !== -1) {
        text = text.slice(0, lastComma) + " •" + text.slice(lastComma + 1);
    }

    return text.trim();
}

function formatMobileDate(ts) {
    const d = parseUTC(ts);
    return `${d.getDate()} ${d.toLocaleString(undefined, { month: "short" })} ’${String(d.getFullYear()).slice(-2)}`;
}

function parseUTC(ts) {
    const p = ts.split(/[- :]/);
    return new Date(Date.UTC(
        p[0],
        p[1] - 1,
        p[2],
        p[3] || 0,
        p[4] || 0,
        p[5] || 0
    ));
}
