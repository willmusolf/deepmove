"""payments.py — Stripe subscription checkout, webhook, and billing portal."""
import logging

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session
from stripe._error import SignatureVerificationError

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.logging_utils import log_event
from app.models.user import User
from app.rate_limiting import limiter

router = APIRouter()
logger = logging.getLogger(__name__)


def _stripe_client() -> stripe.StripeClient:
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments not configured",
        )
    return stripe.StripeClient(settings.stripe_secret_key)


def _ensure_customer(client: stripe.StripeClient, user: User, db: Session) -> str:
    """Return existing Stripe customer ID, or create one and persist it."""
    if user.stripe_customer_id:
        return user.stripe_customer_id
    customer = client.customers.create(params={"email": user.email, "metadata": {"user_id": str(user.id)}})
    user.stripe_customer_id = customer.id
    db.commit()
    return customer.id


@router.post("/checkout")
@limiter.limit("5/minute")
def create_checkout_session(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a Stripe Checkout session and return the hosted URL."""
    if not settings.stripe_price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments not configured",
        )
    client = _stripe_client()
    customer_id = _ensure_customer(client, user, db)
    session = client.checkout.sessions.create(
        params={
            "customer": customer_id,
            "mode": "subscription",
            "line_items": [{"price": settings.stripe_price_id, "quantity": 1}],
            "success_url": f"{settings.frontend_url}/?payment=success",
            "cancel_url": f"{settings.frontend_url}/settings",
        }
    )
    log_event(logger, logging.INFO, "payments.checkout_created", user_id=user.id)
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    """Handle Stripe webhook events (no auth — verified by signature)."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook not configured")

    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature or "", settings.stripe_webhook_secret
        )
    except SignatureVerificationError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

    event_type = event["type"]
    data_obj = event["data"]["object"]

    if event_type == "checkout.session.completed":
        customer_id = data_obj.get("customer")
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if user:
            user.is_premium = True
            user.subscription_status = "active"
            db.commit()
            log_event(logger, logging.INFO, "payments.subscription_activated", user_id=user.id)

    elif event_type == "customer.subscription.deleted":
        customer_id = data_obj.get("customer")
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if user:
            user.is_premium = False
            user.subscription_status = "canceled"
            db.commit()
            log_event(logger, logging.INFO, "payments.subscription_canceled", user_id=user.id)

    elif event_type == "invoice.payment_failed":
        customer_id = data_obj.get("customer")
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if user:
            user.subscription_status = "past_due"
            db.commit()
            log_event(logger, logging.WARNING, "payments.payment_failed", user_id=user.id)

    return {"received": True}


@router.post("/portal")
@limiter.limit("5/minute")
def create_portal_session(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a Stripe Billing Portal session and return the URL."""
    if not user.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active subscription found",
        )
    client = _stripe_client()
    portal = client.billing_portal.sessions.create(
        params={
            "customer": user.stripe_customer_id,
            "return_url": f"{settings.frontend_url}/settings",
        }
    )
    log_event(logger, logging.INFO, "payments.portal_created", user_id=user.id)
    return {"url": portal.url}
