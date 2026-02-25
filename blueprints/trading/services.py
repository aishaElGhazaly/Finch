import yfinance as yf
import logging
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from models.db import get_db, begin_immediate
from utils.helpers import to_decimal, lookup_quote, search_stock_info, usd
from decimal import getcontext, ROUND_DOWN
from typing import Iterable


STOCK_SNAPSHOT_TTL = timedelta(seconds=60)
STOCK_METADATA_TTL = timedelta(days=7)

getcontext().prec = 28
getcontext().rounding = ROUND_DOWN

logger = logging.getLogger(__name__)


__all__ = [
    "TradingError",
    "market_buy",
    "market_sell",
    "place_limit_buy",
    "place_limit_sell",
    "cancel_limit_order",
    "process_pending_limit_orders",
]


class TradingError(Exception):
    """Raised when a trading operation violates a business rule."""
    pass


class MarketDataError(Exception):
    """Raised when market data cannot be retrieved or is invalid."""
    pass


def _validate_shares(shares: int):
    if not isinstance(shares, int) or shares <= 0:
        raise TradingError("Invalid number of shares.")


def _get_cash_balance(conn, user_id: int) -> Decimal:
    row = conn.execute(
        "SELECT cash_balance FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

    if not row:
        raise TradingError("User not found.")

    return to_decimal(row["cash_balance"])


def _get_available_shares(conn, user_id: int, symbol: str) -> int:
    row = conn.execute("""
        SELECT shares
        FROM holdings
        WHERE user_id = ? AND symbol = ?
    """, (user_id, symbol)).fetchone()

    owned = row["shares"] if row else 0

    reserved = conn.execute("""
        SELECT COALESCE(SUM(shares), 0)
        FROM limit_orders
        WHERE user_id = ?
          AND symbol = ?
          AND order_type = 'SELL'
          AND status = 'PENDING'
    """, (user_id, symbol)).fetchone()[0]

    return max(0, owned - reserved)


def _get_market_price(symbol: str) -> Decimal:
    price = lookup_quote(symbol)
    if price is None:
        raise TradingError("Unable to fetch market price.")
    price = to_decimal(price)
    if price <= 0:
        raise TradingError("Invalid market price.")
    return price


def _create_lot(conn, user_id: int, symbol: str, shares: int, price: Decimal):
    conn.execute("""
        INSERT INTO lots
        (user_id, symbol, original_qty, qty_remaining, price)
        VALUES (?, ?, ?, ?, ?)
    """, (
        user_id,
        symbol,
        int(shares),
        int(shares),
        float(price)
    ))


def _apply_buy_to_holdings(conn, user_id: int, symbol: str, shares: int, price: Decimal):
    holding = conn.execute("""
        SELECT shares, avg_price
        FROM holdings
        WHERE user_id = ? AND symbol = ?
    """, (user_id, symbol)).fetchone()

    if holding:
        old_shares = holding["shares"]
        old_avg = to_decimal(holding["avg_price"])
        new_total = old_shares + int(shares)
        new_avg = ((old_avg * old_shares) + (price * shares)) / \
            Decimal(new_total)
        new_avg = new_avg.quantize(Decimal("0.0001"))

        conn.execute("""
            UPDATE holdings
            SET shares = ?, avg_price = ?, updated_at = datetime('now')
            WHERE user_id = ? AND symbol = ?
        """, (new_total, float(new_avg), user_id, symbol))
    else:
        conn.execute("""
            INSERT INTO holdings (user_id, symbol, shares, avg_price)
            VALUES (?, ?, ?, ?)
        """, (user_id, symbol, int(shares), float(price)))


def _apply_sell_to_holdings(conn, user_id: int, symbol: str, shares: int):
    holding = conn.execute("""
        SELECT shares
        FROM holdings
        WHERE user_id = ? AND symbol = ?
    """, (user_id, symbol)).fetchone()

    if not holding or holding["shares"] < shares:
        raise TradingError("Insufficient shares.")

    remaining = holding["shares"] - shares

    if remaining == 0:
        conn.execute(
            "DELETE FROM holdings WHERE user_id = ? AND symbol = ?",
            (user_id, symbol)
        )
    else:
        conn.execute("""
            UPDATE holdings
            SET shares = ?, updated_at = datetime('now')
            WHERE user_id = ? AND symbol = ?
        """, (remaining, user_id, symbol))


def _consume_lots_fifo(conn, user_id, symbol, shares, sell_price):
    qty_to_sell = int(shares)
    realized = Decimal("0")

    lots = conn.execute("""
        SELECT id, qty_remaining, price
        FROM lots
        WHERE user_id = ?
          AND symbol = ?
          AND qty_remaining > 0
        ORDER BY created_at ASC
    """, (user_id, symbol)).fetchall()

    for lot in lots:
        if qty_to_sell <= 0:
            break

        lot_qty = int(lot["qty_remaining"])
        lot_price = to_decimal(lot["price"])

        take = min(lot_qty, qty_to_sell)

        realized += (sell_price - lot_price) * Decimal(take)

        remaining = lot_qty - take

        conn.execute("""
            UPDATE lots
            SET qty_remaining = ?
            WHERE id = ?
        """, (remaining, lot["id"]))

        qty_to_sell -= take

    if qty_to_sell > 0:
        raise TradingError("Lot underflow (data inconsistency)")

    return realized.quantize(Decimal("0.01"))


def _recalc_holding_from_lots(conn, user_id, symbol):
    rows = conn.execute("""
        SELECT qty_remaining, price
        FROM lots
        WHERE user_id = ?
          AND symbol = ?
          AND qty_remaining > 0
    """, (user_id, symbol)).fetchall()

    # No remaining lots → remove holding
    if not rows:
        conn.execute("""
            DELETE FROM holdings
            WHERE user_id = ? AND symbol = ?
        """, (user_id, symbol))
        return

    total_shares = 0
    total_cost = Decimal("0")

    for row in rows:
        qty = int(row["qty_remaining"])
        price = to_decimal(row["price"])

        total_shares += qty
        total_cost += price * Decimal(qty)

    avg = (total_cost / Decimal(total_shares)).quantize(
        Decimal("0.0001")
    )

    conn.execute("""
        UPDATE holdings
        SET shares = ?, avg_price = ?, updated_at = datetime('now')
        WHERE user_id = ? AND symbol = ?
    """, (total_shares, float(avg), user_id, symbol))


def _fetch_stock_snapshot(symbol: str) -> dict:
    symbol = symbol.upper()

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
    except Exception as e:
        raise MarketDataError("Unable to fetch market data.") from e

    price = info.get("regularMarketPrice")
    prev = info.get("regularMarketPreviousClose")

    if price is None:
        raise MarketDataError("No live price available.")

    price = to_decimal(price)
    prev = to_decimal(prev) if prev is not None else None

    # Change
    if info.get("regularMarketChange") is not None:
        change = to_decimal(info.get("regularMarketChange"))
    elif prev is not None:
        change = price - prev
    else:
        change = None

    # Change %
    if info.get("regularMarketChangePercent") is not None:
        change_pct = to_decimal(info.get("regularMarketChangePercent"))
    elif change is not None and prev and prev > 0:
        change_pct = (change / prev) * 100
    else:
        change_pct = None

    return {
        "symbol": symbol,
        "price": float(price),
        "prev_close": float(prev) if prev else None,
        "change": float(change) if change is not None else None,
        "change_pct": float(change_pct) if change_pct is not None else None,
    }


def market_buy(*, user_id: int, symbol: str, shares: int) -> None:
    _validate_shares(shares)

    symbol = symbol.upper()
    price = _get_market_price(symbol)
    total_cost = (price * shares).quantize(Decimal("0.01"))

    with get_db() as conn:
        try:
            begin_immediate(conn)

            balance = _get_cash_balance(conn, user_id)

            if total_cost > balance:
                raise TradingError("Insufficient funds.")

            new_balance = (balance - total_cost).quantize(Decimal("0.01"))

            conn.execute(
                "UPDATE users SET cash_balance = ? WHERE id = ?",
                (float(new_balance), user_id)
            )

            conn.execute("""
                INSERT INTO cash_transactions
                (user_id, type, amount, balance_after, note)
                VALUES (?, 'TRADE BUY', ?, ?, ?)
            """, (
                user_id,
                float(total_cost),
                float(new_balance),
                f"Market buy: {shares} {symbol} shares @ {usd(price)}"
            ))

            conn.execute("""
                INSERT INTO trades
                (user_id, symbol, type, shares, price, total, order_source)
                VALUES (?, ?, 'BUY', ?, ?, ?, 'MARKET')
            """, (
                user_id,
                symbol,
                int(shares),
                float(price),
                float(total_cost)
            ))

            _create_lot(conn, user_id, symbol, shares, price)
            _apply_buy_to_holdings(conn, user_id, symbol, shares, price)

            conn.commit()

        except TradingError:
            conn.rollback()
            raise

        except Exception as e:
            conn.rollback()
            logger.exception(
                "MarketBuyFailure user=%s, symbol=%s, shares=%s, price=%s, cause=%s",
                user_id, symbol, shares, price, type(e).__name__
            )
            raise TradingError("Market buy failed.") from e



def market_sell(*, user_id: int, symbol: str, shares: int) -> None:
    _validate_shares(shares)

    symbol = symbol.upper()
    price = _get_market_price(symbol)
    proceeds = (price * shares).quantize(Decimal("0.01"))

    with get_db() as conn:
        try:
            begin_immediate(conn)

            balance = _get_cash_balance(conn, user_id)

            available = _get_available_shares(conn, user_id, symbol)
            if shares > available:
                raise TradingError(
                    "Not enough shares available for market sell.")

            realized_pl = _consume_lots_fifo(
                conn, user_id, symbol, shares, price)
            _recalc_holding_from_lots(conn, user_id, symbol)

            new_balance = (balance + proceeds).quantize(Decimal("0.01"))

            conn.execute(
                "UPDATE users SET cash_balance = ? WHERE id = ?",
                (float(new_balance), user_id)
            )

            conn.execute("""
                INSERT INTO trades
                (user_id, symbol, type, shares, price,
                 total, order_source, realized_pl)
                VALUES (?, ?, 'SELL', ?, ?, ?, 'MARKET', ?)
            """, (
                user_id,
                symbol,
                int(shares),
                float(price),
                float(proceeds),
                float(realized_pl)
            ))

            conn.execute("""
                INSERT INTO cash_transactions
                (user_id, type, amount, balance_after, note)
                VALUES (?, 'TRADE SELL', ?, ?, ?)
            """, (
                user_id,
                float(proceeds),
                float(new_balance),
                f"Market sell: {shares} {symbol} shares @ {usd(price)}"
            ))

            conn.commit()

        except TradingError:
            conn.rollback()
            raise
        except Exception as e:
            conn.rollback()
            logger.exception(
                "MarketSellFailure user=%s, symbol=%s, shares=%s, price=%s, cause=%s",
                user_id, symbol, shares, price, type(e).__name__
            )
            raise TradingError("Market sell failed.") from e




def place_limit_buy(*, user_id: int, symbol: str, shares: int, limit_price: Decimal) -> None:
    _validate_shares(shares)

    if limit_price <= 0:
        raise TradingError("Invalid limit price.")

    symbol = symbol.upper()
    required_cash = (limit_price * shares).quantize(Decimal("0.01"))

    with get_db() as conn:
        try:
            begin_immediate(conn)

            balance = _get_cash_balance(conn, user_id)

            if required_cash > balance:
                raise TradingError("Insufficient funds for limit order.")

            new_balance = (balance - required_cash).quantize(Decimal("0.01"))

            conn.execute(
                "UPDATE users SET cash_balance = ? WHERE id = ?",
                (float(new_balance), user_id)
            )

            conn.execute("""
                INSERT INTO cash_transactions
                (user_id, type, amount, balance_after, note)
                VALUES (?, 'LIMIT BUY RESERVE', ?, ?, ?)
            """, (
                user_id, float(required_cash), float(new_balance),
                f"Reserved limit buy: {shares} {symbol} shares @ {usd(limit_price)}"
            ))

            conn.execute("""
                INSERT INTO limit_orders
                (user_id, symbol, order_type, shares,
                limit_price, reserved_total)
                VALUES (?, ?, 'BUY', ?, ?, ?)
            """, (
                user_id,
                symbol,
                int(shares),
                float(limit_price),
                float(required_cash)
            ))

            conn.commit()

        except TradingError:
            conn.rollback()
            raise
        except Exception as e:
            conn.rollback()
            logger.exception(
                "LimitBuyFailure user=%s, symbol=%s, shares=%s, limit_price=%s, cause=%s",
                user_id, symbol, shares, limit_price, type(e).__name__
            )
            raise TradingError("Failed to place limit buy.") from e


def place_limit_sell(*, user_id: int, symbol: str, shares: int, limit_price: Decimal) -> None:
    _validate_shares(shares)

    if limit_price <= 0:
        raise TradingError("Invalid limit price.")

    symbol = symbol.upper()

    with get_db() as conn:
        try:
            begin_immediate(conn)

            available = _get_available_shares(conn, user_id, symbol)
            if shares > available:
                raise TradingError(
                    "Not enough shares available for limit sell.")

            conn.execute("""
                INSERT INTO limit_orders
                (user_id, symbol, order_type, shares, limit_price)
                VALUES (?, ?, 'SELL', ?, ?)
            """, (
                user_id,
                symbol,
                int(shares),
                float(limit_price)
            ))

            conn.commit()

        except TradingError:
            conn.rollback()
            raise
        except Exception as e:
            conn.rollback()
            logger.exception(
                "LimitSellFailure user=%s, symbol=%s, shares=%s, limit_price=%s, cause=%s",
                user_id, symbol, shares, limit_price, type(e).__name__
            )
            raise TradingError("Failed to place limit sell.") from e


def _execute_limit_buy(conn, order, execution_price):

    # Claim Order First
    cur = conn.execute("""
        UPDATE limit_orders
        SET status = 'PROCESSING'
        WHERE id = ?
        AND status = 'PENDING'
    """, (order["id"],))

    if cur.rowcount == 0:
        raise TradingError("Order already processed")

    user_id = order["user_id"]
    symbol = order["symbol"]
    shares = int(order["shares"])
    execution_price = to_decimal(execution_price)

    reserved = to_decimal(order["reserved_total"])
    actual = (execution_price * shares).quantize(Decimal("0.01"))
    refund = (reserved - actual).quantize(Decimal("0.01"))

    # Fetch balance
    balance = _get_cash_balance(conn, user_id)

    # Apply refund
    if refund > 0:

        balance = (balance + refund).quantize(Decimal("0.01"))

        # Update user balance
        conn.execute("""
            UPDATE users
            SET cash_balance = ?
            WHERE id = ?
        """, (float(balance), user_id))

        # Log refund transaction
        conn.execute("""
            INSERT INTO cash_transactions
            (user_id, type, amount, balance_after, note)
            VALUES (?, 'LIMIT BUY REFUND', ?, ?, ?)
        """, (
            user_id,
            float(refund),
            float(balance),
            f"Refund from Limit Buy: {shares} {symbol} shares @ {usd(execution_price)}"
        ))

    # Create lot
    _create_lot(conn, user_id, symbol, shares, execution_price)

    # Update holdings
    _apply_buy_to_holdings(conn, user_id, symbol, shares, execution_price)

    # Trade ledger
    conn.execute("""
        INSERT INTO trades
        (user_id, symbol, type, shares, price, total, order_source)
        VALUES (?, ?, 'BUY', ?, ?, ?, 'LIMIT')
    """, (
        user_id, symbol, shares,
        float(execution_price), float(actual)
    ))

    # Mark order filled
    conn.execute("""
        UPDATE limit_orders
        SET status = 'FILLED',
            filled_at = datetime('now'),
            filled_price = ?,
            filled_total = ?
        WHERE id = ?
    """, (
        float(execution_price),
        float(actual),
        order["id"]
    ))


def _execute_limit_sell(conn, order, execution_price):
    # Claim order first
    cur = conn.execute("""
        UPDATE limit_orders
        SET status = 'PROCESSING'
        WHERE id = ?
          AND status = 'PENDING'
    """, (order["id"],))

    if cur.rowcount == 0:
        raise TradingError("Order already processed")

    user_id = order["user_id"]
    symbol = order["symbol"]
    shares = int(order["shares"])
    execution_price = to_decimal(execution_price)

    # Re-check remaining shares at execution time
    remaining_qty = conn.execute("""
        SELECT COALESCE(SUM(qty_remaining), 0) AS total
        FROM lots
        WHERE user_id = ?
          AND symbol = ?
          AND qty_remaining > 0
    """, (user_id, symbol)).fetchone()["total"]

    if remaining_qty < shares:
        conn.execute("""
            UPDATE limit_orders
            SET status = 'CANCELLED',
                filled_at = datetime('now')
            WHERE id = ?
        """, (order["id"],))

        logger.warning(
            "Auto-cancelled limit sell %s: requested=%s remaining=%s symbol=%s",
            order["id"], shares, remaining_qty, symbol
        )
        return

    # Execute FIFO consumption
    realized_pl = _consume_lots_fifo(
        conn, user_id, symbol, shares, execution_price
    )

    # Rebuild holdings from lots (cache refresh)
    _recalc_holding_from_lots(conn, user_id, symbol)

    # Credit cash
    proceeds = (execution_price * Decimal(shares)).quantize(Decimal("0.01"))
    balance = _get_cash_balance(conn, user_id)
    new_balance = (balance + proceeds).quantize(Decimal("0.01"))

    conn.execute("""
        UPDATE users
        SET cash_balance = ?
        WHERE id = ?
    """, (float(new_balance), user_id))

    # Cash ledger entry
    conn.execute("""
        INSERT INTO cash_transactions
        (user_id, type, amount, balance_after, note)
        VALUES (?, 'TRADE SELL', ?, ?, ?)
    """, (
        user_id,
        float(proceeds),
        float(new_balance),
        f"Limit sell executed: {shares} {symbol} shares @ {usd(execution_price)}"
    ))

    # Trade record
    conn.execute("""
        INSERT INTO trades
        (user_id, symbol, type, shares, price, total, order_source, realized_pl)
        VALUES (?, ?, 'SELL', ?, ?, ?, 'LIMIT', ?)
    """, (
        user_id,
        symbol,
        shares,
        float(execution_price),
        float(proceeds),
        float(realized_pl)
    ))

    # Mark order filled
    conn.execute("""
        UPDATE limit_orders
        SET status = 'FILLED',
            filled_at = datetime('now'),
            filled_price = ?,
            filled_total = ?
        WHERE id = ?
    """, (
        float(execution_price),
        float(proceeds),
        order["id"]
    ))


def process_pending_limit_orders() -> None:
    with get_db() as conn:
        # WATCHDOG: recover stuck PROCESSING orders
        conn.execute("""
            UPDATE limit_orders
            SET status = 'PENDING'
            WHERE status = 'PROCESSING'
              AND filled_at IS NULL
              AND created_at <= datetime('now', '-2 minutes')
        """)
        conn.commit()

        # Fetch executable orders
        orders = conn.execute("""
            SELECT *
            FROM limit_orders
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
        """).fetchall()

        for order in orders:
            symbol = order["symbol"]
            current_price = _get_market_price(symbol)

            try:
                begin_immediate(conn)

                if order["order_type"] == "BUY" and current_price <= to_decimal(order["limit_price"]):
                    _execute_limit_buy(conn, order, current_price)

                elif order["order_type"] == "SELL" and current_price >= to_decimal(order["limit_price"]):
                    _execute_limit_sell(conn, order, current_price)

                conn.commit()

            except TradingError as e:
                logger.warning(
                    "Skipping limit order %s (%s): %s",
                    order["id"], order["symbol"], e
                )
                conn.rollback()
                continue
            except Exception as e:
                conn.rollback()
                logger.exception(
                    "Limit order processor failed on order %s (%s): %s",
                    order["id"], order["symbol"], e
                )
                continue


def cancel_limit_order(*, user_id: int, order_id: int) -> None:
    with get_db() as conn:
        try:
            begin_immediate(conn)

            order = conn.execute("""
                SELECT *
                FROM limit_orders
                WHERE id = ? AND user_id = ? AND status = 'PENDING'
            """, (order_id, user_id)).fetchone()

            if not order:
                raise TradingError("Order not found or not cancelable.")

            symbol = order["symbol"]
            shares = int(order["shares"])
            limit_price = to_decimal(order["limit_price"])

            if order["order_type"] == "BUY":
                refund = to_decimal(order["reserved_total"] or 0)

                if refund > 0:
                    balance = _get_cash_balance(conn, user_id)

                    new_balance = (balance + refund).quantize(Decimal("0.01"))

                    conn.execute(
                        "UPDATE users SET cash_balance = ? WHERE id = ?",
                        (float(new_balance), user_id)
                    )

                    conn.execute("""
                        INSERT INTO cash_transactions
                        (user_id, type, amount, balance_after, note)
                        VALUES (?, 'LIMIT BUY CANCEL', ?, ?, ?)
                    """, (
                        user_id, float(refund), float(new_balance),
                        f"Cancelled limit buy: {shares} {symbol} shares @ {usd(limit_price)}"
                    ))
            else:
                # No holdings mutation needed
                # availability is derived from limit_orders
                pass

            conn.execute(
                "UPDATE limit_orders SET status = 'CANCELLED' WHERE id = ?",
                (order_id,)
            )

            conn.commit()

        except TradingError as e:
            conn.rollback()
            logger.warning(
                "CancelLimitOrderRejected user=%s order=%s reason=%s",
                user_id, order_id, e
            )
            raise

        except Exception as e:
            conn.rollback()
            logger.exception(
                "CancelLimitOrderFailure user=%s order=%s symbol=%s cause=%s",
                user_id, order_id, symbol, type(e).__name__
            )
            raise TradingError("Failed to cancel order.") from e


def update_stock_metadata(symbol: str) -> bool:
    symbol = symbol.upper()
    now = datetime.now(timezone.utc)

    with get_db() as conn:
        row = conn.execute(
            "SELECT updated_at FROM stocks WHERE symbol = ?",
            (symbol,)
        ).fetchone()

        # Check cache / TTL
        if row:
            try:
                last = datetime.strptime(
                    row["updated_at"],
                    "%Y-%m-%d %H:%M:%S"
                ).replace(tzinfo=timezone.utc)

                if now - last <= STOCK_METADATA_TTL:
                    return True

            except Exception:
                pass  # fall through → refresh

        # Fetch fresh data
        data = search_stock_info(symbol)

        if not data:
            return False

        name = data.get("shortname") or data.get("longname")
        sector = data.get("sector")
        industry = data.get("industry")
        exchange = data.get("exchDisp")

        if not name:
            return False

        # Upsert
        conn.execute("""
            INSERT INTO stocks (symbol, name, sector, industry, exchange, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(symbol) DO UPDATE SET
                name = excluded.name,
                sector = excluded.sector,
                industry = excluded.industry,
                exchange = excluded.exchange,
                updated_at = datetime('now')
        """, (symbol, name, sector, industry, exchange))

        conn.commit()

    return True


def get_stock_snapshot(symbol: str) -> dict:
    symbol = symbol.upper()
    now = datetime.now(timezone.utc)

    with get_db() as conn:
        row = conn.execute("""
            SELECT price, prev_close, change, change_pct, updated_at
            FROM stock_snapshots
            WHERE symbol = ?
        """, (symbol,)).fetchone()

        # Cache hit
        if row:
            try:
                last = datetime.strptime(
                    row["updated_at"],
                    "%Y-%m-%d %H:%M:%S"
                ).replace(tzinfo=timezone.utc)

                if now - last <= STOCK_SNAPSHOT_TTL:
                    return {
                        "symbol": symbol,
                        "price": row["price"],
                        "prev_close": row["prev_close"],
                        "change": row["change"],
                        "change_pct": row["change_pct"],
                    }
            except Exception:
                pass

        # Refresh snapshot
        snapshot = _fetch_stock_snapshot(symbol)

        conn.execute("""
            INSERT INTO stock_snapshots
            (symbol, price, prev_close, change, change_pct, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(symbol) DO UPDATE SET
                price = excluded.price,
                prev_close = excluded.prev_close,
                change = excluded.change,
                change_pct = excluded.change_pct,
                updated_at = datetime('now')
        """, (
            symbol,
            snapshot["price"],
            snapshot["prev_close"],
            snapshot["change"],
            snapshot["change_pct"],
        ))

        conn.commit()

    return snapshot


def get_batch_snapshots(symbols: Iterable[str]) -> dict[str, dict]:
    """
    Batch wrapper around get_stock_snapshot().
    Uses per-symbol cache + TTL already implemented.

    Returns:
        {
            "AAPL": {...},
            "MSFT": {...},
            ...
        }
    """
    results: dict[str, dict] = {}

    # Normalize + dedupe
    unique_symbols = {
        s.upper() for s in symbols if s
    }

    for symbol in unique_symbols:
        try:
            results[symbol] = get_stock_snapshot(symbol)
        except TradingError:
            # Silent fail — watchlist should never hard-crash
            continue
        except Exception as e:
            logger.exception(
                "StockSnapshotBatchFailure symbol=%s cause=%s",
                symbol,
                type(e).__name__
            )
            continue

    return results
