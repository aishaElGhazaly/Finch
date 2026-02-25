# blueprints/stocks/routes.py
from flask import render_template, redirect, request, session, url_for
from decimal import Decimal
from models.db import get_db
from utils.helpers import search_stock_info, lookup_quote, to_decimal
from utils.decorators import login_required
from blueprints.trading.services import update_stock_metadata

from . import stocks_bp


@stocks_bp.route("/search", methods=["POST"])
@login_required
def search():
    query = (request.form.get("q") or "").strip()
    if not query:
        return "", 204

    result = search_stock_info(query)
    if not result:
        return render_template("stock.html", error="No results for that symbol")

    return redirect(url_for("stocks.stock_page", ticker=result["symbol"]))


@stocks_bp.route("/quote/<symbol>")
@login_required
def get_quote(symbol):
    price = lookup_quote(symbol.upper())
    return {"success": True, "price": price}


@stocks_bp.route("/stock/<ticker>")
@login_required
def stock_page(ticker):
    user_id = session["user_id"]

    symbol = ticker.upper()
    update_stock_metadata(symbol)

    result = search_stock_info(symbol)
    if not result:
        return render_template("stock.html", error="Stock not found.")

    try:
        quote = lookup_quote(symbol)
        quote = to_decimal(quote) if quote is not None else None
    except Exception:
        quote = None

    stock_data = {
        "name": result.get("shortname"),
        "symbol": result.get("symbol").upper(),
        "exchange": result.get("exchDisp"),
        "quote": float(quote) if quote else None
    }

    with get_db() as conn:

        user_row = conn.execute(
            "SELECT cash_balance FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

        holding = conn.execute(
            "SELECT shares, avg_price FROM holdings WHERE user_id = ? AND symbol = ?",
            (user_id, symbol)
        ).fetchone()

        wl = conn.execute(
            "SELECT 1 FROM watchlist WHERE user_id = ? AND symbol = ?",
            (user_id, symbol)
        ).fetchone()


    position = None

    if holding and holding["shares"] > 0 and quote is not None:
        shares = holding["shares"]
        avg_price = to_decimal(holding["avg_price"])
        market_price = quote

        market_value = shares * market_price
        cost_basis = shares * avg_price
        unrealized_pl = market_value - cost_basis
        unrealized_pl_pct = (
            (unrealized_pl / cost_basis) * 100
            if cost_basis > 0 else Decimal("0")
        )

        position = {
            "shares": shares,
            "avg_price": float(avg_price),
            "market_price": float(market_price),
            "market_value": float(market_value),
            "unrealized_pl": float(unrealized_pl),
            "unrealized_pl_pct": float(unrealized_pl_pct),
        }

    return render_template(
        "stock.html",
        stock=stock_data,
        position=position,
        in_watchlist=bool(wl),
        user_cash=float(to_decimal(user_row["cash_balance"])) if user_row else 0,
        user_shares=holding["shares"] if holding else 0,
    )
