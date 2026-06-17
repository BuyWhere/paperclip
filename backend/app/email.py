"""Early access email sender with Resend-first, SMTP-fallback, no-op-last.

OS-1176 wires Resend as the primary transport for the 8os launch email
(Mira's OS-1070 blast, /waitlist/send-early-access). SMTP is kept as a
fallback for environments where Resend is not yet provisioned. When neither
is configured, the call is a structured no-op (returns False, logs
`early_access_email_skipped`).
"""
import json
import logging

import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings
from app.resend_client import is_resend_configured, send_email as resend_send_email

logger = logging.getLogger("8os.email")


def _build_early_access_bodies(early_access_url: str) -> tuple[str, str]:
    """Return (html, text) bodies for the early access email."""
    html_body = f"""
    <html><body>
    <p>Hi,</p>
    <p>You've been granted early access to 8OS. Click the link below to get started:</p>
    <p><a href="{early_access_url}">{early_access_url}</a></p>
    <p>Welcome aboard,<br>The 8OS Team</p>
    </body></html>
    """
    text_body = (
        f"You've been granted early access to 8OS.\n\n"
        f"Get started here: {early_access_url}\n\n"
        f"Welcome aboard,\nThe 8OS Team"
    )
    return html_body, text_body


async def _send_via_smtp(recipient_email: str, early_access_url: str) -> bool:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_user or not settings.smtp_password:
        return False

    html_body, text_body = _build_early_access_bodies(early_access_url)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "You're in — 8OS Early Access"
    msg["From"] = settings.smtp_from
    msg["To"] = recipient_email
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=True,
        )
        logger.info(json.dumps({"event": "early_access_email_sent", "transport": "smtp", "to": recipient_email}))
        return True
    except Exception as exc:
        logger.warning(json.dumps({
            "event": "early_access_email_smtp_failed",
            "to": recipient_email,
            "error": str(exc),
        }))
        return False


async def send_early_access_email(recipient_email: str, early_access_url: str) -> bool:
    """Send an early access invitation email. Returns True on success, False on failure.

    Transport priority: Resend (preferred) → SMTP (legacy) → no-op (log).
    Resend is preferred because deliverability is better for the launch
    blast and it provides the audience metrics Mira needs for the segmented
    campaign (OS-1070, OS-1223). SMTP remains as a fallback for tests and
    environments where Resend is not yet configured.
    """
    settings = get_settings()
    html_body, text_body = _build_early_access_bodies(early_access_url)

    if is_resend_configured():
        ok = await resend_send_email(
            to=recipient_email,
            subject="You're in — 8OS Early Access",
            html=html_body,
            text=text_body,
            reply_to=settings.resend_from_email,
        )
        if ok:
            return True
        logger.info(json.dumps({
            "event": "early_access_email_resend_failed_fallback_smtp",
            "to": recipient_email,
        }))

    smtp_ok = await _send_via_smtp(recipient_email, early_access_url)
    if smtp_ok:
        return True

    logger.warning(json.dumps({
        "event": "early_access_email_skipped",
        "reason": "no_transport_configured",
        "to": recipient_email,
    }))
    return False
