from flask import render_template, session
from utils.decorators import login_required
from .services import get_portfolio_overview, get_portfolio_snapshots

from . import holdings_bp


@holdings_bp.route("/holdings")
@login_required
def holdings():

    user_id = session["user_id"]

    data = get_portfolio_overview(user_id=user_id)

    return render_template(
        "holdings.html",

        holdings=data["positions"],

        total_portfolio=data["summary"]["portfolio_value"],

        unrealized=data["summary"]["unrealized"],
        unrealized_pct=data["summary"]["unrealized_pct"],

        today_pl=data["summary"]["today_pl"],
        today_pct=data["summary"]["today_pct"],
    )


@holdings_bp.route("/holdings/snapshots")
@login_required
def holdings_snapshots():

    user_id = session["user_id"]

    return get_portfolio_snapshots(user_id=user_id)
