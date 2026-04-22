"""Unit coverage for trusted proxy IP extraction."""

from starlette.requests import Request

from app.config import settings
from app.rate_limiting import get_trusted_client_ip


def make_request(*, forwarded_for: str | None = None, client_host: str = "10.0.0.5") -> Request:
    headers = []
    if forwarded_for is not None:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))

    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/health",
            "headers": headers,
            "client": (client_host, 1234),
        }
    )


def test_rightmost_hop_is_used_by_default(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_depth", 1)
    request = make_request(forwarded_for="6.6.6.6, 203.0.113.9")
    assert get_trusted_client_ip(request) == "203.0.113.9"


def test_proxy_depth_allows_second_from_right(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_depth", 2)
    request = make_request(forwarded_for="6.6.6.6, 203.0.113.9, 198.51.100.7")
    assert get_trusted_client_ip(request) == "203.0.113.9"


def test_invalid_forwarded_hop_falls_back_to_request_client(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_depth", 1)
    request = make_request(forwarded_for="spoofed, not-an-ip", client_host="192.0.2.10")
    assert get_trusted_client_ip(request) == "192.0.2.10"


def test_missing_forwarded_header_uses_request_client(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_depth", 1)
    request = make_request(forwarded_for=None, client_host="192.0.2.11")
    assert get_trusted_client_ip(request) == "192.0.2.11"
