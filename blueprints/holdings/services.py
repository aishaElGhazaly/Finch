import logging
from decimal import Decimal, getcontext, ROUND_DOWN

from models.db import get_db
from utils.helpers import to_decimal
from blueprints.trading.services import get_stock_snapshot, get_batch_snapshots
from datetime import datetime, date


# Decimal config (match trading / cash)
getcontext().prec = 28
getcontext().rounding = ROUND_DOWN


logger = logging.getLogger(__name__)


__all__ = [
    "get_portfolio_overview",
    "get_portfolio_snapshots",
]


# =========================
# Internal helpers
# =========================

def _get_holdings(conn, user_id: int) -> list[dict]:

    rows = conn.execute("""
        SELECT
            h.symbol,
            h.shares,
            h.avg_price,
            h.updated_at,
            s.name,
            s.sector
        FROM holdings h
        LEFT JOIN stocks s ON h.symbol = s.symbol
        WHERE h.user_id = ?
        ORDER BY h.updated_at DESC
    """, (user_id,)).fetchall()

    return [dict(r) for r in rows]


def _position_opened_today(user_id: int, symbol: str) -> bool:
    with get_db() as conn:
        row = conn.execute("""
            SELECT MIN(created_at) AS first_lot
            FROM lots
            WHERE user_id = ?
              AND symbol = ?
        """, (user_id, symbol)).fetchone()

    if not row or not row["first_lot"]:
        return False

    try:
        created = datetime.strptime(
            row["first_lot"],
            "%Y-%m-%d %H:%M:%S"
        )
        return created.date() == date.today()
    except Exception:
        return False


# =========================
# Core computation
# =========================

def _compute_portfolio(user_id: int, holdings: list[dict], snapshots: dict) -> dict:

    total_value = Decimal("0")
    total_cost = Decimal("0")
    total_unrealized = Decimal("0")
    total_today = Decimal("0")
    total_yesterday_value = Decimal("0")

    for h in holdings:

        symbol = h["symbol"]

        # ---- Snapshot ----
        snap = snapshots.get(symbol)
        if not snap:
            try:
                snap = get_stock_snapshot(symbol)
                snapshots[symbol] = snap
            except Exception as e:
                logger.warning(
                    "Snapshot fetch failed for %s: %s",
                    symbol,
                    type(e).__name__
                )
                continue

        shares = Decimal(h["shares"])
        avg = to_decimal(h["avg_price"])

        price = to_decimal(snap["price"])
        prev_close = to_decimal(snap["prev_close"] or 0)

        change = to_decimal(snap["change"] or 0)
        change_pct = to_decimal(snap["change_pct"] or 0)

        # ---- Core position math ----
        market_value = (shares * price).quantize(Decimal("0.01"))
        cost_basis = (shares * avg).quantize(Decimal("0.01"))
        unrealized = (market_value - cost_basis).quantize(Decimal("0.01"))

        # ---- Today P/L ----
        opened_today = _position_opened_today(user_id, symbol)

        if prev_close <= 0:
            today_pl = Decimal("0")
            yesterday_value = market_value

        elif opened_today:
            # First day → mimic total (unrealized)
            today_pl = unrealized
            yesterday_value = cost_basis

        else:
            yesterday_value = (shares * prev_close).quantize(Decimal("0.01"))
            today_pl = (market_value - yesterday_value).quantize(Decimal("0.01"))


        # ---- Percentages ----
        if cost_basis > 0:
            unrealized_pct = (
                (unrealized / cost_basis) * 100
            ).quantize(Decimal("0.01"))
        else:
            unrealized_pct = Decimal("0")

        if yesterday_value > 0:
            today_pct_position = (
                (today_pl / yesterday_value) * 100
            ).quantize(Decimal("0.01"))
        else:
            today_pct_position = Decimal("0")


        # ---- Accumulate portfolio totals ----
        total_value += market_value
        total_cost += cost_basis
        total_unrealized += unrealized
        total_today += today_pl
        total_yesterday_value += yesterday_value

        # ---- Attach to position ----
        h.update({
            "price": float(price),

            "change": float(change),
            "change_pct": float(change_pct),

            "market_value": float(market_value),
            "cost_basis": float(cost_basis),

            "unrealized_pl": float(unrealized),
            "unrealized_pct": float(unrealized_pct),

            "today_pl": float(today_pl),
            "today_pct": float(today_pct_position),
        })

    # -------------------------
    # Portfolio totals
    # -------------------------

    if total_cost > 0:
        total_pl_pct = (
            (total_unrealized / total_cost) * 100
        ).quantize(Decimal("0.01"))
    else:
        total_pl_pct = Decimal("0")

    if total_yesterday_value > 0 and total_today != 0:
        today_pct = (
            (total_today / total_yesterday_value) * 100
        ).quantize(Decimal("0.01"))
    else:
        today_pct = Decimal("0")

    # -------------------------
    # Weights
    # -------------------------

    running_total = Decimal("0")

    for i, h in enumerate(holdings):

        mv = to_decimal(h.get("market_value") or 0)

        if total_value > 0:
            raw_weight = (mv / total_value) * 100
        else:
            raw_weight = Decimal("0")

        if i < len(holdings) - 1:
            weight = raw_weight.quantize(Decimal("0.01"))
            running_total += weight
        else:
            weight = (Decimal("100.00") - running_total).quantize(Decimal("0.01"))

        if weight < 0:
            weight = Decimal("0.00")

        h["weight_pct"] = float(weight)

    # -------------------------
    # Return
    # -------------------------

    return {
        "positions": holdings,
        "summary": {
            "portfolio_value": float(total_value),
            "unrealized": float(total_unrealized),
            "unrealized_pct": float(total_pl_pct),
            "today_pl": float(total_today),
            "today_pct": float(today_pct),
        }
    }


# =========================
# Public API
# =========================

def get_portfolio_overview(*, user_id: int) -> dict:
    """
    Read-only overview for holdings page.
    Returns positions + summary, fully computed.
    """

    with get_db() as conn:

        holdings = _get_holdings(conn, user_id)

        symbols = [h["symbol"] for h in holdings]

    snapshots = get_batch_snapshots(symbols)

    return _compute_portfolio(user_id, holdings, snapshots)


def get_portfolio_snapshots(*, user_id: int) -> dict:
    """
    Snapshot endpoint for polling.
    Returns positions + summary.
    """

    data = get_portfolio_overview(user_id=user_id)

    return {
        "positions": {
            h["symbol"]: {
                "price": h["price"],

                "market_value": h["market_value"],
                "cost_basis": h["cost_basis"],

                "unrealized_pl": h["unrealized_pl"],
                "unrealized_pct": h["unrealized_pct"],

                "today_pl": h["today_pl"],
                "today_pct": h["today_pct"],
                "weight_pct": h["weight_pct"],
            }
            for h in data["positions"]
        },

        "summary": data["summary"]
    }
