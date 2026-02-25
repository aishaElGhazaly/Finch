from decimal import Decimal, ROUND_HALF_UP
from utils.helpers import to_decimal
from collections import defaultdict
from datetime import datetime
from blueprints.holdings.services import get_portfolio_overview
from blueprints.cash.services import get_cash_overview
from blueprints.trading.services import get_batch_snapshots
from models.db import get_db


__all__ = [
    "get_greeting",
    "get_dashboard_overview"
]


def _normalize_mover(symbol: str, snap: dict) -> dict:
    return {
        "symbol": symbol,
        "price": snap["price"],
        "change": snap["change"],
        "change_pct": snap["change_pct"],
    }


def get_greeting(first_name: str) -> str:
    hour = datetime.now().hour

    if 5 <= hour < 12:
        t = "morning"
    elif 12 <= hour < 17:
        t = "afternoon"
    else:
        t = "evening"

    return f"Good {t}, {first_name}."


def get_dashboard_overview(*, user_id: int) -> dict:
    """
    Full Dashboard overview.
    """

    # Holdings summary
    portfolio = get_portfolio_overview(user_id=user_id)

    positions = portfolio["positions"]
    summary = portfolio["summary"]

    # Cash
    cash_data = get_cash_overview(user_id=user_id)
    cash_balance = to_decimal(cash_data["balance"])

    # Equity total (invested)
    equity_total = Decimal(str(summary["portfolio_value"]))

    # -----------------------
    # Asset Allocation
    # -----------------------

    total_assets = equity_total + cash_balance

    if total_assets > 0:

        equity_pct = (
            equity_total / total_assets * 100
        ).quantize(Decimal("0.01"), ROUND_HALF_UP)

        cash_pct = (
            cash_balance / total_assets * 100
        ).quantize(Decimal("0.01"), ROUND_HALF_UP)

    else:
        equity_pct = Decimal("0")
        cash_pct = Decimal("0")

    asset_allocation = {
        "equity": float(equity_pct),
        "cash": float(cash_pct),
    }

    # -----------------------
    # Sector Allocation
    # -----------------------

    sector_totals = defaultdict(Decimal)

    for h in positions:
        sector = h.get("sector") or "Other"
        value = to_decimal(h.get("market_value") or 0)
        sector_totals[sector] += value

    # Sort sectors by value (largest first)
    sorted_sectors = sorted(
        sector_totals.items(),
        key=lambda x: x[1],
        reverse=True
    )

    sector_allocation = {}
    running_total = Decimal("0")

    if equity_total > 0:
        # Calculate percentages with residual method to ensure sum = 100%
        for i, (sector, value) in enumerate(sorted_sectors):
            if i < len(sorted_sectors) - 1:
                # Normal calculation for all but last
                pct = (value / equity_total * 100).quantize(
                    Decimal("0.01"),
                    ROUND_HALF_UP
                )
                running_total += pct
            else:
                # Last sector gets remainder to ensure exactly 100%
                pct = (Decimal("100.00") - running_total).quantize(
                    Decimal("0.01")
                )

            # Only include if non-zero
            if pct > 0:
                sector_allocation[sector] = float(pct)

    # -----------------------
    # Movers
    # -----------------------

    # Holdings movers
    valid_positions = [
        p for p in positions
        if p.get("change_pct") is not None
    ]

    gainers = []
    losers = []

    if len(valid_positions) >= 10:

        sorted_up = sorted(
            valid_positions,
            key=lambda x: x["change_pct"],
            reverse=True
        )

        sorted_down = sorted(
            valid_positions,
            key=lambda x: x["change_pct"]
        )

        gainers = [{
            "symbol": p["symbol"],
            "price": p["price"],
            "change": p["change"],
            "change_pct": p["change_pct"],
        } for p in sorted_up[:5]]

        losers = [{
            "symbol": p["symbol"],
            "price": p["price"],
            "change": p["change"],
            "change_pct": p["change_pct"],
        } for p in sorted_down[:5]]

    # Watchlist movers
    watchlist_movers = []

    with get_db() as conn:

        rows = conn.execute("""
            SELECT symbol
            FROM watchlist
            WHERE user_id = ?
        """, (user_id,)).fetchall()

    watch_symbols = [r["symbol"] for r in rows]

    if watch_symbols:

        snaps = get_batch_snapshots(watch_symbols)

        items = []

        for symbol, snap in snaps.items():
            if snap.get("change_pct") is None:
                continue

            items.append(
                _normalize_mover(symbol, snap)
            )

        items.sort(
            key=lambda x: x["change_pct"],
            reverse=True
        )

        watchlist_movers = items[:5]

    # -----------------------
    # Return
    # -----------------------

    return {

        "summary": {

            "portfolio_value": float(equity_total),

            "unrealized": summary["unrealized"],
            "unrealized_pct": summary["unrealized_pct"],

            "today_pl": summary["today_pl"],
            "today_pct": summary["today_pct"],

            "cash": float(cash_balance),
        },

        "allocation": {

            "assets": asset_allocation,

            "sectors": sector_allocation,
        },

        "movers": {
            "gainers": gainers,
            "losers": losers,
            "watchlist": watchlist_movers,
        }

    }
