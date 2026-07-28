from fastapi.testclient import TestClient

from app.main import app


def _client() -> TestClient:
    # Local test runs often lack Redis; disable only rate limiting so requests
    # reach the handlers/dependencies under test.
    app.state.limiter.enabled = False
    return TestClient(app, raise_server_exceptions=False)


def test_legacy_register_returns_gone_without_parsing_body():
    with _client() as client:
        response = client.post("/auth/register", json={})

    assert response.status_code == 410
    assert "retired" in response.json()["detail"]


def test_legacy_verify_returns_gone_without_parsing_body():
    with _client() as client:
        response = client.post("/auth/verify", json={})

    assert response.status_code == 410
    assert "retired" in response.json()["detail"]


def test_alignment_root_public_status():
    with _client() as client:
        response = client.get("/alignment")

    # /alignment is a public status alias for /api/alignment — no auth required.
    assert response.status_code == 200
    assert response.json()["status"] == "live"
    assert response.json()["engine"] == "alignment-engine"


def test_alignment_tool_spec_returns_get_alignment_schema():
    with _client() as client:
        response = client.get("/api/alignment/tool-spec")

    assert response.status_code == 200
    assert response.json()["function"]["name"] == "get_alignment"


def test_alignment_tool_call_alias_requires_bearer_token():
    with _client() as client:
        response = client.post(
            "/alignment/tool-call",
            json={"birthDate": "1990-01-01", "personalityCode": "sg"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"


def test_api_alignment_tool_call_requires_bearer_token():
    with _client() as client:
        response = client.post(
            "/api/alignment/tool-call",
            json={"birthDate": "1990-01-01", "personalityCode": "sg"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"
