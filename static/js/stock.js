import { showToast } from "./toast.js";
import { createTradeSidebar } from "./sidebar.js";


document.addEventListener('DOMContentLoaded', () => {
    initAdvancedChartToggle();
    initWatchlistToggle();
    initTradeSidebars();
    initLivePrice();
    initToasts();
});


function initAdvancedChartToggle() {
    // === Advanced Chart Toggle Logic ===
    const toggle = document.getElementById('viewToggle');
    const overview = document.getElementById('symbol-overview');
    const advanced = document.getElementById('advanced-divs');
    const chartContainer = document.querySelector('#advanced-chart .tradingview-widget-container__widget');

    toggle.checked = false;
    overview.classList.remove('d-none');
    advanced.classList.add('d-none');

    toggle.addEventListener('change', () => {
        if (toggle.checked) {
            overview.classList.add('d-none');
            advanced.classList.remove('d-none');

            reloadAdvancedChart(chartContainer);
        } else {
            advanced.classList.add('d-none');
            overview.classList.remove('d-none');
        }
    });
}


function reloadAdvancedChart(container) {

    if (!container) return;

    // Clear previous widget
    container.innerHTML = "";

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;

    script.innerHTML = JSON.stringify({
        symbol: `${TRADE_DATA.exchange}:${TRADE_DATA.symbol}`,
        theme: "light",
        interval: "1", 
        style: "1",
        locale: "en",
        height: "500"
    });

    container.appendChild(script);
}


function initWatchlistToggle() {
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

    // === Watchlist Toggle Logic ===
    const wlBtn = document.querySelector("#watchlistBtn");
    const wlIcon = document.querySelector("#watchlistIcon");

    if (wlBtn) {
        wlBtn.addEventListener("click", async () => {
            const symbol = wlBtn.dataset.symbol;

            const res = await fetch(`/watchlist/${symbol}`, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken
                }
            });

            const data = await res.json();

            if (data.status === "added") {
                wlIcon.classList.remove("bi-eye");
                wlIcon.classList.add("bi-eye-slash");
            } else if (data.status === "removed") {
                wlIcon.classList.remove("bi-eye-slash");
                wlIcon.classList.add("bi-eye");
            }
        });
    }
}


function initTradeSidebars() {
    createTradeSidebar("buy", TRADE_DATA.buyBalance);
    createTradeSidebar("sell", TRADE_DATA.sellBalance);
}


function startLiveUnitPriceUpdates(symbol) {
    let priceIntervalId;

    async function refresh() {
        try {
            const res = await fetch(`/quote/${symbol}`);
            const data = await res.json();
            if (!data || !data.success) return;

            const newPrice = parseFloat(data.price);
            if (!newPrice || newPrice <= 0) return;

            TRADE_DATA.unitPrice = newPrice;
            document.dispatchEvent(
                new CustomEvent('unitPriceUpdated', {
                    detail: {
                        price: newPrice
                    }
                })
            );
        } catch (e) {
            console.log("Live price update error:", e);
        }
    }

    refresh();
    priceIntervalId = setInterval(refresh, 60000);

    window.addEventListener("beforeunload", () => {
        clearInterval(priceIntervalId);
    });
}


function initLivePrice() {
    if (!TRADE_DATA?.symbol) return;
    startLiveUnitPriceUpdates(TRADE_DATA.symbol);
}


function initToasts() {
    if (!window.FLASH_MESSAGES?.length) return;

    window.FLASH_MESSAGES.forEach(([type, message]) => {
        showToast(message, type);
    });
}
