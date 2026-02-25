import yfinance as yf
from datetime import datetime
from markupsafe import Markup
from decimal import Decimal

def search_stock_info(query: str):
    try:
        return yf.Search(query, enable_fuzzy_query=True).response["quotes"][0]
    except Exception:
        return None

def lookup_quote(ticker: str):
    try:
        return yf.Ticker(ticker).info.get("regularMarketPrice")
    except Exception:
        return None

def to_decimal(value):
    """Safely convert numeric DB/float/string to Decimal."""
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def decimal_str(d: Decimal):
    return f"{d:.2f}"


def usd(value):
    return f"${value:,.2f}"


def format_dob(value):
    if not value:
        return ""

    try:
        if isinstance(value, str):
            d = datetime.strptime(value, "%Y-%m-%d").date()
        else:
            d = value

        day = d.day

        if 11 <= day <= 13:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")

        formatted = d.strftime("%B ") + f"{day}<sup>{suffix}</sup>, " + d.strftime("%Y")
        return Markup(formatted)

    except Exception:
        return value
