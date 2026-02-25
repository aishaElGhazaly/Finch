document.addEventListener("DOMContentLoaded", () => {

    initVisibilityHandling();

    startLiveUpdates();
});


/* =====================================================
   Config
===================================================== */

const POLL_INTERVAL = 60_000;

const FINTECH_PALETTE = [
    "#1E2F3F", // Midnight Blue (anchor)
    "#2F4B63", // Dark Steel
    "#3C5A73", // Steel Blue (core)
    "#5F7D94", // Slate Blue
    "#8FA9BC", // Soft Blue
    "#B7C9D3", // Mist Blue (core)
    "#D9E6EE"  // Powder Blue (fade)
];



/* =====================================================
   State
===================================================== */

let pollTimer = null;


/* =====================================================
   Live Updates
===================================================== */

function startLiveUpdates() {

    if (pollTimer) clearInterval(pollTimer);


    const refresh = async () => {

        try {

            const res =
                await fetch("/snapshots");

            if (!res.ok) return;


            const data = await res.json();

            if (!data.summary) return;


            updateSummaryCards(data.summary);
            updateCharts(data.allocation);
            updateMovers(data.movers);

        } catch (err) {

            console.error(
                "Dashboard update failed:",
                err
            );
        }
    };


    refresh();

    pollTimer =
        setInterval(refresh, POLL_INTERVAL);
}


/* =====================================================
   Summary Cards
===================================================== */

function updateSummaryCards(s) {

    updateCard("card-value", "value", s.portfolio_value);
    updateCard("card-cash", "cash", s.cash);


    /* Total P/L */

    const plEl =
        document.getElementById("card-unrealized");

    if (plEl) {

        plEl.innerHTML =
            `${formatPL(s.unrealized)}
             <span class="card-pct">
                (${formatPct(s.unrealized_pct)})
             </span>`;

        plEl.classList.toggle("text-success", s.unrealized > 0);
        plEl.classList.toggle("text-danger", s.unrealized < 0);

        flash(plEl, s.unrealized);
    }


    /* Today */

    const dayEl =
        document.getElementById("card-today");

    if (dayEl) {

        dayEl.innerHTML =
            `${formatPL(s.today_pl)}
             <span class="card-pct">
                (${formatPct(s.today_pct)})
             </span>`;

        dayEl.classList.toggle("text-success", s.today_pl > 0);
        dayEl.classList.toggle("text-danger", s.today_pl < 0);

        flash(dayEl, s.today_pl);
    }
}


function updateCard(id, key, val) {

    const el = document.getElementById(id);

    if (!el) return;


    const old =
        parseFloat(el.dataset[key]) || 0;


    if (old === val) return;


    el.dataset[key] = val;

    el.textContent = formatUSD(val);


    flash(el, val - old);
}


/* =====================================================
   Charts (Donut)
===================================================== */

let assetChart = null;
let sectorChart = null;


function updateCharts(allocation) {

    if (!allocation) return;


    renderAssetChart(allocation.assets);
    renderSectorChart(allocation.sectors);
}


function renderAssetChart(data) {

    const ctx =
        document.getElementById("assetChart");

    if (!ctx) return;


    const labels = ["Equity", "Cash"];

    const values = [
        data.equity,
        data.cash
    ];


    if (assetChart) {

        assetChart.data.datasets[0].data = values;
        assetChart.update();
        return;
    }


    assetChart = new Chart(ctx, {

        type: "doughnut",

        data: {

            labels,

            datasets: [{
                data: values,
                backgroundColor: [
                    FINTECH_PALETTE[2], // Steel Blue (Equity)
                    FINTECH_PALETTE[5]  // Mist Blue (Cash)
                ],
                borderWidth: 1,
                borderColor: "rgba(60,90,115,0.15)"
            }]
        },

        options: chartOptions()
    });
}


function renderSectorChart(data) {

    const ctx =
        document.getElementById("sectorChart");

    if (!ctx) return;


    if (!data || Object.keys(data).length === 0) {

        const container = document
            .getElementById("sectorChart")
            ?.parentElement;

        if (container) {
            renderEmptyState(container,
                "Add holdings to view sector exposure."
            );
        }

        return;
    }

    // Convert object to sorted arrays matching backend order
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);


    if (sectorChart) {

        sectorChart.data.labels = labels;
        sectorChart.data.datasets[0].data = values;

        // Re-assign colors on update too
        sectorChart.data.datasets[0].backgroundColor =
            paletteFromData(values);

        sectorChart.update();
        return;
    }


    sectorChart = new Chart(ctx, {

        type: "doughnut",

        data: {

            labels,

            datasets: [{
                data: values,
                backgroundColor: paletteFromData(values),
                borderWidth: 1,
                borderColor: "rgba(60,90,115,0.15)"
            }]
        },

        options: chartOptions()
    });
}


function chartOptions() {

    return {

        responsive: true,
        maintainAspectRatio: false,

        cutout: "70%",

        plugins: {

            legend: {
                position: "bottom",
                labels: {
                    padding: 12,
                    font: {
                        size: 12
                    }
                }
            },

            tooltip: {
                callbacks: {
                    label: ctx =>
                        `${ctx.label}: ${ctx.parsed.toFixed(1)}%`
                }
            }
        }
    };
}


function paletteFromData(values) {

    const colors = [...FINTECH_PALETTE]
        .sort((a, b) => luminance(a) - luminance(b)); // dark → light

    // Pair values with original index
    const items = values.map((v, i) => ({
        value: v,
        index: i
    }));

    // Sort biggest → smallest
    items.sort((a, b) => b.value - a.value);

    // Pick evenly spaced colors
    const step = (colors.length - 1) / (items.length - 1 || 1);

    const assigned = new Array(values.length);

    items.forEach((item, i) => {

        const colorIndex =
            Math.round(i * step);

        assigned[item.index] =
            colors[colorIndex];
    });

    return assigned;
}


/* =====================================================
   Movers
===================================================== */

function updateMovers(movers) {

    if (!movers) return;

    renderMoverList("gainers-list", movers.gainers,
        "Add more holdings to see top gainers."
    );

    renderMoverList("losers-list", movers.losers,
        "Add more holdings to see top losers."
    );

    renderMoverList("watchlist-list", movers.watchlist,
        "Your watchlist is empty."
    );
}


function renderMoverList(containerId, items, emptyMessage) {

    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = "";

    if (!items || !items.length) {
        renderEmptyState(el, emptyMessage);
        return;
    }

    items.forEach(m => {

        el.innerHTML += `
        <div class="d-flex justify-content-between align-items-center py-2 mover-row clickable-row"
             data-symbol="${m.symbol}">

            <div class="d-flex align-items-center gap-3">

                <img
                    src="https://img.logo.dev/ticker/${m.symbol}?token=pk_StdhioHKQAapZCwTkZ1bgA"
                    alt="${m.symbol}"
                    class="rounded-circle flex-shrink-0"
                    style="width:32px;height:32px;object-fit:fill;"
                    loading="lazy"
                    onerror="this.style.display='none'"
                >

                <div>
                    <div class="fw-semibold">${m.symbol}</div>
                    <div class="small text-muted">${formatUSD(m.price)}</div>
                </div>
            </div>

            <div class="${m.change_pct >= 0 ? "text-success" : "text-danger"} fw-semibold">
                ${formatPct(m.change_pct)}
            </div>
        </div>
    `;
    });
    
}


document.addEventListener("click", e => {

    const row = e.target.closest(".mover-row");
    if (!row) return;

    window.location.href =
        `/stock/${row.dataset.symbol}`;
});


/* =====================================================
   Flash
===================================================== */

function flash(el, delta) {

    el.classList.remove("flash-up", "flash-down");

    void el.offsetWidth;

    el.classList.add(
        delta >= 0 ? "flash-up" : "flash-down"
    );


    setTimeout(() => {

        el.classList.remove(
            "flash-up",
            "flash-down"
        );

    }, 900);
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

function renderEmptyState(container, message) {

    if (!container) return;

    container.innerHTML = `
        <div class="d-flex align-items-center justify-content-center h-100"
             style="min-height: 220px; text-align: center;">
            <div class="text-muted small">
                ${message}
            </div>
        </div>
    `;
}

function luminance(hex) {

    const c = hex.substring(1);
    const rgb = parseInt(c, 16);

    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
