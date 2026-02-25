from flask import render_template, redirect, flash, request, url_for, session
from utils.decorators import login_required
from models.db import get_db
from blueprints.trading.services import cancel_limit_order, TradingError

from . import orders_bp


@orders_bp.route("/orders")
@login_required
def list_orders():
    user_id = session["user_id"]

    with get_db() as conn:
        rows = conn.execute("""
            SELECT *
            FROM limit_orders
            WHERE user_id = ?
            ORDER BY created_at DESC
        """, (user_id,)).fetchall()

    return render_template("orders.html", orders=[dict(r) for r in rows])


@orders_bp.route("/orders/<int:order_id>/cancel", methods=["POST"])
@login_required
def cancel(order_id):
    user_id = session["user_id"]
    try:
        cancel_limit_order(user_id=user_id, order_id=order_id)
        flash("Order cancelled.", "success")
    except TradingError as e:
        flash(str(e), "danger")

    return redirect(request.referrer or url_for("orders.list_orders"))
