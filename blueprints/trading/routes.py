from flask import flash, redirect, request, session, url_for
from utils.helpers import to_decimal, usd
from utils.decorators import login_required, prevent_double_submit
from extensions import limiter

from . import trading_bp
from .services import update_stock_metadata, market_buy, market_sell, place_limit_buy, place_limit_sell, TradingError


@trading_bp.route("/buy/<symbol>", methods=["POST"])
@login_required
@prevent_double_submit(window=3.0)
@limiter.limit("10 per minute")
def buy(symbol):
    user_id = session["user_id"]
    symbol = symbol.upper()
    update_stock_metadata(symbol)

    order_type = request.form.get("order_type", "market")
    shares = request.form.get("shares", "").strip()

    # basic UI input validation
    try:
        shares = int(shares)
        if shares <= 0:
            raise ValueError
    except:
        flash("Invalid number of shares.", "danger")
        return redirect(url_for("stock_page", ticker=symbol))

    try:
        if order_type == "limit":
            limit_price = request.form.get("limit_price", "").strip()
            limit_price = to_decimal(limit_price)
            place_limit_buy(user_id=user_id, symbol=symbol, shares=shares, limit_price=limit_price)
            flash(f"Limit buy order placed: {shares} {symbol} @ {usd(limit_price)}", "success")
        else:
            market_buy(user_id=user_id, symbol=symbol, shares=shares)
            flash(f"Bought {shares} shares of {symbol}.", "success")

    except TradingError as e:
        flash(str(e), "danger")

    return redirect(url_for("stocks.stock_page", ticker=symbol))


@trading_bp.route("/sell/<symbol>", methods=["POST"])
@login_required
@prevent_double_submit(window=3.0)
@limiter.limit("10 per minute")
def sell(symbol):
    user_id = session["user_id"]
    symbol = symbol.upper()
    update_stock_metadata(symbol)
    
    order_type = request.form.get("order_type", "market")
    shares = request.form.get("shares", "").strip()

    try:
        shares = int(shares)
        if shares <= 0:
            raise ValueError
    except:
        flash("Invalid number of shares.", "danger")
        return redirect(url_for("stocks.stock_page", ticker=symbol))

    try:
        if order_type == "limit":
            limit_price = to_decimal(request.form.get("limit_price", "0"))
            place_limit_sell(user_id=user_id, symbol=symbol, shares=shares, limit_price=limit_price)
            flash(f"Limit sell order placed: {shares} {symbol} @ {usd(limit_price)}", "success")
        else:
            market_sell(user_id=user_id, symbol=symbol, shares=shares)
            flash(f"Sold {shares} shares of {symbol}.", "success")

    except TradingError as e:
        flash(str(e), "danger")

    return redirect(url_for("stocks.stock_page", ticker=symbol))
