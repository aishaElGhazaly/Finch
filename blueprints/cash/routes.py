from decimal import Decimal
from flask import render_template, redirect, flash, request, session
from utils.decorators import login_required, prevent_double_submit
from extensions import limiter

from . import cash_bp
from .services import get_cash_overview, deposit_cash, withdraw_cash, CashError


@cash_bp.route("/cash")
@login_required
def cash_get():
    user_id = session["user_id"]

    # ---------------- GET ----------------
    if request.method == "GET":
        data = get_cash_overview(user_id=user_id)

        raw_rows = data["transactions"]
        transactions = [dict(r) for r in raw_rows]

        return render_template(
            "cash.html",
            transactions=transactions,
            balance=data["balance"],
            remaining_daily=data["remaining_daily"],
            remaining_weekly=data["remaining_weekly"],
            DAILY_LIMIT=data["DAILY_LIMIT"],
            WEEKLY_LIMIT=data["WEEKLY_LIMIT"],
        )


@cash_bp.route("/cash", methods=["POST"])
@login_required
@prevent_double_submit(window=3.0)
@limiter.limit("5 per minute")
def cash_post():
    user_id = session["user_id"]

    # ---------------- POST ----------------
    action = request.form.get("action", "").lower()

    try:
        amount = Decimal(str(request.form.get("amount", "0")))
    except Exception:
        flash("Invalid amount.", "danger")
        return redirect("/cash")

    try:
        if action == "deposit":
            deposit_cash(user_id=user_id, amount=amount)
            flash("Deposit successful!", "success")

        elif action == "withdraw":
            withdraw_cash(user_id=user_id, amount=amount)
            flash("Withdrawal successful!", "success")

        else:
            flash("Invalid action.", "danger")

    except CashError as e:
        flash(str(e), "danger")

    except Exception:
        flash("An unexpected error occurred.", "danger")

    return redirect("/cash")
