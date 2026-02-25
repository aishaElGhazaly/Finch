from flask import render_template, session
from utils.decorators import login_required
from models.db import get_db

from . import transactions_bp


@transactions_bp.route("/transactions")
@login_required
def transactions():
    user_id = session["user_id"]
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 2000",
            (user_id,)
        ).fetchall()

    return render_template("transactions.html", trades=[dict(r) for r in rows])

