"""Logging helpers for request correlation and structured event output."""

from __future__ import annotations

import logging
from contextvars import ContextVar, Token
from typing import Any

from fastapi import Request
from pythonjsonlogger.jsonlogger import JsonFormatter

from app.rate_limiting import get_trusted_client_ip

_request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
_BASE_RECORD_KEYS = set(logging.makeLogRecord({}).__dict__.keys())


def get_request_id() -> str:
    return _request_id_var.get()


def set_request_id(request_id: str) -> Token[str]:
    return _request_id_var.set(request_id)


def reset_request_id(token: Token[str]) -> None:
    _request_id_var.reset(token)


def client_ip_from_request(request: Request | None) -> str:
    if request is None:
        return "unknown"
    return get_trusted_client_ip(request)


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = get_request_id()
        if not hasattr(record, "event"):
            record.event = None
        return True


class DevelopmentFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = []
        for key, value in sorted(record.__dict__.items()):
            if key in _BASE_RECORD_KEYS or key in {"message", "asctime"}:
                continue
            if value is None:
                continue
            extras.append(f"{key}={value}")
        if extras:
            return f"{base} {' '.join(extras)}"
        return base


def configure_logging(environment: str) -> None:
    handler = logging.StreamHandler()
    handler.addFilter(RequestContextFilter())

    if environment == "production":
        formatter = JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s %(event)s %(request_id)s"
        )
    else:
        formatter = DevelopmentFormatter(
            "%(asctime)s %(levelname)s [%(name)s] %(message)s"
        )

    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True


def log_event(logger: logging.Logger, level: int, event: str, **fields: Any) -> None:
    logger.log(level, event, extra={"event": event, **fields})
