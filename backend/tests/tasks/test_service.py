from collections.abc import Callable
from datetime import datetime

import pytest
from ahmatta.tasks.models import TaskStatus
from ahmatta.tasks.service import TaskService


def test_create_task_persists_optional_request_context(
    task_service: TaskService,
) -> None:
    task = task_service.create_task(
        "배포 확인",
        requester="민지",
        source_url="https://example.com/requests/42",
    )

    assert task.id is not None
    assert task.title == "배포 확인"
    assert task.status is TaskStatus.TODO
    assert task.requester == "민지"
    assert task.source_url == "https://example.com/requests/42"
    assert task.version == 1


@pytest.mark.parametrize("title", ["", "   ", "\n\t"])
def test_create_task_rejects_titles_without_visible_characters(
    task_service: TaskService,
    title: str,
) -> None:
    with pytest.raises(ValueError):
        task_service.create_task(title)

    assert task_service.list_focus().todo == []


def test_switching_tasks_closes_previous_session(
    task_service: TaskService,
    utc: Callable[[int, int], datetime],
) -> None:
    a = task_service.create_task("A 작업")
    b = task_service.create_task("B 요청")
    c = task_service.create_task("C 요청")

    task_service.start_task(a.id, utc(9, 0), "start-a")
    task_service.start_task(b.id, utc(9, 20), "start-b")
    result = task_service.start_task(c.id, utc(9, 35), "start-c")

    assert result.active_task is not None
    assert result.active_task.id == c.id
    assert [item.id for item in task_service.list_focus().interrupted] == [
        b.id,
        a.id,
    ]
    assert task_service.sessions_for(a.id)[0].ended_at == utc(9, 20)
    assert task_service.sessions_for(b.id)[0].ended_at == utc(9, 35)
    assert task_service.open_sessions_count() == 1


def test_focus_lists_todo_tasks_in_creation_order(
    task_service: TaskService,
) -> None:
    first = task_service.create_task("먼저 등록")
    second = task_service.create_task("나중 등록")

    snapshot = task_service.list_focus()

    assert snapshot.active_task is None
    assert snapshot.interrupted == []
    assert [item.id for item in snapshot.todo] == [first.id, second.id]


def test_completing_active_task_closes_its_session(
    task_service: TaskService,
    utc: Callable[[int, int], datetime],
) -> None:
    task = task_service.create_task("현재 작업")
    task_service.start_task(task.id, utc(10, 0), "start-current")

    result = task_service.complete_task(task.id, utc(10, 25), "complete-current")

    assert result.active_task is None
    assert task.status is TaskStatus.DONE
    assert task_service.sessions_for(task.id)[0].ended_at == utc(10, 25)
    assert task_service.open_sessions_count() == 0


def test_completing_interrupted_task_does_not_create_a_session(
    task_service: TaskService,
    utc: Callable[[int, int], datetime],
) -> None:
    interrupted = task_service.create_task("중단 작업")
    current = task_service.create_task("현재 작업")
    task_service.start_task(interrupted.id, utc(11, 0), "start-interrupted")
    task_service.start_task(current.id, utc(11, 10), "start-current")

    result = task_service.complete_task(
        interrupted.id,
        utc(11, 20),
        "complete-interrupted",
    )

    sessions = task_service.sessions_for(interrupted.id)
    assert len(sessions) == 1
    assert sessions[0].started_at == utc(11, 0)
    assert sessions[0].ended_at == utc(11, 10)
    assert result.active_task is not None
    assert result.active_task.id == current.id
    assert interrupted.status is TaskStatus.DONE


def test_pausing_active_task_closes_session_and_keeps_it_interrupted(
    task_service: TaskService,
    utc: Callable[[int, int], datetime],
) -> None:
    task = task_service.create_task("잠시 멈출 작업")
    task_service.start_task(task.id, utc(13, 0), "start-pause-target")

    result = task_service.pause_active(utc(13, 15), "pause-current")

    assert result.active_task is None
    assert [item.id for item in result.interrupted] == [task.id]
    assert task.status is TaskStatus.INTERRUPTED
    assert task_service.sessions_for(task.id)[0].ended_at == utc(13, 15)
    assert task_service.open_sessions_count() == 0


def test_pausing_without_active_task_is_idempotent(
    task_service: TaskService,
    utc: Callable[[int, int], datetime],
) -> None:
    first = task_service.pause_active(utc(14, 0), "pause-empty-one")
    second = task_service.pause_active(utc(14, 5), "pause-empty-two")

    assert first == second
    assert first.active_task is None
    assert first.interrupted == []
    assert first.todo == []
    assert task_service.open_sessions_count() == 0


def test_retrying_request_id_returns_original_result_without_second_session(
    task_service: TaskService,
    utc: Callable[[int, int], datetime],
) -> None:
    task = task_service.create_task("중복 방지")

    first = task_service.start_task(task.id, utc(15, 0), "same-request")
    retry = task_service.start_task(task.id, utc(15, 10), "same-request")

    assert retry == first
    assert retry.active_task is not None
    assert retry.active_task.id == task.id
    assert task_service.sessions_for(task.id)[0].started_at == utc(15, 0)
    assert task_service.open_sessions_count() == 1


def test_retry_after_later_switch_returns_persisted_original_result(
    task_service: TaskService,
    utc: Callable[[int, int], datetime],
) -> None:
    first_task = task_service.create_task("최초 작업")
    later_task = task_service.create_task("후속 작업")
    original = task_service.start_task(
        first_task.id,
        utc(16, 0),
        "original-request",
    )
    task_service.start_task(later_task.id, utc(16, 10), "later-request")

    retry = task_service.start_task(
        first_task.id,
        utc(16, 20),
        "original-request",
    )

    assert retry == original
    assert task_service.open_sessions_count() == 1
    assert len(task_service.sessions_for(first_task.id)) == 1
    assert len(task_service.sessions_for(later_task.id)) == 1
