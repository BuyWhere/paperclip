"""Unit tests for app.resend_client.

Tests are run with:
    cd backend && pytest tests/test_resend_client.py -v

The tests use respx to mock the Resend HTTP API. To run them you need:
    pip install respx pytest pytest-asyncio

In environments where respx is not installed, the tests self-skip via
`@pytest.mark.skipif` so the test suite still runs for the rest of the
project.
"""
import pytest

try:
    import respx
    from httpx import Response
except ImportError:  # pragma: no cover — degrade gracefully
    respx = None
    Response = None

from app.resend_client import (
    add_contact_to_audience,
    is_audience_push_enabled,
    is_resend_configured,
    send_email,
)


pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _enable_resend(monkeypatch):
    """Enable Resend for the test by setting env vars + clearing the
    lru_cache on get_settings so the new values take effect.
    """
    monkeypatch.setenv("RESEND_API_KEY", "re_test_fake_key")
    monkeypatch.setenv("RESEND_AUDIENCE_ID", "aud_test_audience")
    monkeypatch.setenv("RESEND_AUDIENCE_PUSH_ENABLED", "true")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "noreply@8os.ai")
    monkeypatch.setenv("RESEND_FROM_NAME", "8OS")
    from app.config import get_settings
    get_settings.cache_clear()


async def test_is_audience_push_enabled_when_configured():
    assert is_resend_configured() is True
    assert is_audience_push_enabled() is True


@pytest.mark.skipif(respx is None, reason="respx not installed")
async def test_add_contact_to_audience_success():
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/audiences/aud_test_audience/contacts").mock(
            return_value=Response(200, json={"id": "contact_123"})
        )
        ok = await add_contact_to_audience("user@example.com", archetype="explorer", affiliate_opt_in=True)
        assert ok is True
        assert route.called
        import json
        request_body = json.loads(route.calls.last.request.content)
        assert request_body["email"] == "user@example.com"
        assert request_body["archetype"] == "explorer"
        assert request_body["affiliate_opt_in"] is True


@pytest.mark.skipif(respx is None, reason="respx not installed")
async def test_add_contact_to_audience_already_exists_is_idempotent():
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/audiences/aud_test_audience/contacts").mock(
            return_value=Response(422, text="contact already exists")
        )
        ok = await add_contact_to_audience("user@example.com")
        assert ok is True
        assert route.called


@pytest.mark.skipif(respx is None, reason="respx not installed")
async def test_add_contact_to_audience_failure_returns_false():
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/audiences/aud_test_audience/contacts").mock(
            return_value=Response(500, text="server error")
        )
        ok = await add_contact_to_audience("user@example.com")
        assert ok is False
        assert route.called


@pytest.mark.skipif(respx is None, reason="respx not installed")
async def test_send_email_success():
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(
            return_value=Response(200, json={"id": "email_abc"})
        )
        ok = await send_email(
            to="user@example.com",
            subject="Test",
            html="<p>hi</p>",
            text="hi",
        )
        assert ok is True
        assert route.called
        import json
        request_body = json.loads(route.calls.last.request.content)
        assert request_body["to"] == ["user@example.com"]
        assert request_body["from"] == "8OS <noreply@8os.ai>"


async def test_no_op_when_push_disabled(monkeypatch):
    """When RESEND_AUDIENCE_PUSH_ENABLED is False, the audience push is a
    no-op even if RESEND_API_KEY is set. Lets the operator separate
    deploy from rollout.
    """
    monkeypatch.setenv("RESEND_API_KEY", "re_test_fake_key")
    monkeypatch.setenv("RESEND_AUDIENCE_ID", "aud_test_audience")
    monkeypatch.setenv("RESEND_AUDIENCE_PUSH_ENABLED", "false")
    from app.config import get_settings
    get_settings.cache_clear()

    assert is_resend_configured() is True
    assert is_audience_push_enabled() is False
    ok = await add_contact_to_audience("user@example.com")
    assert ok is False


async def test_no_op_when_key_missing(monkeypatch):
    """No-op when RESEND_API_KEY is unset (the pre-wire default)."""
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("RESEND_AUDIENCE_ID", raising=False)
    monkeypatch.delenv("RESEND_AUDIENCE_PUSH_ENABLED", raising=False)
    from app.config import get_settings
    get_settings.cache_clear()

    assert is_resend_configured() is False
    assert is_audience_push_enabled() is False
    ok = await add_contact_to_audience("user@example.com")
    assert ok is False
    ok = await send_email("user@example.com", "subj", "<p>x</p>", "x")
    assert ok is False
