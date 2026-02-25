from flask import render_template, request, session
from extensions import limiter

from . import account_bp
from .services import change_name, change_email, change_password, delete_account
from models.db import get_db
from utils.decorators import login_required


@account_bp.route("/account")
@login_required
def index():
    user_id = session["user_id"]
    with get_db() as conn:
        user = conn.execute("""
            SELECT first_name, last_name, email, dob
            FROM users WHERE id = ?
        """, (user_id,)).fetchone()

    return render_template("account.html", user=user)


@account_bp.route("/api/account/name", methods=["POST"])
@login_required
@limiter.limit("20 per hour")
def update_name():
    data = request.get_json(silent=True) or {}

    result = change_name(
        user_id=session["user_id"],
        first_name=data.get("first_name", ""),
        last_name=data.get("last_name", ""),
        password=data.get("password", "")
    )

    if "errors" in result:
        return result, 400

    return result


@account_bp.route("/api/account/email", methods=["POST"])
@login_required
@limiter.limit("5 per hour")
def update_email():
    data = request.get_json(silent=True) or {}

    result = change_email(
        user_id=session["user_id"],
        email=data.get("email", ""),
        password=data.get("password", "")
    )

    if "errors" in result:
        return result, 400

    return result


@account_bp.route("/api/account/password", methods=["POST"])
@login_required
@limiter.limit("3 per hour")
def update_password():
    data = request.get_json(silent=True) or {}

    result = change_password(
        user_id=session["user_id"],
        current_password=data.get("current_password", ""),
        new_password=data.get("new_password", ""),
    )

    if "errors" in result:
        return result, 400

    if result.get("relogin"):
        session.clear()

    return result


@account_bp.route("/api/account/delete", methods=["POST"])
@login_required
def delete_account_route():
    data = request.get_json(silent=True) or {}

    result = delete_account(
        user_id=session["user_id"],
        password=data.get("password", ""),
    )

    if "errors" in result:
        return result, 400

    session.clear()
    return result
