document.addEventListener("DOMContentLoaded", () => {

    initRows();
    initSearch();
    initSectorFilters();
    initSorting();
    initRowNavigation();
    initVisibilityHandling();

    // Default sort: Market Value ↓
    activeSortField = "value";
    activeSortDir = "desc";

    sortRows();
    updateCount();

    startLiveUpdates();
});


/* =====================================================
   Config
===================================================== */

const POLL_INTERVAL = 60_000;


/* =====================================================
   State
===================================================== */

let rows = [];
let rowGroups = {};


function initRows() {

    const allRows =
        [...document.querySelectorAll(".clickable-row")];

    allRows.forEach(row => {

        const s = row.dataset.symbol;

        if (!rowGroups[s]) {
            rowGroups[s] = [];
            rows.push(row);
        }

        rowGroups[s].push(row);
    });
}


let activeSector = "ALL";

let activeSortField = null;
let activeSortDir = null;

let pollTimer = null;


/* =====================================================
   Elements
===================================================== */

const searchInput = document.getElementById("hSearch");
const sectorContainer = document.getElementById("hSectorFilters");


/* =====================================================
   Search / Filter
===================================================== */

function initSearch() {
    searchInput?.addEventListener("input", applyFilters);
}


function initSectorFilters() {

    if (!sectorContainer) return;

    const sectors = [
        ...new Set(
            rows
                .map(r => r.dataset.sector)
                .filter(Boolean)
        )
    ].sort();


    function chip(label) {

        const btn = document.createElement("button");

        btn.className =
            "btn btn-sm btn-outline-dark rounded-pill";

        btn.textContent = label;


        btn.onclick = () => {

            activeSector = label;

            sectorContainer
                .querySelectorAll("button")
                .forEach(b =>
                    b.classList.remove("active")
                );

            btn.classList.add("active");

            applyFilters();
        };


        sectorContainer.appendChild(btn);
    }


    chip("ALL");
    sectors.forEach(chip);

    sectorContainer
        .querySelector("button")
        ?.classList.add("active");
}


/* =====================================================
   Count
===================================================== */

function updateCount() {

    const symbols = new Set();

    rows.forEach(r => {

        if (r.style.display !== "none") {
            symbols.add(r.dataset.symbol);
        }
    });


    const el = document.getElementById("hCount");

    if (el) el.textContent = symbols.size;
}


/* =====================================================
   Filtering
===================================================== */

function applyFilters() {

    const q =
        (searchInput?.value || "")
            .toLowerCase()
            .trim();


    rows.forEach(row => {

        const matchesSearch =
            row.dataset.symbol
                .toLowerCase()
                .startsWith(q) ||

            row.dataset.name
                .startsWith(q);


        const matchesSector =
            activeSector === "ALL" ||
            row.dataset.sector === activeSector;


        rowGroups[row.dataset.symbol]
            .forEach(r => {
                r.style.display =
                    matchesSearch && matchesSector
                        ? ""
                        : "none";
            });

    });


    updateCount();
}


/* =====================================================
   Sorting
===================================================== */

function initSorting() {

    document
        .querySelectorAll("th.sortable")
        .forEach(th => {

            th.addEventListener("click", () => {

                const field =
                    th.dataset.sort;

                if (!field) return;


                activeSortDir =
                    activeSortField === field &&
                        activeSortDir === "desc"
                        ? "asc"
                        : "desc";


                activeSortField = field;


                document
                    .querySelectorAll(".sort-indicator")
                    .forEach(i =>
                        i.textContent = ""
                    );


                const indicator =
                    th.querySelector(
                        ".sort-indicator"
                    );


                if (indicator) {

                    indicator.textContent =
                        activeSortDir === "asc"
                            ? "▲"
                            : "▼";
                }


                sortRows();
                updateCount();
            });
        });
}


function sortRows() {

    if (!activeSortField) return;


    const map = {
        shares: "shares",
        avg: "avg",
        price: "price",
        value: "value",
        pl: "pl",
        day: "day",
        weight: "weight"
    };


    const key = map[activeSortField];


    rows.sort((a, b) => {

        const A =
            parseFloat(a.dataset[key]) || 0;

        const B =
            parseFloat(b.dataset[key]) || 0;


        return activeSortDir === "asc"
            ? A - B
            : B - A;
    });


    rows.forEach(r => {

        rowGroups[r.dataset.symbol]
            .forEach(x =>
                x.parentNode.appendChild(x)
            );
    });

}


/* =====================================================
   Live Updates
===================================================== */

function startLiveUpdates() {

    if (pollTimer) clearInterval(pollTimer);


    const refresh = async () => {

        try {

            const res =
                await fetch("/holdings/snapshots");

            if (!res.ok) return;


            const data = await res.json();

            if (!data.positions) return;

            Object.entries(data.positions).forEach(
                ([symbol, snap]) => {
                    updateRow(symbol, snap);
                }
            );

            updateSummaryCards(data);

            sortRows();
            updateCount();

        } catch (err) {

            console.error(
                "Holdings update failed:",
                err
            );
        }
    };


    refresh();

    pollTimer =
        setInterval(refresh, POLL_INTERVAL);
}


/* =====================================================
   Update Rows
===================================================== */

function updateRow(symbol, snap) {

    rowGroups[symbol]?.forEach(row => {

        row.dataset.price = snap.price;
        row.dataset.value = snap.market_value;
        row.dataset.pl = snap.unrealized_pl;
        row.dataset.day = snap.today_pl;
        row.dataset.weight = snap.weight_pct;


        animateValue(
            row,
            "price",
            snap.price,
            formatUSD
        );


        animateValue(
            row,
            "value",
            snap.market_value,
            formatUSD
        );


        animatePL(row, snap.unrealized_pl, snap.unrealized_pct);

        animateDay(row, snap.today_pl, snap.today_pct);


        updateWeight(row, snap.weight_pct);
    });
}


/* =====================================================
   Summary Cards
===================================================== */

function updateSummaryCards(payload) {

    const s = payload.summary;

    if (!s) return;


    /* Portfolio Value */

    const valueEl = document.getElementById("card-value");

    if (valueEl) {
        valueEl.textContent = formatUSD(s.portfolio_value);
    }


    /* Total P/L */

    const plEl = document.getElementById("card-unrealized");

    if (plEl) {

        plEl.innerHTML =
            `${formatPL(s.unrealized)} <span class="card-pct">(${formatPct(s.unrealized_pct)})</span>`;

        plEl.classList.toggle("text-success", s.unrealized > 0);
        plEl.classList.toggle("text-danger", s.unrealized < 0);
    }


    /* Today */

    const dayEl = document.getElementById("card-today");

    if (dayEl) {

        dayEl.innerHTML =
            `${formatPL(s.today_pl)} <span class="card-pct">(${formatPct(s.today_pct)})</span>`;

        dayEl.classList.toggle("text-success", s.today_pl > 0);
        dayEl.classList.toggle("text-danger", s.today_pl < 0);
    }
}


/* =====================================================
   Animations
===================================================== */

function animateValue(row, key, val, formatter) {

    const old =
        parseFloat(row.dataset[key]) || 0;

    if (old === val) return;


    row.dataset[key] = val;


    const el =
        row.querySelector(
            `[data-${key}-cell]`
        );

    if (!el) return;


    el.textContent = formatter(val);


    flash(
        row,
        val > old ? "up" : "down"
    );
}


/* ============================
   Total P/L
============================ */

function animatePL(row, pl, pct) {

    const el =
        row.querySelector(".data-pl-cell");

    if (!el) return;


    el.textContent =
        `${formatPL(pl)} (${formatPct(pct)})`;


    el.classList.toggle("text-success", pl > 0);
    el.classList.toggle("text-danger", pl < 0);
}


/* ============================
   Day Change
============================ */

function animateDay(row, dayPL, pct) {

    const el =
        row.querySelector(".data-day-cell");

    if (!el) return;


    el.textContent =
        `${formatPL(dayPL)} (${formatPct(pct)})`;


    el.classList.toggle("text-success", dayPL > 0);
    el.classList.toggle("text-danger", dayPL < 0);
}


function updateWeight(row, weight) {

    const el =
        row.querySelector("[data-weight-cell]");

    if (!el) return;

    el.textContent = `${weight.toFixed(2)}%`;
}


/* =====================================================
   Flash
===================================================== */

function flash(row, dir) {

    row.classList.remove(
        "flash-up",
        "flash-down"
    );


    void row.offsetWidth;


    row.classList.add(
        dir === "up"
            ? "flash-up"
            : "flash-down"
    );


    setTimeout(() => {

        row.classList.remove(
            "flash-up",
            "flash-down"
        );

    }, 900);
}


/* =====================================================
   Navigation
===================================================== */

function initRowNavigation() {

    document.addEventListener("click", e => {

        const row =
            e.target.closest(".clickable-row");


        if (!row || e.target.closest("button")) {
            return;
        }


        window.location.href =
            `/stock/${row.dataset.symbol}`;
    });
}


/* =====================================================
   Visibility
===================================================== */

function initVisibilityHandling() {

    document.addEventListener(
        "visibilitychange",
        () => {

            if (document.hidden) {

                clearInterval(pollTimer);

            } else {

                startLiveUpdates();
            }
        }
    );
}


/* =====================================================
   Utils
===================================================== */

function formatUSD(v) {

    return new Intl.NumberFormat(
        "en-US",
        {
            style: "currency",
            currency: "USD"
        }
    ).format(v);
}


function formatPL(v) {

    if (v === 0) return formatUSD(0);

    const sign = v > 0 ? "+" : "-";

    return sign + formatUSD(Math.abs(v));
}


function formatPct(v) {

    const sign = v > 0 ? "+" : "";

    return `${sign}${v.toFixed(2)}%`;
}
