import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ahmatta.tasks.models import (
    ProcessedCommand,
    Task,
    TaskStatus,
    WorkSession,
)
from ahmatta.tasks.schemas import FocusResult, FocusSnapshot, TaskSnapshot


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int) -> None:
        super().__init__(task_id)
        self.task_id = task_id


class FocusInvariantError(RuntimeError):
    pass


class RequestIdConflictError(ValueError):
    def __init__(self, request_id: str) -> None:
        super().__init__(f"request_id already used for another command: {request_id}")
        self.request_id = request_id


class TaskService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create_task(
        self,
        title: str,
        requester: str | None = None,
        source_url: str | None = None,
    ) -> Task:
        normalized_title = title.strip()
        if not normalized_title:
            raise ValueError("title must not be blank")

        task = Task(
            title=normalized_title,
            status=TaskStatus.TODO,
            requester=requester,
            source_url=source_url,
        )
        self._session.add(task)
        self._session.commit()
        self._session.refresh(task)
        return task

    def start_task(
        self,
        task_id: int,
        now: datetime,
        request_id: str,
    ) -> FocusResult:
        utc_now = self._to_utc(now)

        def transition() -> None:
            target = self._get_task(task_id)
            active = self._active_task()
            if active is not None and active.id == target.id:
                return

            if active is not None:
                self._close_open_sessions(active.id, utc_now)
                active.status = TaskStatus.INTERRUPTED
                active.interrupted_at = utc_now
                active.updated_at = utc_now

            target.status = TaskStatus.ACTIVE
            target.updated_at = utc_now
            self._session.add(
                WorkSession(
                    task_id=target.id,
                    started_at=utc_now,
                    source_device="web",
                    is_edited=False,
                )
            )

        return self._run_command(
            request_id,
            "start_task",
            self._command_fingerprint("start_task", task_id=task_id),
            transition,
        )

    def pause_active(self, now: datetime, request_id: str) -> FocusResult:
        utc_now = self._to_utc(now)

        def transition() -> None:
            active = self._active_task()
            if active is None:
                return
            self._close_open_sessions(active.id, utc_now)
            active.status = TaskStatus.INTERRUPTED
            active.interrupted_at = utc_now
            active.updated_at = utc_now

        return self._run_command(
            request_id,
            "pause_active",
            self._command_fingerprint("pause_active"),
            transition,
        )

    def complete_task(
        self,
        task_id: int,
        now: datetime,
        request_id: str,
    ) -> FocusResult:
        utc_now = self._to_utc(now)

        def transition() -> None:
            task = self._get_task(task_id)
            if task.status is TaskStatus.ACTIVE:
                self._close_open_sessions(task.id, utc_now)
            task.status = TaskStatus.DONE
            task.updated_at = utc_now

        return self._run_command(
            request_id,
            "complete_task",
            self._command_fingerprint("complete_task", task_id=task_id),
            transition,
        )

    def list_focus(self) -> FocusSnapshot:
        active = self._active_task()
        interrupted = self._session.scalars(
            select(Task)
            .where(Task.status == TaskStatus.INTERRUPTED)
            .order_by(Task.interrupted_at.desc(), Task.id.desc())
        ).all()
        todo = self._session.scalars(
            select(Task)
            .where(Task.status == TaskStatus.TODO)
            .order_by(Task.created_at, Task.id)
        ).all()
        return FocusSnapshot(
            active_task=self._snapshot(active) if active is not None else None,
            interrupted=[self._snapshot(task) for task in interrupted],
            todo=[self._snapshot(task) for task in todo],
        )

    def sessions_for(self, task_id: int) -> list[WorkSession]:
        return list(
            self._session.scalars(
                select(WorkSession)
                .where(WorkSession.task_id == task_id)
                .order_by(WorkSession.started_at, WorkSession.id)
            ).all()
        )

    def open_sessions_count(self) -> int:
        statement = select(func.count()).select_from(WorkSession).where(
            WorkSession.ended_at.is_(None)
        )
        return self._session.scalar(statement) or 0

    def _run_command(
        self,
        request_id: str,
        command_name: str,
        command_fingerprint: str,
        transition: Callable[[], None],
    ) -> FocusResult:
        processed = self._session.scalar(
            select(ProcessedCommand).where(
                ProcessedCommand.request_id == request_id
            )
        )
        if processed is not None:
            return self._processed_result(processed, command_fingerprint)

        try:
            transition()
            self._session.flush()
            result = self._focus_result()
            self._session.add(
                ProcessedCommand(
                    request_id=request_id,
                    command_name=command_name,
                    command_fingerprint=command_fingerprint,
                    result_reference=self._result_reference(result),
                )
            )
            self._session.commit()
        except IntegrityError:
            self._session.rollback()
            winner = self._session.scalar(
                select(ProcessedCommand).where(
                    ProcessedCommand.request_id == request_id
                )
            )
            if winner is None:
                raise
            return self._processed_result(winner, command_fingerprint)
        except Exception:
            self._session.rollback()
            raise
        return result

    def _processed_result(
        self,
        processed: ProcessedCommand,
        command_fingerprint: str,
    ) -> FocusResult:
        if processed.command_fingerprint != command_fingerprint:
            raise RequestIdConflictError(processed.request_id)
        return self._restore_result(processed.result_reference)

    @staticmethod
    def _command_fingerprint(
        command_name: str,
        *,
        task_id: int | None = None,
    ) -> str:
        payload: dict[str, str | int] = {"command": command_name}
        if task_id is not None:
            payload["task_id"] = task_id
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)

    def _focus_result(self) -> FocusResult:
        snapshot = self.list_focus()
        return FocusResult(
            active_task=snapshot.active_task,
            interrupted=snapshot.interrupted,
            todo=snapshot.todo,
        )

    def _result_reference(self, result: FocusResult) -> str:
        payload = {
            "active_task": (
                self._serialize_task(result.active_task)
                if result.active_task is not None
                else None
            ),
            "interrupted": [
                self._serialize_task(task) for task in result.interrupted
            ],
            "todo": [self._serialize_task(task) for task in result.todo],
        }
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)

    def _restore_result(self, result_reference: str) -> FocusResult:
        payload: dict[str, Any] = json.loads(result_reference)
        active_task = payload["active_task"]
        return FocusResult(
            active_task=(
                self._restore_task(active_task)
                if active_task is not None
                else None
            ),
            interrupted=[
                self._restore_task(task) for task in payload["interrupted"]
            ],
            todo=[self._restore_task(task) for task in payload["todo"]],
        )

    @staticmethod
    def _serialize_task(task: TaskSnapshot) -> dict[str, Any]:
        return {
            "id": task.id,
            "title": task.title,
            "status": task.status.value,
            "requester": task.requester,
            "source_url": task.source_url,
            "note": task.note,
            "color_key": task.color_key,
            "created_at": task.created_at.isoformat(),
            "updated_at": task.updated_at.isoformat(),
            "version": task.version,
        }

    @staticmethod
    def _restore_task(payload: dict[str, Any]) -> TaskSnapshot:
        return TaskSnapshot(
            id=payload["id"],
            title=payload["title"],
            status=TaskStatus(payload["status"]),
            requester=payload["requester"],
            source_url=payload["source_url"],
            note=payload["note"],
            color_key=payload["color_key"],
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
            version=payload["version"],
        )

    def _active_task(self) -> Task | None:
        statement: Select[tuple[Task]] = (
            select(Task).where(Task.status == TaskStatus.ACTIVE).order_by(Task.id)
        )
        active_tasks = self._session.scalars(statement).all()
        if len(active_tasks) > 1:
            raise FocusInvariantError("multiple active tasks found")
        return active_tasks[0] if active_tasks else None

    def _get_task(self, task_id: int) -> Task:
        task = self._session.get(Task, task_id)
        if task is None:
            raise TaskNotFoundError(task_id)
        return task

    def _close_open_sessions(self, task_id: int, ended_at: datetime) -> None:
        sessions = self._session.scalars(
            select(WorkSession).where(
                WorkSession.task_id == task_id,
                WorkSession.ended_at.is_(None),
            )
        ).all()
        for work_session in sessions:
            work_session.ended_at = ended_at

    @staticmethod
    def _snapshot(task: Task) -> TaskSnapshot:
        return TaskSnapshot.from_task(task)

    @staticmethod
    def _to_utc(value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("now must include a timezone")
        return value.astimezone(UTC)
