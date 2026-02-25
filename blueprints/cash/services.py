import logging
from decimal import Decimal, getcontext, ROUND_DOWN
from models.db import get_db, begin_immediate
from utils.helpers import to_decimal, usd

getcontext().prec = 28
getcontext().rounding = ROUND_DOWN

logger = logging.getLogger(__name__)

__all__ = [
    "CashError",
    "get_cash_overview",
    "deposit_cash",
    "withdraw_cash",
]

# ---- Domain limits ----
MAX_BALANCE = Decimal("1000000000")
DAILY_LIMIT = Decimal("100000.0")
WEEKLY_LIMIT = Decimal("500000.0")


class CashError(Exception):
    """Raised when a cash operation violates a business rule."""
    pass


# =========================
# Internal helpers
# =========================

def _get_cash_balance(conn, user_id: int) -> Decimal:
    row = conn.execute(
        "SELECT cash_balance FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

    if not row:
        raise CashError("User not found.")

    return to_decimal(row["cash_balance"])


def _get_deposit_totals(conn, user_id: int) -> tuple[Decimal, Decimal]:
    daily = to_decimal(conn.execute("""
        SELECT COALESCE(SUM(amount), 0)
        FROM cash_transactions
        WHERE user_id = ?
          AND type = 'DEPOSIT'
          AND created_at >= datetime('now', '-1 day')
    """, (user_id,)).fetchone()[0])

    weekly = to_decimal(conn.execute("""
        SELECT COALESCE(SUM(amount), 0)
        FROM cash_transactions
        WHERE user_id = ?
          AND type = 'DEPOSIT'
          AND created_at >= datetime('now', '-7 days')
    """, (user_id,)).fetchone()[0])

    return daily, weekly


def _validate_amount(amount: Decimal):
    if amount <= 0:
        raise CashError("Amount must be positive.")


# =========================
# Public API
# =========================

def get_cash_overview(*, user_id: int) -> dict:
    """
    Read-only overview for the cash page.
    """
    with get_db() as conn:
        balance = _get_cash_balance(conn, user_id)
        daily_total, weekly_total = _get_deposit_totals(conn, user_id)

        remaining_daily = max(Decimal("0"), DAILY_LIMIT - daily_total)
        remaining_weekly = max(Decimal("0"), WEEKLY_LIMIT - weekly_total)

        transactions = conn.execute("""
            SELECT *
            FROM cash_transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 2000
        """, (user_id,)).fetchall()

    return {
        "balance": float(balance),
        "transactions": transactions,
        "remaining_daily": float(remaining_daily),
        "remaining_weekly": float(remaining_weekly),
        "DAILY_LIMIT": float(DAILY_LIMIT),
        "WEEKLY_LIMIT": float(WEEKLY_LIMIT),
    }


def deposit_cash(*, user_id: int, amount: Decimal) -> None:
    _validate_amount(amount)

    with get_db() as conn:
        try:
            begin_immediate(conn)

            balance = _get_cash_balance(conn, user_id)
            daily_total, weekly_total = _get_deposit_totals(conn, user_id)

            if daily_total + amount > DAILY_LIMIT:
                raise CashError("Daily deposit limit exceeded.")

            if weekly_total + amount > WEEKLY_LIMIT:
                raise CashError("Weekly deposit limit exceeded.")

            if balance + amount > MAX_BALANCE:
                raise CashError("Balance cannot exceed $1,000,000,000.")

            new_balance = (balance + amount).quantize(Decimal("0.01"))

            conn.execute(
                "UPDATE users SET cash_balance = ? WHERE id = ?",
                (float(new_balance), user_id)
            )

            conn.execute("""
                INSERT INTO cash_transactions
                (user_id, type, amount, balance_after)
                VALUES (?, 'DEPOSIT', ?, ?)
            """, (
                user_id,
                float(amount),
                float(new_balance),
            ))

            conn.commit()

        except CashError:
            conn.rollback()
            raise

        except Exception as e:
            conn.rollback()
            logger.exception(
                "DepositFailure user=%s amount=%s cause=%s",
                user_id, amount, type(e).__name__
            )
            raise CashError("Deposit failed.") from e


def withdraw_cash(*, user_id: int, amount: Decimal) -> None:
    _validate_amount(amount)

    with get_db() as conn:
        try:
            begin_immediate(conn)

            balance = _get_cash_balance(conn, user_id)

            if amount > balance:
                raise CashError("Insufficient balance.")

            new_balance = (balance - amount).quantize(Decimal("0.01"))

            conn.execute(
                "UPDATE users SET cash_balance = ? WHERE id = ?",
                (float(new_balance), user_id)
            )

            conn.execute("""
                INSERT INTO cash_transactions
                (user_id, type, amount, balance_after)
                VALUES (?, 'WITHDRAW', ?, ?)
            """, (
                user_id,
                float(amount),
                float(new_balance),
            ))

            conn.commit()

        except CashError:
            conn.rollback()
            raise

        except Exception as e:
            conn.rollback()
            logger.exception(
                "WithdrawFailure user=%s amount=%s cause=%s",
                user_id, amount, type(e).__name__
            )
            raise CashError("Withdrawal failed.") from e
