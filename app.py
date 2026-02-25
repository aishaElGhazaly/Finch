import os
from flask import Flask, session
from extensions import csrf, session_ext, limiter, scheduler

from blueprints.account.routes import account_bp
from blueprints.auth.routes import auth_bp
from blueprints.cash.routes import cash_bp
from blueprints.dashboard.routes import dashboard_bp
from blueprints.holdings.routes import holdings_bp
from blueprints.orders.routes import orders_bp
from blueprints.stocks.routes import stocks_bp
from blueprints.trading.routes import trading_bp
from blueprints.transactions.routes import transactions_bp
from blueprints.watchlist.routes import watchlist_bp

from utils.helpers import usd, format_dob
from models.db import get_db
from datetime import datetime

from blueprints.trading.processor import run_limit_order_processor


def init_scheduler(app):
    scheduler.add_job(
        func=run_limit_order_processor,
        trigger="interval",
        seconds=60,
        id="limit_order_executor",
        replace_existing=True
    )
    scheduler.start()


def create_app():
    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", os.urandom(24))

    app.config.update(
        SESSION_PERMANENT=False,
        SESSION_TYPE="filesystem",
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
    )

    csrf.init_app(app)
    session_ext.init_app(app)
    limiter.init_app(app)

    app.register_blueprint(account_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(cash_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(holdings_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(stocks_bp)
    app.register_blueprint(trading_bp)
    app.register_blueprint(transactions_bp)
    app.register_blueprint(watchlist_bp)

    app.jinja_env.filters["usd"] = usd
    app.jinja_env.filters["dob"] = format_dob

    @app.context_processor
    def inject_year():
        return {'year': datetime.now().year}

    @app.context_processor
    def inject_user():
        """Inject a minimal current_user (first_name) for templates"""
        user = None
        user_id = session.get("user_id")
        if user_id:
            with get_db() as conn:
                user = conn.execute(
                    "SELECT id, first_name FROM users WHERE id = ?", (user_id,)
                ).fetchone()
        return dict(current_user=user)

    if not scheduler.running:
        init_scheduler(app)

    return app


if __name__ == "__main__":
    create_app().run(debug=True)
