"""rate_limiting.py — Centralised slowapi limiter instance.

Import `limiter` in routes and decorate endpoints with @limiter.limit("N/minute").
Routes must accept `request: Request` as their first parameter for slowapi to work.
"""
from ipaddress import ip_address

from fastapi import Request
from slowapi import Limiter


def _get_real_client_ip(request: Request) -> str:
    """Best-effort client IP extraction for hosted reverse-proxy deployments.

    Railway and similar platforms terminate TLS and forward requests through a proxy.
    We prefer the first X-Forwarded-For hop when present, but still fall back to the
    client host that Starlette/Uvicorn exposes locally.

    This assumes the app is only reachable through a trusted proxy in production.
    """
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        candidate = forwarded_for.split(",", 1)[0].strip()
        try:
            ip_address(candidate)
            return candidate
        except ValueError:
            pass

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


limiter = Limiter(key_func=_get_real_client_ip)
