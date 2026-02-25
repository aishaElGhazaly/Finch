import { showToast } from "./toast.js";

document.addEventListener("DOMContentLoaded", () => {
    initCashTabs();

    initDepositForm();
    initWithdrawForm();
    initQuickButtons();

    initHistory();
    initToasts();
});

/* =========================================================
   Config
========================================================= */

const PAGE_SIZE = 15;
const DEPOSIT_LIMIT = Math.min(REMAINING_DAILY, REMAINING_WEEKLY);

/* =========================================================
   State
========================================================= */

let allHistory = window.CASH_DATA || [];
let filteredHistory = [...allHistory];

let currentPage = 1;
let activeRange = "30";

/* =========================================================
   Elements
========================================================= */

const historyTableBody = document.getElementById("historyTableBody");
const historyMobileList = document.getElementById("historyMobileList");
const historyPagination = document.getElementById("historyPagination");

const historyCount = document.getElementById("historyCount");
const historyRange = document.getElementById("historyRange");


/* =========================================================
   Tabs
========================================================= */

function initCashTabs() {
    const depositTab = document.getElementById("depositTab");
    const withdrawTab = document.getElementById("withdrawTab");
    const historyTab = document.getElementById("historyTab");

    const depositForm = document.getElementById("depositForm");
    const withdrawForm = document.getElementById("withdrawForm");
    const historySection = document.getElementById("historySection");

    function activate(tab) {
        [depositTab, withdrawTab, historyTab].forEach(btn => {
            btn.classList.remove("active", "btn-dark");
            btn.classList.add("btn-outline-dark");
        });

        depositForm.classList.add("d-none");
        withdrawForm.classList.add("d-none");
        historySection.classList.add("d-none");

        if (tab === "deposit") {
            depositTab.classList.add("active", "btn-dark");
            depositForm.classList.remove("d-none");
        }

        if (tab === "withdraw") {
            withdrawTab.classList.add("active", "btn-dark");
            withdrawForm.classList.remove("d-none");
        }

        if (tab === "history") {
            historyTab.classList.add("active", "btn-dark");
            historySection.classList.remove("d-none");

            // Ensure correct layout when opening history
            renderHistory();
        }
    }

    depositTab?.addEventListener("click", () => activate("deposit"));
    withdrawTab?.addEventListener("click", () => activate("withdraw"));
    historyTab?.addEventListener("click", () => activate("history"));
}


/* =========================================================
   Deposit
========================================================= */

function initDepositForm() {
    const input = document.getElementById("depositAmount");
    const msg = document.getElementById("depositLimitMsg");
    const submitBtn = document.getElementById("depositSubmitBtn");
    const maxBtn = document.getElementById("depositMaxBtn");

    if (!input) return;

    const LIMIT = DEPOSIT_LIMIT;

    function validate() {
        const value = parseFloat(input.value || 0);

        if (value <= 0) {
            msg.classList.add("d-none");
            submitBtn.disabled = false;
            return;
        }

        if (value > LIMIT) {
            msg.textContent = "Amount exceeds your remaining limit.";
            msg.classList.remove("d-none");
            submitBtn.disabled = true;
        } else {
            msg.classList.add("d-none");
            submitBtn.disabled = false;
        }
    }

    input.addEventListener("input", validate);

    maxBtn?.addEventListener("click", () => {
        input.value = LIMIT;
        validate();
    });
}


/* =========================================================
   Withdraw
========================================================= */

function initWithdrawForm() {
    const input = document.getElementById("withdrawAmount");
    const msg = document.getElementById("withdrawLimitMsg");
    const submitBtn = document.getElementById("withdrawSubmitBtn");
    const maxBtn = document.getElementById("withdrawMaxBtn");

    if (!input) return;

    const LIMIT = WITHDRAW_MAX_BALANCE;

    function validate() {
        const value = parseFloat(input.value || 0);

        if (value <= 0) {
            msg.classList.add("d-none");
            submitBtn.disabled = false;
            return;
        }

        if (value > LIMIT) {
            msg.textContent = "You cannot withdraw more than your balance.";
            msg.classList.remove("d-none");
            submitBtn.disabled = true;
        } else {
            msg.classList.add("d-none");
            submitBtn.disabled = false;
        }
    }

    input.addEventListener("input", validate);

    maxBtn?.addEventListener("click", () => {
        input.value = LIMIT;
        validate();
    });
}


/* =========================================================
   Quick Buttons
========================================================= */

function initQuickButtons() {
    const depositContainer = document.getElementById("depositQuickButtons");
    const withdrawContainer = document.getElementById("withdrawQuickButtons");

    if (depositContainer) {
        generateQuickButtons(
            depositContainer,
            document.getElementById("depositAmount"),
            DEPOSIT_LIMIT
        );
    }

    if (withdrawContainer) {
        generateQuickButtons(
            withdrawContainer,
            document.getElementById("withdrawAmount"),
            WITHDRAW_MAX_BALANCE
        );
    }
}

function generateQuickButtons(container, input, maxValue) {
    container.innerHTML = "";

    const values = [0.05, 0.1, 0.25, 0.5]
        .map(p => niceNumber(maxValue * p))
        .filter(v => v > 0 && v <= maxValue);

    [...new Set(values)].forEach(value => {
        const btn = document.createElement("button");

        btn.type = "button";
        btn.className = "btn btn-outline-dark";
        btn.textContent = `$${value.toLocaleString()}`;

        btn.onclick = () => {
            input.value = value;
            input.dispatchEvent(new Event("input"));
        };

        container.appendChild(btn);
    });
}

function niceNumber(value) {
    if (value <= 0) return 0;

    const exp = Math.floor(Math.log10(value));
    const base = Math.pow(10, exp);
    const n = value / base;

    if (n <= 1) return 1 * base;
    if (n <= 2) return 2 * base;
    if (n <= 5) return 5 * base;

    return 10 * base;
}


/* =========================================================
   History Init
========================================================= */

function initHistory() {
    initHistoryRange();
    initHistoryPagination();
    applyHistoryFilters();
}


/* =========================================================
   History Filters
========================================================= */

function initHistoryRange() {
    historyRange?.addEventListener("change", () => {
        activeRange = historyRange.value;
        currentPage = 1;
        applyHistoryFilters();
    });
}

function applyHistoryFilters() {
    filteredHistory = allHistory.filter(t => {
        return withinRange(t.created_at, activeRange);
    });

    renderHistory();
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
   History Rendering
========================================================= */

function renderHistory() {
    renderHistoryTable();
    renderHistoryMobile();
    renderHistoryPagination();
    updateHistoryCount();
}

function renderHistoryTable() {
    if (!historyTableBody) return;

    historyTableBody.innerHTML = "";

    const start = (currentPage - 1) * PAGE_SIZE;
    const items = filteredHistory.slice(start, start + PAGE_SIZE);

    for (const t of items) {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="cash-date" data-ts="${t.created_at}"></td>
            <td>${t.type}</td>
            <td>${usd(t.amount)}</td>
            <td>${usd(t.balance_after)}</td>
            <td>${t.note || ""}</td>
        `;

        historyTableBody.appendChild(tr);
    }

    formatHistoryDates();
}

function renderHistoryMobile() {
    if (!historyMobileList) return;

    historyMobileList.innerHTML = "";

    const start = (currentPage - 1) * PAGE_SIZE;
    const items = filteredHistory.slice(start, start + PAGE_SIZE);

    for (const t of items) {
        const card = document.createElement("div");
        card.className = "card mb-2 shadow-sm rounded-3";

        const sign = t.type === "DEPOSIT" ? "+" : "-";
        const color = t.type === "DEPOSIT" ? "text-success" : "text-danger";

        card.innerHTML = `
            <div class="card-body py-3 px-3">

                <div class="d-flex justify-content-between mb-1">
                    <span class="fw-semibold">
                        ${t.type.replace("_", " ")}
                    </span>

                    <span class="${color} fw-bold">
                        ${sign}${usd(t.amount)}
                    </span>
                </div>

                <div class="text-muted small cash-date-mobile"
                     data-ts="${t.created_at}">
                </div>

                <div class="text-muted small">
                    Balance after: ${usd(t.balance_after)}
                </div>

            </div>
        `;

        historyMobileList.appendChild(card);
    }

    formatHistoryDates();
}


/* =========================================================
   Pagination
========================================================= */

function initHistoryPagination() {
    historyPagination?.addEventListener("click", e => {
        const btn = e.target.closest("[data-page]");
        if (!btn) return;

        currentPage = Number(btn.dataset.page);
        renderHistory();
    });
}

function renderHistoryPagination() {
    if (!historyPagination) return;

    historyPagination.innerHTML = "";

    const totalPages = Math.ceil(filteredHistory.length / PAGE_SIZE);

    if (totalPages <= 1) return;

    const maxVisible = 5;
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
                renderHistory();
            };
        }

        historyPagination.appendChild(li);
    };

    add("«", currentPage - 1, currentPage === 1);

    if (start > 1) {
        add("1", 1);
        if (start > 2) add("…", null, true);
    }

    for (let p = start; p <= end; p++) {
        add(p, p, false, p === currentPage);
    }

    if (end < totalPages) {
        if (end < totalPages - 1) add("…", null, true);
        add(totalPages, totalPages);
    }

    add("»", currentPage + 1, currentPage === totalPages);
}


/* =========================================================
   Count
========================================================= */

function updateHistoryCount() {
    if (historyCount) {
        historyCount.textContent = filteredHistory.length;
    }
}


/* =========================================================
   Formatting Helpers
========================================================= */

function usd(v) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    }).format(v);
}


/* =========================================================
   Dates
========================================================= */

function formatHistoryDates() {
    document.querySelectorAll(".cash-date").forEach(el => {
        if (el.dataset.ts) {
            el.textContent = formatFullDate(el.dataset.ts);
        }
    });

    document.querySelectorAll(".cash-date-mobile").forEach(el => {
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
        text =
            text.slice(0, lastComma) +
            " •" +
            text.slice(lastComma + 1);
    }

    return text.trim();
}

function formatMobileDate(ts) {
    const d = parseUTC(ts);

    return `${d.getDate()} ${d.toLocaleString(undefined, {
        month: "short"
    })} ’${String(d.getFullYear()).slice(-2)}`;
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


/* =========================================================
   Toasts
========================================================= */

function initToasts() {
    if (!window.FLASH_MESSAGES?.length) return;

    window.FLASH_MESSAGES.forEach(([type, message]) => {
        showToast(message, type);
    });
}
