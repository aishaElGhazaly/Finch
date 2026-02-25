from flask import render_template, session
from models.db import get_db
from utils.decorators import login_required
from .services import get_greeting, get_dashboard_overview

from . import dashboard_bp


@dashboard_bp.route("/")
def index():

    user_id = session.get("user_id")

    if not user_id:
        return render_template("landing.html")

    # Get user name
    with get_db() as conn:
        user = conn.execute(
            "SELECT first_name FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

    if not user:
        session.clear()
        return render_template("landing.html")

    first_name = user["first_name"]
    greeting = get_greeting(first_name)

    data = get_dashboard_overview(user_id=user_id)
    summary = data["summary"]

    return render_template(
        "dashboard.html",
        greeting=greeting,
        total_portfolio=summary["portfolio_value"],
        unrealized=summary["unrealized"],
        unrealized_pct=summary["unrealized_pct"],
        today_pl=summary["today_pl"],
        today_pct=summary["today_pct"],
        cash=summary["cash"],
    )


@dashboard_bp.route("/snapshots")
@login_required
def dashboard_snapshots():

    user_id = session["user_id"]

    return get_dashboard_overview(user_id=user_id)
