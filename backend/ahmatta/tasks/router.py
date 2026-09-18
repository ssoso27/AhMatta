from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from typing import Annotated, Self

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, sessionmaker

from ahmatta.tasks.models import Task, TaskStatus
from ahmatta.tasks.schemas import FocusSnapshot, TaskSnapshot
from ahmatta.tasks.service import (
    RequestIdConflictError,
    TaskNotFoundError,
    TaskService,
)

Clock = Callable[[], datetime]


class CreateTaskRequest(BaseModel):
    title: str = Field(max_length=500)
    requester: str | None = Field(default=None, max_length=255)
    source_url: str | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, title: str) -> str:
        normalized = title.strip()
        if not normalized:
            raise ValueError("title must not be blank")
        return normalized


class CommandRequest(BaseModel):
    request_id: str = Field(min_length=1, max_length=255)


class TaskResponse(BaseModel):
    id: int
    title: str
    status: TaskStatus
    requester: str | None
    source_url: str | None
    note: str
    color_key: str | None
    created_at: datetime
    updated_at: datetime
    version: int

    @classmethod
    def from_task(cls, task: Task) -> Self:
        return cls(
            id=task.id,
            title=task.title,
            status=task.status,
            requester=task.requester,
            source_url=task.source_url,
            note=task.note,
            color_key=task.color_key,
            created_at=task.created_at,
            updated_at=task.updated_at,
            version=task.version,
        )

    @classmethod
    def from_snapshot(cls, task: TaskSnapshot) -> Self:
        return cls(
            id=task.id,
            title=task.title,
            status=task.status,
            requester=task.requester,
            source_url=task.source_url,
            note=task.note,
            color_key=task.color_key,
            created_at=task.created_at,
            updated_at=task.updated_at,
            version=task.version,
        )


class ActiveTaskResponse(TaskResponse):
    elapsed_seconds: int


class FocusSnapshotResponse(BaseModel):
    active_task: ActiveTaskResponse | None
    interrupted: list[TaskResponse]
    todo: list[TaskResponse]


def create_task_router(
    session_factory: sessionmaker[Session],
    clock: Clock,
) -> APIRouter:
    router = APIRouter(prefix="/api")

    def get_task_service() -> Iterator[TaskService]:
        with session_factory() as session:
            yield TaskService(session)

    TaskServiceDependency = Annotated[TaskService, Depends(get_task_service)]

    @router.get("/focus", response_model=FocusSnapshotResponse)
    def get_focus(service: TaskServiceDependency) -> FocusSnapshotResponse:
        now = clock()
        return _focus_response(service.list_focus(), service, now)

    @router.post(
        "/tasks",
        response_model=TaskResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_task(
        request: CreateTaskRequest,
        service: TaskServiceDependency,
    ) -> TaskResponse:
        task = service.create_task(
            request.title,
            requester=request.requester,
            source_url=request.source_url,
        )
        return TaskResponse.from_task(task)

    @router.post("/tasks/{task_id}/start", response_model=FocusSnapshotResponse)
    def start_task(
        task_id: int,
        request: CommandRequest,
        service: TaskServiceDependency,
    ) -> FocusSnapshotResponse:
        now = clock()
        try:
            result = service.start_task(task_id, now, request.request_id)
        except TaskNotFoundError as error:
            raise _not_found() from error
        except RequestIdConflictError as error:
            raise _request_id_conflict() from error
        return _focus_response(result, service, now)

    @router.post("/focus/pause", response_model=FocusSnapshotResponse)
    def pause_focus(
        request: CommandRequest,
        service: TaskServiceDependency,
    ) -> FocusSnapshotResponse:
        now = clock()
        try:
            result = service.pause_active(now, request.request_id)
        except RequestIdConflictError as error:
            raise _request_id_conflict() from error
        return _focus_response(result, service, now)

    @router.post(
        "/tasks/{task_id}/complete",
        response_model=FocusSnapshotResponse,
    )
    def complete_task(
        task_id: int,
        request: CommandRequest,
        service: TaskServiceDependency,
    ) -> FocusSnapshotResponse:
        now = clock()
        try:
            result = service.complete_task(task_id, now, request.request_id)
        except TaskNotFoundError as error:
            raise _not_found() from error
        except RequestIdConflictError as error:
            raise _request_id_conflict() from error
        return _focus_response(result, service, now)

    return router


def _focus_response(
    snapshot: FocusSnapshot,
    service: TaskService,
    now: datetime,
) -> FocusSnapshotResponse:
    active_response = None
    if snapshot.active_task is not None:
        elapsed_seconds = 0
        sessions = service.sessions_for(snapshot.active_task.id)
        open_session = next(
            (work_session for work_session in reversed(sessions) if work_session.ended_at is None),
            None,
        )
        if open_session is not None:
            utc_now = _to_utc(now)
            elapsed_seconds = max(
                0,
                int((utc_now - open_session.started_at).total_seconds()),
            )
        active_response = ActiveTaskResponse(
            **TaskResponse.from_snapshot(snapshot.active_task).model_dump(),
            elapsed_seconds=elapsed_seconds,
        )

    return FocusSnapshotResponse(
        active_task=active_response,
        interrupted=[TaskResponse.from_snapshot(task) for task in snapshot.interrupted],
        todo=[TaskResponse.from_snapshot(task) for task in snapshot.todo],
    )


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")
    return value.astimezone(UTC)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="작업을 찾을 수 없습니다.",
    )


def _request_id_conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="request_id가 다른 명령에 이미 사용되었습니다.",
    )
