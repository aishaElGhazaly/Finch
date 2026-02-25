document.addEventListener("DOMContentLoaded", () => {
    initSearch();
    initStatusFilters();
    initPagination();
    initModal();

    applyFilters();
});


/* =========================================================
   Config
   ========================================================= */

const PAGE_SIZE = 15;


/* =========================================================
   State
   ========================================================= */

let allOrders = window.ORDER_DATA || [];
let filteredOrders = [...allOrders];

let currentPage = 1;
let activeStatus = "ALL";

let currentOrderId = null;
let cancelModal = null;


/* =========================================================
   Elements
   ========================================================= */

const tableBody = document.getElementById("ordersTableBody");
const mobileList = document.getElementById("ordersMobileList");
const pagination = document.getElementById("ordersPagination");

const searchInput = document.getElementById("orderSearch");
const statusContainer = document.getElementById("orderStatusFilters");

const modalEl = document.getElementById("cancelOrderModal");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");


/* =========================================================
   Init
   ========================================================= */

function initSearch() {
    searchInput?.addEventListener("input", () => {
        currentPage = 1;
        applyFilters();
    });
}


function initStatusFilters() {
    if (!statusContainer) return;

    // NOTE: PROCESSING intentionally hidden
    const statuses = ["FILLED", "PENDING", "CANCELLED"];


    function chip(label) {
        const btn = document.createElement("button");

        btn.className =
            "btn btn-sm btn-outline-dark rounded-pill";

        btn.textContent = label;


        btn.onclick = () => {
            activeStatus = label;

            statusContainer
                .querySelectorAll("button")
                .forEach(b => b.classList.remove("active"));

            btn.classList.add("active");

            currentPage = 1;
            applyFilters();
        };

        statusContainer.appendChild(btn);
    }


    chip("ALL");
    statuses.forEach(chip);

    statusContainer
        .querySelector("button")
        ?.classList.add("active");
}


function initPagination() {
    pagination.addEventListener("click", e => {
        const btn = e.target.closest("[data-page]");
        if (!btn) return;

        currentPage = Number(btn.dataset.page);
        render();
    });
}


function initModal() {
    if (!modalEl || typeof bootstrap === "undefined") return;

    cancelModal = new bootstrap.Modal(modalEl);

    confirmCancelBtn?.addEventListener("click", async () => {
        if (!currentOrderId) return;
        await doCancel(currentOrderId);
    });
}


/* =========================================================
   Filtering
   ========================================================= */

function applyFilters() {
    const q = (searchInput?.value || "").toLowerCase();


    filteredOrders = allOrders.filter(o => {
        const matchesSearch =
            o.symbol.toLowerCase().startsWith(q);

        const matchesStatus =
            activeStatus === "ALL" ||
            o.status === activeStatus;

        return matchesSearch && matchesStatus;
    });


    render();
}


/* =========================================================
   Rendering
   ========================================================= */

function render() {
    renderTable();
    renderMobile();
    renderPagination();
}


function renderTable() {
    if (!tableBody) return;

    tableBody.innerHTML = "";

    const start = (currentPage - 1) * PAGE_SIZE;

    const pageItems =
        filteredOrders.slice(start, start + PAGE_SIZE);


    for (const o of pageItems) {
        const tr = document.createElement("tr");

        const total = orderTotal(o);

        tr.innerHTML = `
            <!-- Placed -->
            <td>
                ${formatDate(o.created_at)}
            </td>

            <!-- Filled Date -->
            <td class="d-none d-lg-table-cell">
                ${o.filled_at
                    ? formatDate(o.filled_at)
                    : "—"}
            </td>

            <!-- Stock -->
            <td>
                <a
                    href="/stock/${o.symbol}"
                    class="fw-semibold trade-link"
                >
                    ${o.symbol}
                </a>
            </td>

            <!-- Side -->
            <td>
                <span class="fw-semibold">
                    ${o.order_type}
                </span>
            </td>

            <!-- Shares -->
            <td class="d-none d-sm-table-cell">
                ${o.shares}
            </td>

            <!-- Limit -->
            <td class="d-none d-md-table-cell">
                ${usd(o.limit_price)}
            </td>

            <!-- Filled Price -->
            <td class="d-none d-lg-table-cell">
                ${o.filled_price
                    ? usd(o.filled_price)
                    : "—"}
            </td>

            <!-- Total -->
            <td>
                ${usd(total)}
            </td>

            <!-- Status -->
            <td>
                ${renderStatus(o)}
            </td>

            <!-- Actions -->
            <td>
                ${o.status === "PENDING"
                    ? `
                        <button
                            class="btn btn-sm btn-outline-danger cancel-btn"
                            data-id="${o.id}">
                            Cancel
                        </button>
                      `
                    : `<span class="text-muted">—</span>`
                }
            </td>
        `;

        tableBody.appendChild(tr);
    }
}


function renderMobile() {
    if (!mobileList) return;

    mobileList.innerHTML = "";

    const start = (currentPage - 1) * PAGE_SIZE;

    const pageItems =
        filteredOrders.slice(start, start + PAGE_SIZE);


    for (const o of pageItems) {
        const card = document.createElement("div");

        const total = orderTotal(o);

        card.className =
            "card mb-2 shadow-sm rounded-3";


        card.innerHTML = `
            <div class="card-body py-3 px-3">

                <div
                    class="d-flex justify-content-between mb-2"
                >
                    <span class="fw-semibold">
                        ${o.symbol}
                    </span>

                    ${renderStatus(o)}
                </div>


                <div class="text-muted small mb-1">
                    ${o.order_type} · ${o.shares} shares
                </div>


                <div class="text-muted small mb-1">
                    Limit: ${usd(o.limit_price)}
                </div>


                ${o.filled_price
                    ? `
                        <div class="text-muted small mb-1">
                            Filled @ ${usd(o.filled_price)}
                        </div>
                      `
                    : ""
                }


                <div class="text-muted small mb-1">
                    Total: ${usd(total)}
                </div>


                <div class="text-muted small mb-1">
                    Placed: ${formatDate(o.created_at)}
                </div>


                ${o.filled_at
                    ? `
                        <div class="text-muted small mb-2">
                            Filled: ${formatDate(o.filled_at)}
                        </div>
                      `
                    : ""
                }


                ${o.status === "PENDING"
                    ? `
                        <button
                            class="btn btn-outline-danger btn-sm w-100 cancel-btn"
                            data-id="${o.id}">
                            Cancel Order
                        </button>
                      `
                    : ""
                }

            </div>
        `;

        mobileList.appendChild(card);
    }
}


/* =========================================================
   Pagination
   ========================================================= */

function renderPagination() {
    pagination.innerHTML = "";

    const totalPages =
        Math.ceil(filteredOrders.length / PAGE_SIZE);

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

        li.innerHTML =
            `<button class="page-link">${label}</button>`;


        if (!disabled && !active && page) {
            li.onclick = () => {
                currentPage = page;
                render();
            };
        }

        pagination.appendChild(li);
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
   Cancel
   ========================================================= */

document.addEventListener("click", e => {
    const btn = e.target.closest(".cancel-btn");
    if (!btn) return;

    currentOrderId = btn.dataset.id;


    if (cancelModal) {
        cancelModal.show();
        return;
    }


    if (confirm("Cancel this order?")) {
        doCancel(currentOrderId);
    }
});


async function doCancel(orderId) {
    try {
        const csrf =
            document
                .querySelector('meta[name="csrf-token"]')
                ?.content;


        const res = await fetch(
            `/orders/${orderId}/cancel`,
            {
                method: "POST",
                headers: csrf
                    ? { "X-CSRFToken": csrf }
                    : {}
            }
        );


        if (!res.ok) {
            alert("Cancel failed.");
            return;
        }


        allOrders = allOrders.map(o =>
            o.id == orderId
                ? {
                    ...o,
                    status: "CANCELLED",
                    filled_at: null,
                    filled_price: null,
                    filled_total: 0
                }
                : o
        );


        if (cancelModal) cancelModal.hide();

        applyFilters();

    } catch (err) {
        console.error(err);
        alert("Network error.");
    }
}


/* =========================================================
   Utils
   ========================================================= */

function orderTotal(o) {
    if (o.status === "FILLED") {
        return o.filled_total;
    }

    if (o.status === "PENDING" || o.status === "PROCESSING") {
        return o.reserved_total;
    }

    return 0;
}


function renderStatus(o) {
    let cls = "secondary";

    if (o.status === "FILLED") cls = "success";
    else if (o.status === "PENDING") cls = "warning";
    else if (o.status === "PROCESSING") cls = "primary";
    else if (o.status === "CANCELLED") cls = "secondary";

    return `
        <span class="badge bg-${cls}">
            ${o.status}
        </span>
    `;
}


function usd(v) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    }).format(v || 0);
}


function formatDate(ts) {
    if (!ts) return "—";

    const p = ts.split(/[- :]/);

    const d = new Date(Date.UTC(
        p[0],
        p[1] - 1,
        p[2],
        p[3] || 0,
        p[4] || 0,
        p[5] || 0
    ));


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
