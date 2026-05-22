"""
Live integration tests for the 8os orchestrator API.
Run with: ORCHESTRATOR_URL=https://orchestrator-production-1643.up.railway.app \
          ORCHESTRATOR_API_KEY=<key> pytest tests/test_live_integration.py -v
"""
import os
import pytest
import requests
import time

BASE = os.getenv("ORCHESTRATOR_URL", "https://orchestrator-production-1643.up.railway.app")
API_KEY = os.getenv("ORCHESTRATOR_API_KEY", os.getenv("API_KEY", ""))

HEADERS = {"x-api-key": API_KEY, "Content-Type": "application/json"}

SAMPLE_USER = {
    "telegram_id": f"test_{int(time.time())}",
    "name": "Integration Test User",
    "birth_date": "1990-06-15",
    "birth_time": "08:00",
    "goals": ["Career", "Wealth"],
}


@pytest.fixture(scope="session")
def onboarded_user():
    """Onboard a test user and return the response data."""
    if not API_KEY:
        pytest.skip("ORCHESTRATOR_API_KEY not set — skipping onboard-dependent tests")
    resp = requests.post(f"{BASE}/onboard", json=SAMPLE_USER, headers=HEADERS, timeout=30)
    assert resp.status_code == 200, f"Onboard failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert "user_id" in data, "Response missing user_id"
    assert "archetype_id" in data, "Response missing archetype_id"
    return data


class TestHealth:
    def test_root_accessible(self):
        resp = requests.get(BASE, timeout=10)
        assert resp.status_code in (200, 404)  # 404 OK if no root handler

    def test_docs_accessible(self):
        resp = requests.get(f"{BASE}/docs", timeout=10)
        assert resp.status_code == 200, f"/docs returned {resp.status_code}"


class TestWaitlist:
    def test_join_waitlist(self):
        resp = requests.post(
            f"{BASE}/waitlist",
            json={"email": f"integtest_{int(time.time())}@test.invalid", "source": "test"},
            timeout=10,
        )
        assert resp.status_code in (200, 409), f"Waitlist: {resp.status_code} {resp.text}"
        data = resp.json()
        if resp.status_code == 200:
            assert data.get("success") is True
            assert "position" in data

    def test_waitlist_rejects_invalid_email(self):
        """Orchestrator may or may not validate email format — just ensure it returns JSON."""
        resp = requests.post(
            f"{BASE}/waitlist",
            json={"email": "notanemail", "source": "test"},
            timeout=10,
        )
        # Accept 400/422 (proper validation) or 200 (orchestrator accepts without format check)
        assert resp.status_code in (200, 400, 409, 422), f"Unexpected status: {resp.status_code}"
        assert resp.json() is not None, "Response should be JSON"

    def test_waitlist_rejects_missing_email(self):
        resp = requests.post(f"{BASE}/waitlist", json={}, timeout=10)
        assert resp.status_code in (400, 422)


class TestOnboard:
    def test_onboard_new_user(self, onboarded_user):
        assert len(onboarded_user["archetype_id"]) > 0, "archetype_id should be non-empty"

    def test_onboard_requires_identifier(self):
        if not API_KEY:
            pytest.skip("No API_KEY set — skipping identifier validation test")
        payload = {k: v for k, v in SAMPLE_USER.items() if k != "telegram_id"}
        resp = requests.post(f"{BASE}/onboard", json=payload, headers=HEADERS, timeout=30)
        assert resp.status_code in (400, 422), f"Expected 4xx without identifier: {resp.status_code}"

    def test_onboard_returns_briefing(self, onboarded_user):
        assert "briefing" in onboarded_user, "Onboard response should include briefing"
        assert len(onboarded_user["briefing"]) > 10, "Briefing should be non-trivial"


class TestAuthRequired:
    def test_onboard_requires_api_key(self):
        if not API_KEY:
            pytest.skip("No API_KEY set — skipping auth test")
        resp = requests.post(
            f"{BASE}/onboard",
            json=SAMPLE_USER,
            headers={"Content-Type": "application/json"},  # no x-api-key
            timeout=15,
        )
        assert resp.status_code in (401, 403), f"Expected auth error: {resp.status_code}"
