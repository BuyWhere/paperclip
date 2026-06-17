"""Resend email service client for the 8os orchestrator.

This client wraps the Resend HTTP API for two use-cases:

1. **Audience contact push** — adds new waitlist signups to a Resend Audience,
   segmented by archetype + affiliate_opt_in. Fire-and-forget: failures are
   logged, never raised to the caller. Lets Mira's outreach flow auto-sync
   with /coming-soon capture without coupling the waitlist join response to
   the Resend API.

2. **Transactional email** — replaces the SMTP path in `email.py` when
   `RESEND_API_KEY` is set. Falls back to SMTP if configured, then to a
   log-only no-op (for dev).

The client is intentionally a thin wrapper over httpx — no SDK dep — so the
dependency surface stays minimal and the code path is auditable in one
place. All functions fail-soft (return False on error, never raise) so a
Resend outage cannot break /waitlist/join.

Reference: https://resend.com/docs/api-reference/contacts/create-contact
           https://resend.com/docs/api-reference/emails/send-email
"""
import json
import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger("8os.resend")

_RESEND_API_BASE = "https://api.resend.com"
_TIMEOUT_SECONDS = 5.0


def is_resend_configured() -> bool:
    """True iff RESEND_API_KEY is set. Audience + email push are gated on this."""
    return bool(get_settings().resend_api_key)


def is_audience_push_enabled() -> bool:
    """True iff the audience push side effect is enabled.

    Separated from `is_resend_configured` so we can roll out the code path
    with the key in env but the flag off. Lets the smoke probe verify the
    no-op branch independently of the key.
    """
    return is_resend_configured() and bool(get_settings().resend_audience_push_enabled)


async def add_contact_to_audience(
    email: str,
    archetype: str | None = None,
    affiliate_opt_in: bool = False,
    unsubscribed: bool = False,
) -> bool:
    """Add a contact to the configured Resend Audience. Returns True on 2xx.

    Segment-by-folder strategy: derive the audience segment from the contact
    metadata. Resend's free tier audiences don't auto-segment; we use the
    `archetype` + `affiliate_opt_in` as custom fields so Mira can build
    dynamic segments in the Resend UI without a code change.

    Fails soft: returns False on any error and logs a structured event. The
    caller (typically /waitlist/join fire-and-forget) should not retry.
    """
    settings = get_settings()
    if not is_audience_push_enabled():
        logger.info(json.dumps({
            "event": "resend_skipped",
            "reason": "audience_push_disabled" if is_resend_configured() else "resend_not_configured",
            "email": email,
        }))
        return False

    audience_id = settings.resend_audience_id
    if not audience_id:
        logger.warning(json.dumps({
            "event": "resend_skipped",
            "reason": "audience_id_missing",
            "email": email,
        }))
        return False

    payload: dict[str, Any] = {
        "email": email,
        "unsubscribed": unsubscribed,
    }
    if archetype:
        payload["archetype"] = archetype
    payload["affiliate_opt_in"] = bool(affiliate_opt_in)

    url = f"{_RESEND_API_BASE}/audiences/{audience_id}/contacts"
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if 200 <= resp.status_code < 300:
            logger.info(json.dumps({
                "event": "resend_audience_add_ok",
                "email": email,
                "audience_id": audience_id,
                "status": resp.status_code,
            }))
            return True
        # Resend returns 422 if contact exists — treat as success (idempotent).
        if resp.status_code == 422 and "already exists" in resp.text.lower():
            logger.info(json.dumps({
                "event": "resend_audience_add_exists",
                "email": email,
            }))
            return True
        logger.warning(json.dumps({
            "event": "resend_audience_add_failed",
            "email": email,
            "status": resp.status_code,
            "body": resp.text[:500],
        }))
        return False
    except Exception as exc:  # noqa: BLE001 — fail soft, never raise
        logger.warning(json.dumps({
            "event": "resend_audience_add_error",
            "email": email,
            "error": str(exc),
        }))
        return False


async def send_email(
    to: str,
    subject: str,
    html: str,
    text: str,
    *,
    reply_to: str | None = None,
) -> bool:
    """Send a transactional email via Resend. Returns True on 2xx.

    Fails soft: returns False on error. The caller (e.g. /waitlist/send-early-access)
    tracks success/failure counts and the smoke probe asserts the no-key path
    is a graceful no-op.
    """
    settings = get_settings()
    if not is_resend_configured():
        logger.info(json.dumps({
            "event": "resend_email_skipped",
            "reason": "resend_not_configured",
            "to": to,
        }))
        return False

    payload: dict[str, Any] = {
        "from": f"{settings.resend_from_name} <{settings.resend_from_email}>",
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    if reply_to:
        payload["reply_to"] = reply_to

    url = f"{_RESEND_API_BASE}/emails"
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if 200 <= resp.status_code < 300:
            logger.info(json.dumps({
                "event": "resend_email_ok",
                "to": to,
                "subject": subject,
                "status": resp.status_code,
            }))
            return True
        logger.warning(json.dumps({
            "event": "resend_email_failed",
            "to": to,
            "subject": subject,
            "status": resp.status_code,
            "body": resp.text[:500],
        }))
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning(json.dumps({
            "event": "resend_email_error",
            "to": to,
            "subject": subject,
            "error": str(exc),
        }))
        return False
