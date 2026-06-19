"""
Mock broker P&L data service.

Provides simulated profit/loss data that can later be replaced with
real broker API calls (e.g. Alpaca, Interactive Brokers, TD Ameritrade).
"""
import calendar
import random
from datetime import date, datetime, timedelta

# Seed for reproducibility across heartbeats
random.seed(42)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _market_days_since(start: date, end: date | None = None) -> list[date]:
    """Return weekdays (Mon–Fri) between *start* and *end* (default today)."""
    end = end or date.today()
    days: list[date] = []
    current = start
    while current <= end:
        if current.weekday() < 5:  # Mon=0 … Fri=4
            days.append(current)
        current += timedelta(days=1)
    return days


def _random_trade_day(base: date, volatility: float = 0.015) -> float:
    """Simulate a single trading day P&L (positive drift + noise)."""
    drift = 0.002  # slight upward drift
    noise = random.gauss(0, volatility)
    return drift + noise


# ---------------------------------------------------------------------------
# Broker configuration (would come from DB / env in production)
# ---------------------------------------------------------------------------

BROKER_META: dict[str, dict] = {
    "alpaca": {
        "name": "Alpaca Markets",
        "account_type": "equities",
        "starting_balance": 50_000.00,
    },
    "ibkr": {
        "name": "Interactive Brokers",
        "account_type": "multi-asset",
        "starting_balance": 120_000.00,
    },
    "coinbase": {
        "name": "Coinbase Pro",
        "account_type": "crypto",
        "starting_balance": 25_000.00,
    },
}

TRADING_SINCE: dict[str, date] = {
    "alpaca": date(2025, 6, 1),
    "ibkr": date(2025, 3, 15),
    "coinbase": date(2025, 9, 1),
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_available_brokers() -> list[str]:
    """Return broker keys that have mock data available."""
    return sorted(BROKER_META)


def fetch_pnl_data(
    days: int = 30,
    broker_filter: str | None = None,
) -> dict:
    """
    Return aggregated P&L data for the last *days* trading days.

    Parameters
    ----------
    days : int
        Look-back period in calendar days (default 30).
    broker_filter : str or None
        If set, only return data for this broker key.

    Returns
    -------
    dict with keys:
      - total_pnl          float  — sum of P&L across all brokers
      - daily_breakdown    list   — per-day entries
      - per_broker         dict   — per-broker summaries
      - win_rate           float  — fraction of profitable trading days
      - total_trading_days int
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    trading_days = _market_days_since(start_date, end_date)

    brokers = [b for b in get_available_brokers() if broker_filter is None or b == broker_filter]
    if not brokers:
        return _empty_response()

    daily: list[dict] = []
    per_broker: dict[str, dict] = {}
    grand_total = 0.0
    profitable_days = 0
    total_trading_days = 0

    for b in brokers:
        meta = BROKER_META[b]
        portfolio_nav = float(meta["starting_balance"])
        broker_daily: list[dict] = []
        broker_total = 0.0

        for td in trading_days:
            # Skip days before this broker started trading
            if td < TRADING_SINCE[b]:
                continue

            daily_return = _random_trade_day(td)
            pnl = round(portfolio_nav * daily_return, 2)
            portfolio_nav += pnl
            broker_total += pnl

            entry = {
                "date": td.isoformat(),
                "broker": b,
                "pnl": pnl,
                "nav": round(portfolio_nav, 2),
                "return_pct": round(daily_return * 100, 4),
            }
            daily.append(entry)
            broker_daily.append(entry)

            if pnl > 0:
                profitable_days += 1
            total_trading_days += 1

        per_broker[b] = {
            "broker_key": b,
            "broker_name": meta["name"],
            "account_type": meta["account_type"],
            "starting_balance": meta["starting_balance"],
            "current_nav": round(portfolio_nav, 2),
            "total_pnl": round(broker_total, 2),
            "total_return_pct": round(
                (portfolio_nav - meta["starting_balance"]) / meta["starting_balance"] * 100,
                4,
            ),
            "trading_days": len(broker_daily),
        }
        grand_total += broker_total

    win_rate = profitable_days / total_trading_days if total_trading_days > 0 else 0.0

    return {
        "total_pnl": round(grand_total, 2),
        "daily_breakdown": sorted(daily, key=lambda x: x["date"]),
        "per_broker": per_broker,
        "win_rate": round(win_rate, 4),
        "total_trading_days": total_trading_days,
        "days_requested": days,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
    }


def _empty_response() -> dict:
    return {
        "total_pnl": 0.0,
        "daily_breakdown": [],
        "per_broker": {},
        "win_rate": 0.0,
        "total_trading_days": 0,
        "days_requested": 30,
        "start_date": None,
        "end_date": None,
    }
