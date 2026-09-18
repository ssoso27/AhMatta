from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, literal_column
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ahmatta.db import Base, UTCDateTime


def utc_now() -> datetime:
    return datetime.now(UTC)


class TaskStatus(str, Enum):
    TODO = "todo"
    ACTIVE = "active"
    INTERRUPTED = "interrupted"
    WAITING = "waiting"
    DONE = "done"
    CANCELLED = "cancelled"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    status: Mapped[TaskStatus] = mapped_column(
        SqlEnum(
            TaskStatus,
            native_enum=False,
            values_callable=lambda members: [member.value for member in members],
        ),
        default=TaskStatus.TODO,
        index=True,
    )
    requester: Mapped[str | None] = mapped_column(String(255))
    source_url: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str] = mapped_column(Text, default="")
    color_key: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
        onupdate=utc_now,
    )
    interrupted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    sessions: Mapped[list[WorkSession]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )

    __mapper_args__: Mapping[str, Any] = {"version_id_col": version}


class WorkSession(Base):
    __tablename__ = "work_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime())
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), index=True)
    source_device: Mapped[str] = mapped_column(String(100), default="web")
    is_edited: Mapped[bool] = mapped_column(Boolean, default=False)

    task: Mapped[Task] = relationship(back_populates="sessions")

    __table_args__ = (
        Index(
            "uq_work_sessions_single_open",
            literal_column("1"),
            unique=True,
            sqlite_where=ended_at.is_(None),
        ),
    )


class ProcessedCommand(Base):
    __tablename__ = "processed_commands"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    command_name: Mapped[str] = mapped_column(String(100))
    command_fingerprint: Mapped[str] = mapped_column(Text)
    result_reference: Mapped[str] = mapped_column(Text)
    processed_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
