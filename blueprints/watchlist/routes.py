from flask import render_template, session
from models.db import get_db
from utils.decorators import login_required
from blueprints.trading.services import get_batch_snapshots, update_stock_metadata

from . import watchlist_bp


@watchlist_bp.route("/watchlist")
@login_required
def watchlist():
    user_id = session["user_id"]

    with get_db() as conn:
        rows = conn.execute("""
            SELECT
                w.symbol,
                w.added_at,
                s.name,
                s.sector,
                s.industry,
                s.exchange
            FROM watchlist w
            JOIN stocks s ON w.symbol = s.symbol
            WHERE w.user_id = ?
            ORDER BY w.added_at DESC
        """, (user_id,)).fetchall()

    stocks = [dict(r) for r in rows]  

    # Extract symbols
    symbols = [s["symbol"] for s in stocks]

    # Fetch live snapshots (cached, TTL-based)
    snapshots = get_batch_snapshots(symbols)

    # Merge snapshot data into stock rows
    for stock in stocks:
        snap = snapshots.get(stock["symbol"])

        if snap:
            stock["price"] = snap["price"]
            stock["change"] = snap["change"]
            stock["change_pct"] = snap["change_pct"]
        else:
            # Graceful degradation
            stock["price"] = None
            stock["change"] = None
            stock["change_pct"] = None

    return render_template("watchlist.html", stocks=stocks)


@watchlist_bp.route("/watchlist/<ticker>", methods=["POST"])
@login_required
def toggle_watchlist(ticker):
    user_id = session["user_id"]
    symbol = ticker.upper()

    update_stock_metadata(symbol)

    with get_db() as conn:
        row = conn.execute(
            "SELECT 1 FROM watchlist WHERE user_id = ? AND symbol = ?", (user_id, symbol)).fetchone()
        if row:
            conn.execute(
                "DELETE FROM watchlist WHERE user_id = ? AND symbol = ?", (user_id, symbol))
            conn.commit()
            return {"status": "removed"}
        else:
            conn.execute(
                "INSERT INTO watchlist (user_id, symbol) VALUES (?, ?)", (user_id, symbol))
            conn.commit()
            return {"status": "added"}


@watchlist_bp.route("/watchlist/snapshots")
@login_required
def watchlist_snapshots():
    user_id = session["user_id"]

    with get_db() as conn:
        rows = conn.execute("""
            SELECT symbol
            FROM watchlist
            WHERE user_id = ?
        """, (user_id,)).fetchall()

    symbols = [r["symbol"] for r in rows]
    snapshots = get_batch_snapshots(symbols)

    return snapshots
