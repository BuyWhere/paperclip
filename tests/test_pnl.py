"""Tests for the P&L aggregation endpoint and service layer."""

import os
from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

# Must be set before importing app modules
os.environ["API_KEY"] = "test-api-key-thirty-two-chars-ok!"

from app.services import pnl as pnl_service
from app.schemas import BrokerSummary, DailyPnL, PnLResponse


# ---------------------------------------------------------------------------
# Service-layer tests
# ---------------------------------------------------------------------------

class TestPnlService:
    def test_get_available_brokers(self):
        brokers = pnl_service.get_available_brokers()
        assert isinstance(brokers, list)
        assert len(brokers) >= 3
        assert "alpaca" in brokers
        assert "ibkr" in brokers
        assert "coinbase" in brokers

    def test_fetch_pnl_defaults(self):
        data = pnl_service.fetch_pnl_data()
        assert data["total_trading_days"] > 0
        assert data["total_pnl"] != 0.0
        assert 0 <= data["win_rate"] <= 1
        assert len(data["daily_breakdown"]) == data["total_trading_days"]
        assert data["days_requested"] == 30

    def test_fetch_pnl_broker_filter(self):
        data = pnl_service.fetch_pnl_data(days=14, broker_filter="alpaca")
        assert list(data["per_broker"].keys()) == ["alpaca"]
        assert all(e["broker"] == "alpaca" for e in data["daily_breakdown"])

    def test_fetch_pnl_unknown_broker(self):
        data = pnl_service.fetch_pnl_data(broker_filter="not_a_broker")
        assert data["total_trading_days"] == 0
        assert data["total_pnl"] == 0.0

    def test_fetch_pnl_short_period(self):
        data = pnl_service.fetch_pnl_data(days=1)
        # days=1 means start=yesterday, end=today. Both weekdays → 3 brokers × 2 days = 6
        # On weekends → 0. We accept either.
        assert data["total_trading_days"] in (0, 6)  # 0=weekend, 6=2 weekdays × 3 brokers
        assert data["days_requested"] == 1

    def test_per_broker_summary_structure(self):
        data = pnl_service.fetch_pnl_data(days=7)
        for broker_key, summary in data["per_broker"].items():
            assert isinstance(summary["starting_balance"], float)
            assert isinstance(summary["current_nav"], float)
            assert summary["current_nav"] > 0
            assert summary["total_return_pct"] != 0.0
            assert summary["trading_days"] > 0

    def test_win_rate_range(self):
        data = pnl_service.fetch_pnl_data(days=90)
        assert 0 <= data["win_rate"] <= 1

    def test_daily_entry_structure(self):
        data = pnl_service.fetch_pnl_data(days=10)
        entry = data["daily_breakdown"][0]
        for key in ("date", "broker", "pnl", "nav", "return_pct"):
            assert key in entry


# ---------------------------------------------------------------------------
# Schema validation tests
# ---------------------------------------------------------------------------

class TestPnlSchemas:
    def test_daily_pnl_schema(self):
        entry = DailyPnL(date="2026-06-01", broker="alpaca", pnl=100.0, nav=50100.0, return_pct=0.2)
        assert entry.date == "2026-06-01"

    def test_broker_summary_schema(self):
        s = BrokerSummary(
            broker_key="alpaca",
            broker_name="Alpaca Markets",
            account_type="equities",
            starting_balance=50000.0,
            current_nav=51200.0,
            total_pnl=1200.0,
            total_return_pct=2.4,
            trading_days=45,
        )
        assert s.broker_key == "alpaca"

    def test_pnl_response_schema(self):
        data = pnl_service.fetch_pnl_data(days=5)
        response = PnLResponse(**data)
        assert response.total_trading_days == data["total_trading_days"]
        assert len(response.daily_breakdown) == data["total_trading_days"]
        assert isinstance(response.per_broker, dict)


# ---------------------------------------------------------------------------
# API-layer tests (via TestClient)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    """Build a TestClient using a module-scoped app override."""
    from app.main import app
    return TestClient(app)


class TestPnlEndpoint:
    """Requires asyncpg driver — these test the app at the ASGI layer.

    To run, install asyncpg (not always available in CI). The actual
    database engine import happens at module level in app.database,
    so these are more integration-level.
    """

    def test_no_auth(self, client):
        resp = client.get("/pnl")
        assert resp.status_code == 401

    def test_invalid_api_key(self, client):
        resp = client.get("/pnl", headers={"X-API-Key": "wrong-key"})
        assert resp.status_code == 401

    def test_valid_request(self, client):
        resp = client.get("/pnl", headers={"X-API-Key": os.environ["API_KEY"]})
        assert resp.status_code == 200
        body = resp.json()
        assert "total_pnl" in body
        assert "daily_breakdown" in body
        assert "per_broker" in body
        assert "win_rate" in body

    def test_broker_filter(self, client):
        resp = client.get(
            "/pnl?broker=alpaca",
            headers={"X-API-Key": os.environ["API_KEY"]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert list(body["per_broker"].keys()) == ["alpaca"]

    def test_invalid_broker_404(self, client):
        resp = client.get(
            "/pnl?broker=nonexistent",
            headers={"X-API-Key": os.environ["API_KEY"]},
        )
        assert resp.status_code == 404

    def test_days_param(self, client):
        resp = client.get(
            "/pnl?days=5",
            headers={"X-API-Key": os.environ["API_KEY"]},
        )
        assert resp.status_code == 200
        assert resp.json()["days_requested"] == 5

    def test_days_out_of_range(self, client):
        resp = client.get(
            "/pnl?days=999",
            headers={"X-API-Key": os.environ["API_KEY"]},
        )
        # FastAPI validation returns 422 for invalid query params
        assert resp.status_code == 422

    def test_response_schema_matches_model(self, client):
        resp = client.get("/pnl", headers={"X-API-Key": os.environ["API_KEY"]})
        body = resp.json()
        validated = PnLResponse(**body)
        assert validated.total_pnl == body["total_pnl"]
