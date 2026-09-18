from datetime import UTC, datetime

import httpx
import pytest
from ahmatta.main import create_app
from sqlalchemy.orm import Session, sessionmaker


@pytest.mark.anyio
async def test_history_route_uses_requested_day_timezone_and_injected_clock(
    session_factory: sessionmaker[Session],
) -> None:
    now = datetime(2026, 9, 17, 14, 50, tzinfo=UTC)
    app = create_app(session_factory=session_factory, clock=lambda: now)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        task = (await client.post("/api/tasks", json={"title": "자정 작업"})).json()
        await client.post(
            f"/api/tasks/{task['id']}/start", json={"request_id": "start"}
        )
        now = datetime(2026, 9, 17, 15, 20, tzinfo=UTC)
        response = await client.get(
            "/api/history", params={"date": "2026-09-18", "timezone": "Asia/Seoul"}
        )
    assert response.status_code == 200
    result = response.json()
    assert result["date"] == "2026-09-18"
    assert result["timezone"] == "Asia/Seoul"
    assert result["total_seconds"] == 1200
    assert result["rows"][0]["status"] == "active"
    assert result["rows"][0]["task_id"] == task["id"]
    assert result["rows"][0]["segments"][0]["local_start"] == "2026-09-18T00:00:00"
    assert result["rows"][0]["segments"][0]["started_at"] == "2026-09-17T15:00:00Z"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "params",
    [
        {"date": "2026-09-18", "timezone": "Invalid/Timezone"},
        {"date": "2026-09-18", "timezone": "/etc/passwd"},
        {"date": "not-a-date", "timezone": "Asia/Seoul"},
    ],
)
async def test_invalid_history_query_is_rejected(
    session_factory: sessionmaker[Session],
    params: dict[str, str],
) -> None:
    app = create_app(session_factory=session_factory)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        response = await client.get("/api/history", params=params)
    assert response.status_code == 422
