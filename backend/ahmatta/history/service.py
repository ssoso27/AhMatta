from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ahmatta.tasks.models import Task, TaskStatus, WorkSession


class HistorySegment(BaseModel):
    session_id: int
    started_at: datetime
    ended_at: datetime
    local_start: datetime
    local_end: datetime
    start_minute: float
    end_minute: float


class HistoryRow(BaseModel):
    task_id: int
    title: str
    status: TaskStatus
    color_key: str | None
    total_seconds: int
    segments: list[HistorySegment]


class DailyHistoryResponse(BaseModel):
    date: date
    timezone: str
    day_start: datetime
    day_seconds: int
    total_seconds: int
    rows: list[HistoryRow]


class HistoryService:
    def __init__(self, session: Session, clock: Callable[[], datetime]) -> None:
        self.session = session
        self.clock = clock

    def for_day(self, day: date, timezone: ZoneInfo) -> DailyHistoryResponse:
        start = datetime.combine(day, time.min, timezone).astimezone(UTC)
        end = datetime.combine(day + timedelta(days=1), time.min, timezone).astimezone(
            UTC
        )
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        now = now.astimezone(UTC)
        sessions = self.session.execute(
            select(WorkSession, Task)
            .join(Task)
            .where(
                WorkSession.started_at < end,
                or_(WorkSession.ended_at > start, WorkSession.ended_at.is_(None)),
            )
            .order_by(WorkSession.started_at, WorkSession.id)
        )
        rows: dict[int, HistoryRow] = {}
        for work, task in sessions:
            clipped_start = max(start, work.started_at)
            clipped_end = min(end, work.ended_at if work.ended_at is not None else now)
            if clipped_end <= clipped_start:
                continue
            row = rows.setdefault(
                task.id,
                HistoryRow(
                    task_id=task.id,
                    title=task.title,
                    status=task.status,
                    color_key=task.color_key,
                    total_seconds=0,
                    segments=[],
                ),
            )
            row.total_seconds += int((clipped_end - clipped_start).total_seconds())
            row.segments.append(
                HistorySegment(
                    session_id=work.id,
                    started_at=clipped_start,
                    ended_at=clipped_end,
                    local_start=clipped_start.astimezone(timezone).replace(tzinfo=None),
                    local_end=clipped_end.astimezone(timezone).replace(tzinfo=None),
                    start_minute=(clipped_start - start).total_seconds() / 60,
                    end_minute=(clipped_end - start).total_seconds() / 60,
                )
            )
        return DailyHistoryResponse(
            date=day,
            timezone=timezone.key,
            day_start=start,
            day_seconds=int((end - start).total_seconds()),
            total_seconds=sum(row.total_seconds for row in rows.values()),
            rows=list(rows.values()),
        )
