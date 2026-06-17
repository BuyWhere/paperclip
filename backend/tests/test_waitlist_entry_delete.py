"""
Unit tests for OS-1237 — restore /waitlist/entry/{entry_id} DELETE on
the orchestrator. The endpoint was lost when the OS-1176 wire-code
deploy (b75215d0) cherry-picked onto the /telegram/webhook lineage
instead of the web-dashboard lineage. This test pins the service
function and the route in isolation so future lineage shuffles don't
regress it.

Run with: pytest tests/test_waitlist_entry_delete.py -v

Route tests build a minimal FastAPI app with the route handler
imported from app.main and the get_db_session dependency overridden,
so we don't drag the full app's SlowAPI/Redis middleware into the
test. Service tests run the function directly.
"""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession


# Make sure we import from THIS worktree's backend, not the e08031a9
# 8os-ai/ororchestrator clone that lives elsewhere on the host.
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.config import get_settings  # noqa: E402
from app.services import delete_waitlist_entry  # noqa: E402


ADMIN_KEY = "test-admin-key-please-change"
ENTRY_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _wire_admin(monkeypatch):
    """Force ADMIN_API_KEY to a known value and bust the settings cache."""
    monkeypatch.setenv("ADMIN_API_KEY", ADMIN_KEY)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _make_session(existing):
    """Build a session double where session.get returns the given
    entry (or None) and session.delete/commit are awaitable mocks."""
    session = MagicMock()
    session.get = AsyncMock(return_value=existing)
    session.delete = AsyncMock(return_value=None)
    session.commit = AsyncMock(return_value=None)
    return session


# ---------------------------------------------------------------------------
# Service-layer tests
# ---------------------------------------------------------------------------


class TestDeleteWaitlistEntryService:
    pytestmark = pytest.mark.asyncio

    async def test_returns_none_when_entry_missing(self):
        session = _make_session(existing=None)
        result = await delete_waitlist_entry(session, "not-a-real-id")
        assert result is None
        session.delete.assert_not_called()
        session.commit.assert_not_called()

    async def test_returns_entry_and_deletes_when_present(self):
        fake_entry = MagicMock()
        fake_entry.id = ENTRY_ID
        session = _make_session(existing=fake_entry)
        result = await delete_waitlist_entry(session, ENTRY_ID)
        assert result is fake_entry
        session.delete.assert_awaited_once_with(fake_entry)
        session.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# Route-layer tests (auth + 404 + 200) — minimal app to avoid SlowAPI/Redis
# ---------------------------------------------------------------------------


def _build_minimal_app(route_handler, session, db_dep) -> FastAPI:
    """Build a FastAPI app with the new DELETE route registered
    against the real require_admin dependency and a stubbed db
    session, so the rate-limit middleware in app.main never runs."""
    from fastapi import Depends
    from app.dependencies import require_admin

    app = FastAPI()

    async def _override_db():
        yield session

    # dependency_overrides must be set BEFORE the route is included so
    # FastAPI captures the overridden callable.
    app.dependency_overrides[db_dep] = _override_db

    @app.delete(
        "/waitlist/entry/{entry_id}",
        dependencies=[Depends(require_admin)],
    )
    async def _route(entry_id: str, db: AsyncSession = Depends(db_dep)):
        return await route_handler(entry_id=entry_id, db=db)

    return app


class TestDeleteWaitlistEntryRoute:
    @pytest.fixture
    def route_handler(self):
        """Import the route function out of app.main without dragging
        the full app module (and its SlowAPI/Redis middleware) in."""
        from app.main import delete_waitlist_entry_endpoint
        return delete_waitlist_entry_endpoint

    @pytest.fixture
    def db_dep(self):
        from app.database import get_db_session
        return get_db_session

    def test_unauthenticated_returns_401(self, route_handler, db_dep):
        fake_entry = MagicMock()
        fake_entry.id = ENTRY_ID
        session = _make_session(existing=fake_entry)
        app = _build_minimal_app(route_handler, session, db_dep)
        client = TestClient(app)
        r = client.delete(f"/waitlist/entry/{ENTRY_ID}")
        assert r.status_code == 401

    def test_wrong_admin_key_returns_401(self, route_handler, db_dep):
        fake_entry = MagicMock()
        fake_entry.id = ENTRY_ID
        session = _make_session(existing=fake_entry)
        app = _build_minimal_app(route_handler, session, db_dep)
        client = TestClient(app)
        r = client.delete(
            f"/waitlist/entry/{ENTRY_ID}",
            headers={"x-api-key": "wrong-key"},
        )
        assert r.status_code == 401

    def test_missing_entry_returns_404(self, route_handler, db_dep):
        session = _make_session(existing=None)
        app = _build_minimal_app(route_handler, session, db_dep)
        client = TestClient(app)
        r = client.delete(
            f"/waitlist/entry/{ENTRY_ID}",
            headers={"x-api-key": ADMIN_KEY},
        )
        assert r.status_code == 404
        assert ENTRY_ID in r.json().get("detail", "")
        session.delete.assert_not_called()
        session.commit.assert_not_called()

    def test_existing_entry_returns_200_with_deleted_shape(self, route_handler, db_dep):
        fake_entry = MagicMock()
        fake_entry.id = ENTRY_ID
        session = _make_session(existing=fake_entry)
        app = _build_minimal_app(route_handler, session, db_dep)
        client = TestClient(app)
        r = client.delete(
            f"/waitlist/entry/{ENTRY_ID}",
            headers={"x-api-key": ADMIN_KEY},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["deleted"] is True
        assert body["id"] == ENTRY_ID
        session.delete.assert_awaited_once_with(fake_entry)
        session.commit.assert_awaited_once()
