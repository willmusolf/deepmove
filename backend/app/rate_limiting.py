"""rate_limiting.py — Centralised slowapi limiter instance.

Import `limiter` in routes and decorate endpoints with @limiter.limit("N/minute").
Routes must accept `request: Request` as their first parameter for slowapi to work.
"""
from ipaddress import ip_address

from fastapi import Request
from slowapi import Limiter

from app.config import settings


def get_trusted_client_ip(request: Request) -> str:
    """Extract the client IP using a trusted proxy depth from the right-hand side.

    Render appends the connecting client IP to any existing X-Forwarded-For header
    rather than stripping it. That means the leftmost value may be spoofed by the
    caller, while the rightmost value is the hop added by the trusted Render proxy.
    If we later place another trusted proxy in front of Render, increase
    TRUSTED_PROXY_DEPTH to select the Nth-from-right hop instead.
    """
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
        if len(hops) >= settings.trusted_proxy_depth:
            candidate = hops[-settings.trusted_proxy_depth]
            try:
                ip_address(candidate)
                return candidate
            except ValueError:
                pass

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


limiter = Limiter(key_func=get_trusted_client_ip)
