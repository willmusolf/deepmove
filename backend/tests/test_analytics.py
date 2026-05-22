from fastapi.testclient import TestClient

from app.main import app
from app.rate_limiting import limiter


def test_launch_event_endpoint_accepts_anonymous_events():
    previous = limiter.enabled
    limiter.enabled = False
    try:
        with TestClient(app) as client:
            response = client.post("/analytics/events", json={
                "name": "open_app",
                "session_id": "session-test-1234",
                "page": "/",
                "properties": {"route": "/"},
            })
    finally:
        limiter.enabled = previous

    assert response.status_code == 202, response.text
    assert response.json() == {"accepted": True}
