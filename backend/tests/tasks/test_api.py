from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from ahmatta.main import create_app
from sqlalchemy.orm import Session, sessionmaker


@dataclass
class MutableClock:
    current: datetime

    def __call__(self) -> datetime:
        return self.current


@pytest.fixture
def clock() -> MutableClock:
    return MutableClock(datetime(2026, 9, 18, 9, 0, tzinfo=UTC))


@pytest.fixture
async def client(
    session_factory: sessionmaker[Session],
    clock: MutableClock,
) -> AsyncIterator[httpx.AsyncClient]:
    application = create_app(session_factory=session_factory, clock=clock)
    transport = httpx.ASGITransport(app=application)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as api_client:
        yield api_client


@pytest.mark.anyio
async def test_creating_task_returns_a_pydantic_task_response(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post(
        "/api/tasks",
        json={
            "title": "  배포 확인  ",
            "requester": "민지",
            "source_url": "https://example.com/requests/42",
        },
    )

    assert response.status_code == 201
    assert response.json() == {
        "id": 1,
        "title": "배포 확인",
        "status": "todo",
        "requester": "민지",
        "source_url": "https://example.com/requests/42",
        "note": "",
        "color_key": None,
        "created_at": response.json()["created_at"],
        "updated_at": response.json()["updated_at"],
        "version": 1,
    }
    assert datetime.fromisoformat(response.json()["created_at"]).tzinfo is not None
    assert datetime.fromisoformat(response.json()["updated_at"]).tzinfo is not None


@pytest.mark.anyio
@pytest.mark.parametrize("title", ["", "   ", "\n\t"])
async def test_creating_task_rejects_a_blank_title(
    client: httpx.AsyncClient,
    title: str,
) -> None:
    response = await client.post("/api/tasks", json={"title": title})

    assert response.status_code == 422
    focus = await client.get("/api/focus")
    assert focus.json()["todo"] == []


@pytest.mark.anyio
async def test_focus_lists_todo_tasks_in_creation_order(
    client: httpx.AsyncClient,
) -> None:
    await client.post("/api/tasks", json={"title": "먼저 등록"})
    await client.post("/api/tasks", json={"title": "나중 등록"})

    response = await client.get("/api/focus")

    assert response.status_code == 200
    assert response.json()["active_task"] is None
    assert response.json()["interrupted"] == []
    assert [item["title"] for item in response.json()["todo"]] == [
        "먼저 등록",
        "나중 등록",
    ]


@pytest.mark.anyio
async def test_starting_second_task_returns_first_as_interrupted(
    client: httpx.AsyncClient,
    clock: MutableClock,
) -> None:
    first = (await client.post("/api/tasks", json={"title": "A 작업"})).json()
    second = (await client.post("/api/tasks", json={"title": "B 요청"})).json()
    await client.post(
        f"/api/tasks/{first['id']}/start",
        json={"request_id": "one"},
    )
    clock.current = datetime(2026, 9, 18, 9, 5, tzinfo=UTC)

    response = await client.post(
        f"/api/tasks/{second['id']}/start",
        json={"request_id": "two"},
    )

    assert response.status_code == 200
    assert response.json()["active_task"]["title"] == "B 요청"
    assert response.json()["active_task"]["elapsed_seconds"] == 0
    assert [item["title"] for item in response.json()["interrupted"]] == [
        "A 작업"
    ]


@pytest.mark.anyio
async def test_focus_elapsed_seconds_uses_the_current_open_session(
    client: httpx.AsyncClient,
    clock: MutableClock,
) -> None:
    task = (await client.post("/api/tasks", json={"title": "집중 작업"})).json()
    await client.post(
        f"/api/tasks/{task['id']}/start",
        json={"request_id": "start-focus"},
    )
    clock.current = datetime(2026, 9, 18, 9, 2, 3, tzinfo=UTC)

    response = await client.get("/api/focus")

    assert response.json()["active_task"]["elapsed_seconds"] == 123


@pytest.mark.anyio
async def test_focus_elapsed_seconds_never_becomes_negative(
    client: httpx.AsyncClient,
    clock: MutableClock,
) -> None:
    task = (await client.post("/api/tasks", json={"title": "시계 보정"})).json()
    await client.post(
        f"/api/tasks/{task['id']}/start",
        json={"request_id": "start-before-correction"},
    )
    clock.current = datetime(2026, 9, 18, 8, 59, tzinfo=UTC)

    response = await client.get("/api/focus")

    assert response.json()["active_task"]["elapsed_seconds"] == 0


@pytest.mark.anyio
async def test_pausing_focus_moves_active_task_to_interrupted(
    client: httpx.AsyncClient,
) -> None:
    task = (await client.post("/api/tasks", json={"title": "잠시 멈춤"})).json()
    await client.post(
        f"/api/tasks/{task['id']}/start",
        json={"request_id": "start-pause"},
    )

    response = await client.post(
        "/api/focus/pause",
        json={"request_id": "pause-current"},
    )

    assert response.status_code == 200
    assert response.json()["active_task"] is None
    assert [item["title"] for item in response.json()["interrupted"]] == [
        "잠시 멈춤"
    ]


@pytest.mark.anyio
async def test_completing_active_task_removes_it_from_focus(
    client: httpx.AsyncClient,
) -> None:
    task = (await client.post("/api/tasks", json={"title": "완료할 작업"})).json()
    await client.post(
        f"/api/tasks/{task['id']}/start",
        json={"request_id": "start-complete"},
    )

    response = await client.post(
        f"/api/tasks/{task['id']}/complete",
        json={"request_id": "complete-current"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "active_task": None,
        "interrupted": [],
        "todo": [],
    }


@pytest.mark.anyio
@pytest.mark.parametrize(
    "path",
    ["/api/tasks/999/start", "/api/tasks/999/complete"],
)
async def test_unknown_task_returns_the_exact_not_found_error(
    client: httpx.AsyncClient,
    path: str,
) -> None:
    response = await client.post(path, json={"request_id": f"unknown:{path}"})

    assert response.status_code == 404
    assert response.json() == {"detail": "작업을 찾을 수 없습니다."}


@pytest.mark.anyio
async def test_retrying_a_command_id_returns_the_original_response(
    client: httpx.AsyncClient,
) -> None:
    task = (await client.post("/api/tasks", json={"title": "중복 방지"})).json()
    first = await client.post(
        f"/api/tasks/{task['id']}/start",
        json={"request_id": "same-command"},
    )

    retry = await client.post(
        f"/api/tasks/{task['id']}/start",
        json={"request_id": "same-command"},
    )

    assert retry.status_code == 200
    assert retry.json() == first.json()


@pytest.mark.anyio
async def test_reusing_command_id_for_another_task_returns_conflict(
    client: httpx.AsyncClient,
) -> None:
    first = (await client.post("/api/tasks", json={"title": "첫 작업"})).json()
    second = (await client.post("/api/tasks", json={"title": "다른 작업"})).json()
    await client.post(
        f"/api/tasks/{first['id']}/start",
        json={"request_id": "reused-command"},
    )

    response = await client.post(
        f"/api/tasks/{second['id']}/start",
        json={"request_id": "reused-command"},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "request_id가 다른 명령에 이미 사용되었습니다."
    }
    focus = (await client.get("/api/focus")).json()
    assert focus["active_task"]["id"] == first["id"]
    assert [item["id"] for item in focus["todo"]] == [second["id"]]


@pytest.mark.anyio
async def test_application_lifespan_creates_the_database_schema(
    tmp_path: Path,
    clock: MutableClock,
) -> None:
    database_url = f"sqlite:///{tmp_path / 'startup' / 'ahmatta.db'}"
    application = create_app(database_url=database_url, clock=clock)
    transport = httpx.ASGITransport(app=application)

    async with application.router.lifespan_context(
        application
    ), httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as api_client:
        response = await api_client.post(
            "/api/tasks",
            json={"title": "시작 시 생성"},
        )

    assert response.status_code == 201
