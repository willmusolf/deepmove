"""email.py — Transactional email via Resend.

Only used for password reset emails. In development (no RESEND_API_KEY),
the reset URL is logged to the console instead of sent.
"""
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """Send a password reset email. Returns True on success (or dev-mode log)."""
    reset_url = (
        f"{settings.frontend_url}/reset-password?token={reset_token}"
    )

    if not settings.resend_api_key:
        # Development mode: print to log so the developer can test the flow
        # without needing a Resend account.
        logger.info(
            "DEV mode — password reset URL for %s: %s",
            to_email,
            reset_url,
        )
        return True

    try:
        import resend  # type: ignore[import-untyped]

        resend.api_key = settings.resend_api_key
        resend.Emails.send(
            {
                "from": settings.password_reset_from_email,
                "to": [to_email],
                "subject": "Reset your DeepMove password",
                "html": (
                    "<p>Click the link below to reset your DeepMove password:</p>"
                    f'<p><a href="{reset_url}">{reset_url}</a></p>'
                    f"<p>This link expires in {settings.password_reset_expire_minutes} minutes. "
                    "If you did not request this, you can safely ignore this email.</p>"
                ),
            }
        )
        return True
    except Exception:
        logger.exception("Failed to send password reset email to %s", to_email)
        return False
