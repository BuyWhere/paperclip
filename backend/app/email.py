import logging

import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

logger = logging.getLogger("8os.email")


async def send_early_access_email(recipient_email: str, early_access_url: str) -> bool:
    """Send an early access invitation email. Returns True on success, False on failure."""
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_user or not settings.smtp_password:
        logger.warning("SMTP not configured — skipping early access email to %s", recipient_email)
        return False

    subject = "You're in — 8OS Early Access"
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

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
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
        logger.info("Early access email sent to %s", recipient_email)
        return True
    except Exception as exc:
        logger.error("Failed to send early access email to %s: %s", recipient_email, exc)
        return False
