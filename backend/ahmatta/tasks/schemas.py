from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ahmatta.tasks.models import Task, TaskStatus


@dataclass(frozen=True, slots=True)
class TaskSnapshot:
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
    def from_task(cls, task: Task) -> TaskSnapshot:
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


@dataclass(frozen=True, slots=True)
class FocusSnapshot:
    active_task: TaskSnapshot | None
    interrupted: list[TaskSnapshot]
    todo: list[TaskSnapshot]


@dataclass(frozen=True, slots=True)
class FocusResult(FocusSnapshot):
    pass
