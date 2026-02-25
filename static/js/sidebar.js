export function createTradeSidebar(side, balance) {

    // ---------- CONFIG & BASIC HELPERS ----------
    const prefix = side.toLowerCase();
    const isBuy = prefix === "buy";
    const $ = id => document.getElementById(`${prefix}${id}`);
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const roundMoney = v => Math.round(v * 100) / 100;

    const STEP_SHARES = 1;
    const STEP_PRICE = 0.01;

    const SUBMIT_COOLDOWN_MS = 3000;

    let isTypingCash = false;

    // ---------- DOM ELEMENT REFERENCES ----------

    // --- Sidebar + Order Type ---
    const sidebar = $(`Sidebar`);
    const orderType = $(`OrderTypeSelect`);
    const marketSection = $(`MarketOrderSection`);
    const limitSection = $(`LimitOrderSection`);
    const form = document.getElementById(`${prefix}Form`);

    // --- Market Order Elements ---
    const sharesRadio = $(`InShares`);
    const cashRadio = $(`InCash`);

    const sharesInput = $(`MarketSharesInput`);
    const cashInput = $(`MarketCashInput`);

    const sharesGroup = $(`MarketSharesGroup`);
    const cashGroup = $(`MarketCashGroup`);

    const sharesSummaryBox = $(`MarketSharesSummary`);
    const cashSummaryBox = $(`MarketCashSummary`);

    // --- Market Summary Elements ---
    const summaryShares = $(`MarketSummaryShares`);
    const summaryTotal = $(`MarketSummaryTotal`);
    const summaryPrice = $(`MarketSummaryPrice`);

    const cashSummaryPrice = $(`MarketCashSummaryPrice`);
    const cashSummaryTotal = $(`MarketCashSummaryTotal`);
    const cashSummaryShares = $(`MarketCashSummaryShares`);

    // --- Limit Order Elements ---
    const limitQtyInput = $(`LimitQuantityInput`);
    const limitPriceInput = $(`LimitPriceInput`);

    const limitSummaryShares = $(`LimitSummaryShares`);
    const limitSummaryPrice = $(`LimitSummaryPrice`);
    const limitSummaryTotal = $(`LimitSummaryTotal`);

    // --- Buttons ---
    const confirmButton = document.getElementById(isBuy ? "confirmBuyOrderBtn" : "confirmSellOrderBtn");

    // --- Hidden Inputs ---
    const orderTypeInput = document.getElementById(`${prefix}OrderTypeInput`);
    const sharesHiddenInput = document.getElementById(`${prefix}SharesInput`);
    const limitPriceHiddenInput = document.getElementById(`${prefix}LimitPriceHiddenInput`);


    // ---------- UTILITY HELPERS ----------
    // Read live price on-demand
    const getUnitPrice = () => Number(TRADE_DATA.unitPrice) || 0;

    // Format money
    function usd(value) {
        return `$${Number(value).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    const readInt = value => Math.floor(parseFloat(value) || 0);

    const getMaxShares = () => {
        const price = getUnitPrice();
        if (!isBuy) return Math.floor(balance);
        return price > 0 ? Math.floor(balance / price) : 0;
    };

    const getSharesFromCash = cash => {
        const price = getUnitPrice();
        return price > 0 ? Math.floor(cash / price) : 0;
    };

    const setupStepButton = (id, inputField, delta, maxGetter, callback) => {
        const button = document.getElementById(id);
        if (!button || !inputField) return;

        button.addEventListener('click', () => {
            const current = delta < 1
                ? parseFloat(inputField.value) || 0
                : readInt(inputField.value);

            const max = typeof maxGetter === "function" ? maxGetter() : maxGetter;
            const rawNext = current + delta;
            const next = delta < 1
                ? roundMoney(clamp(rawNext, 0, max))
                : clamp(rawNext, 0, max);

            inputField.value = next;
            callback();
        });
    }

    const bindInputListener = (inputField, handler) => {
        if (inputField) inputField.addEventListener("input", handler);
    }

    // ---------- CORE LOGIC ----------

    // ---- Validation ----
    function getValidationState() {
        if (!orderType || !orderType.value) return false;
        const type = orderType.value;

        if (type === "market") {
            // ---- SELL (always shares) ----
            if (!isBuy) {
                const shares = readInt(sharesInput.value);
                const maxShares = getMaxShares();
                return shares > 0 && shares <= maxShares;
            }

            // ---- BUY (shares mode) ----
            if (isBuy && sharesRadio && sharesRadio.checked) {
                const shares = readInt(sharesInput.value);
                const maxShares = getMaxShares();
                return shares > 0 && shares <= maxShares;
            }

            // ---- BUY (cash mode) ----
            if (isBuy && cashRadio && cashRadio.checked) {
                const cash = readInt(cashInput.value);
                const maxCash = balance;
                const sharesFromCash = getSharesFromCash(cash)
                return cash > 0 && cash <= maxCash && sharesFromCash >= 1;
            }

        } else if (type === "limit") {
            const qty = readInt(limitQtyInput.value);
            const price = roundMoney(parseFloat(limitPriceInput.value) || 0);
            if (qty <= 0 || price <= 0) return false;
            return isBuy ? roundMoney(qty * price) <= balance : qty <= getMaxShares();
        }

        return false;
    }

    function validate() {
        if (confirmButton) confirmButton.disabled = !getValidationState();
    }

    // ---- Market Summary ----
    function updateMarketSummary() {
        if (!sharesInput) return;

        // --- Shares Mode ---
        const rawShares = parseFloat(sharesInput.value);
        const maxShares = getMaxShares();

        const clampedShares = clamp(readInt(sharesInput.value), 0, maxShares);
        sharesInput.value = clampedShares;

        if (summaryPrice) summaryPrice.textContent = `${usd(getUnitPrice())}`;
        if (summaryShares) summaryShares.textContent = clampedShares.toFixed(0);
        if (summaryTotal) summaryTotal.textContent = `${usd(clampedShares * getUnitPrice())}`;

        // --- Buy-only Cash Mode ---
        if (isBuy && cashInput) {
            const rawCash = parseFloat(cashInput.value);
            const maxCash = balance;
            const clampedCash = clamp(readInt(cashInput.value), 0, maxCash);

            const price = getUnitPrice();
            const sharesFromCash = getSharesFromCash(clampedCash);
            const cashResult = sharesFromCash * price;

            if (!isTypingCash) {
                cashInput.value = roundMoney(cashResult).toFixed(2);
            }

            if (cashSummaryPrice) cashSummaryPrice.textContent = `${usd(getUnitPrice())}`;
            if (cashSummaryTotal) cashSummaryTotal.textContent = `${usd(cashResult)}`;
            if (cashSummaryShares) cashSummaryShares.textContent = sharesFromCash.toFixed(0);
        }

        validate();
    }

    // ---- Limit Summary ----
    function updateLimitSummary() {
        if (!limitQtyInput || !limitPriceInput) return;

        const qty = readInt(limitQtyInput.value);
        const price = roundMoney(parseFloat(limitPriceInput.value) || 0);

        const maxLimitQty = isBuy ? (price > 0 ? Math.floor(balance / price) : 0) : getMaxShares();
        const clampedQty = clamp(qty, 0, maxLimitQty);

        limitQtyInput.value = clampedQty;

        if (limitSummaryShares) limitSummaryShares.textContent = clampedQty.toFixed(0);
        if (limitSummaryPrice) limitSummaryPrice.textContent = `${usd(price)}`;
        if (limitSummaryTotal) limitSummaryTotal.textContent = `${usd(clampedQty * price)}`;

        validate();
    }

    // ---- Refresh All ----
    function refreshAll() {
        updateMarketSummary();
        updateLimitSummary();
        validate();
    }

    // ---- Reset Logic ----
    function resetMarketInputs() {
        if (sharesInput) sharesInput.value = 0;
        if (cashInput) cashInput.value = 0;
    }

    function resetLimitInputs() {
        if (limitQtyInput) limitQtyInput.value = 0;
        if (limitPriceInput) limitPriceInput.value = getUnitPrice();
    }

    function resetSidebar() {
        if (orderType) orderType.value = "";
        if (marketSection) marketSection.classList.add("d-none");
        if (limitSection) limitSection.classList.add("d-none");

        if (sharesRadio) sharesRadio.checked = true;
        if (cashRadio) cashRadio.checked = false;

        resetMarketInputs();
        resetLimitInputs();

        toggleMarketMode();
        refreshAll();
    }

    // ---- Confirm Order ----
    if (confirmButton) {
        confirmButton.addEventListener("click", () => {
            const type = orderType.value;
            if (!type) return;

            orderTypeInput.value = type;

            // --- MARKET ---
            if (type === "market") {
                if (isBuy) {
                    if (sharesRadio.checked) {
                        sharesHiddenInput.value = readInt(sharesInput.value);
                    } else {
                        const cashVal = readInt(cashInput.value);
                        sharesHiddenInput.value = getSharesFromCash(cashVal);
                    }
                } else {
                    sharesHiddenInput.value = readInt(sharesInput.value);
                }
            }

            // --- LIMIT ---
            if (type === "limit") {
                sharesHiddenInput.value = readInt(limitQtyInput.value);
                limitPriceHiddenInput.value = roundMoney(parseFloat(limitPriceInput.value));
            }

            // Disable *after* browser begins navigating
            confirmButton.disabled = true;
            confirmButton.textContent = "Processing…";
            form.submit();

            // Keep disabled for 3 seconds to match Flask rate limit
            setTimeout(() => {
                confirmButton.disabled = true;
            }, SUBMIT_COOLDOWN_MS);
        });
    }


    // ---------- EVENT HANDLERS ----------

    // ---- Order Type Switch ----
    if (orderType) {
        orderType.addEventListener('change', () => {
            const isMarket = orderType.value === "market";
            marketSection.classList.toggle('d-none', !isMarket);
            limitSection.classList.toggle('d-none', isMarket);

            if (isMarket) resetLimitInputs();
            else resetMarketInputs();

            refreshAll();
        });
    }

    // ---- Market Mode Switch ----
    function toggleMarketMode() {
        if (!isBuy) {
            // For Sell, always use shares mode
            sharesGroup?.classList.remove('d-none');
            sharesSummaryBox?.classList.remove('d-none');
            if (cashGroup) cashGroup.classList.add('d-none');
            if (cashSummaryBox) cashSummaryBox.classList.add('d-none');
            refreshAll();
            return;
        }

        const usingShares = sharesRadio && sharesRadio.checked;

        sharesGroup?.classList.toggle('d-none', !usingShares);
        sharesSummaryBox?.classList.toggle('d-none', !usingShares);

        cashGroup?.classList.toggle('d-none', usingShares);
        cashSummaryBox?.classList.toggle('d-none', usingShares);

        if (usingShares) cashInput.value = 0;
        else sharesInput.value = 0;

        refreshAll();
    }

    if (sharesRadio) sharesRadio.addEventListener('change', toggleMarketMode);
    if (cashRadio) cashRadio.addEventListener('change', toggleMarketMode);

    // ---- Step Buttons ----
    setupStepButton(`${prefix}MarketSharesPlusBtn`, sharesInput, STEP_SHARES, getMaxShares, updateMarketSummary);
    setupStepButton(`${prefix}MarketSharesMinusBtn`, sharesInput, -STEP_SHARES, getMaxShares, updateMarketSummary);
    const sharesMaxBtn = $(`MarketSharesMaxBtn`);
    if (sharesMaxBtn && sharesInput) sharesMaxBtn.addEventListener("click", () => {
        sharesInput.value = getMaxShares();
        updateMarketSummary();
    });

    const cashMaxBtn = $(`MarketCashMaxBtn`);
    if (cashMaxBtn && cashInput) cashMaxBtn.addEventListener("click", () => {
        isTypingCash = false;
        cashInput.value = balance;
        updateMarketSummary();
    });

    setupStepButton(`${prefix}LimitQuantityPlusBtn`, limitQtyInput, STEP_SHARES, () => Infinity, updateLimitSummary);
    setupStepButton(`${prefix}LimitQuantityMinusBtn`, limitQtyInput, -STEP_SHARES, () => Infinity, updateLimitSummary);
    setupStepButton(`${prefix}LimitPricePlusBtn`, limitPriceInput, STEP_PRICE, () => Infinity, updateLimitSummary);
    setupStepButton(`${prefix}LimitPriceMinusBtn`, limitPriceInput, -STEP_PRICE, () => Infinity, updateLimitSummary);

    const limitQtyMaxBtn = $(`LimitQuantityMaxBtn`);
    if (limitQtyMaxBtn && limitQtyInput) {
        limitQtyMaxBtn.addEventListener("click", () => {
            const price = roundMoney(parseFloat(limitPriceInput.value) || 0);
            const maxQty = isBuy ?
                (price > 0 ? Math.floor(balance / price) : 0) :
                getMaxShares();


            limitQtyInput.value = maxQty;
            updateLimitSummary();
        });
    }

    const limitPriceMktBtn = $(`LimitPriceMktBtn`);
    if (limitPriceMktBtn && limitPriceInput) limitPriceMktBtn.addEventListener("click", () => {
        limitPriceInput.value = getUnitPrice();
        updateLimitSummary();
    });

    // ---- Sidebar Show/Hide ----
    if (sidebar) {
        sidebar.addEventListener("show.bs.offcanvas", resetSidebar);
        sidebar.addEventListener("hidden.bs.offcanvas", resetSidebar);
    }

    // ---- Input Listeners ----
    bindInputListener(sharesInput, () => {
        const val = parseFloat(sharesInput.value);
        if (isNaN(val) || val < 0) sharesInput.value = 0;
        updateMarketSummary();
    });

    bindInputListener(cashInput, () => {
        isTypingCash = true;

        let val = parseFloat(cashInput.value);

        if (isNaN(val) || val < 0) {
            cashInput.value = "0.00";
        } else if (val > balance) {
            // HARD CAP during typing, no formatting
            cashInput.value = balance.toString();
        }

        updateMarketSummary();
    });

    bindInputListener(limitQtyInput, () => {
        const val = parseFloat(limitQtyInput.value);
        if (isNaN(val) || val < 0) limitQtyInput.value = 0;
        updateLimitSummary();
    });

    bindInputListener(limitPriceInput, () => {
        const val = parseFloat(limitPriceInput.value);
        if (isNaN(val) || val < 0) limitPriceInput.value = 0;
        updateLimitSummary();
    });

    // When global unit price changes, refresh this sidebar
    document.addEventListener('unitPriceUpdated', () => {
        // refreshAll is in scope inside createTradeSidebar
        try {
            refreshAll();
        } catch (e) {
            /* ignore */
        }
    });

    // ---------- Initialize ----------
    resetSidebar();

}
