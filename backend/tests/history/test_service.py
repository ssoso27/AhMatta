from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from ahmatta.history.service import HistoryService
from ahmatta.tasks.models import Task, TaskStatus, WorkSession
from sqlalchemy.orm import Session


def seed(session: Session, title: str, *intervals: tuple[str, str | None]) -> Task:
    task = Task(title=title, status=TaskStatus.INTERRUPTED)
    session.add(task)
    session.flush()
    for start, end in intervals:
        session.add(
            WorkSession(
                task_id=task.id,
                started_at=datetime.fromisoformat(start),
                ended_at=datetime.fromisoformat(end) if end else None,
            )
        )
    session.commit()
    return task


def test_midnight_split_and_repeated_sessions_are_one_row(db_session: Session) -> None:
    seed(
        db_session,
        "재개 작업",
        ("2026-09-17T14:50Z", "2026-09-17T15:20Z"),
        ("2026-09-18T01:00Z", "2026-09-18T01:10Z"),
    )
    seed(db_session, "먼저 한 작업", ("2026-09-17T15:00Z", "2026-09-17T15:05Z"))
    result = HistoryService(
        db_session, lambda: datetime(2026, 9, 19, tzinfo=UTC)
    ).for_day(date(2026, 9, 18), ZoneInfo("Asia/Seoul"))
    assert result.total_seconds == 2100
    assert [row.title for row in result.rows] == ["재개 작업", "먼저 한 작업"]
    row = result.rows[0]
    assert row.total_seconds == 1800
    assert len(row.segments) == 2
    assert row.segments[0].local_start.isoformat() == "2026-09-18T00:00:00"
    assert row.segments[0].local_end.isoformat() == "2026-09-18T00:20:00"
    assert row.segments[1].start_minute == 600
    assert row.segments[1].end_minute == 610


@pytest.mark.parametrize(
    ("now", "seconds"),
    [
        ("2026-09-17T15:07Z", 420),
        ("2026-09-19T00:00Z", 86400),
        ("2026-09-17T14:00Z", 0),
    ],
)
def test_open_session_clips_to_now_and_day_without_negative_time(
    db_session: Session,
    now: str,
    seconds: int,
) -> None:
    seed(db_session, "열린 작업", ("2026-09-17T14:50Z", None))
    result = HistoryService(db_session, lambda: datetime.fromisoformat(now)).for_day(
        date(2026, 9, 18), ZoneInfo("Asia/Seoul")
    )
    assert result.total_seconds == seconds
    assert len(result.rows) == (1 if seconds else 0)


def test_empty_day_excludes_zero_length_and_boundary_sessions(
    db_session: Session,
) -> None:
    seed(
        db_session,
        "날짜 밖",
        ("2026-09-17T14:00Z", "2026-09-17T15:00Z"),
        ("2026-09-18T15:00Z", "2026-09-18T16:00Z"),
        ("2026-09-18T01:00Z", "2026-09-18T01:00Z"),
    )
    result = HistoryService(
        db_session, lambda: datetime(2026, 9, 19, tzinfo=UTC)
    ).for_day(date(2026, 9, 18), ZoneInfo("Asia/Seoul"))
    assert result.rows == []
    assert result.total_seconds == 0


@pytest.mark.parametrize(
    ("day", "start", "end", "seconds"),
    [
        (date(2026, 3, 8), "2026-03-08T05:00Z", "2026-03-09T04:00Z", 82800),
        (date(2026, 11, 1), "2026-11-01T04:00Z", "2026-11-02T05:00Z", 90000),
    ],
)
def test_dst_days_use_actual_elapsed_time(
    db_session: Session,
    day: date,
    start: str,
    end: str,
    seconds: int,
) -> None:
    seed(db_session, "하루 작업", (start, end))
    result = HistoryService(
        db_session, lambda: datetime(2026, 12, 1, tzinfo=UTC)
    ).for_day(day, ZoneInfo("America/New_York"))
    assert result.total_seconds == seconds
    assert result.day_seconds == seconds
    assert result.rows[0].segments[0].end_minute == seconds / 60
    assert result.rows[0].segments[0].started_at == datetime.fromisoformat(start)
