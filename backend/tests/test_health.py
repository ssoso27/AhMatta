from ahmatta.main import app
from fastapi.testclient import TestClient


def test_health_returns_ok() -> None:
    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
