from collections.abc import Callable, Iterator
from datetime import UTC, datetime

import pytest
from ahmatta.db import Base
from ahmatta.tasks.service import TaskService
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


@pytest.fixture
def task_service(tmp_path_factory: pytest.TempPathFactory) -> Iterator[TaskService]:
    database_path = tmp_path_factory.mktemp("task-domain") / "test.db"
    engine = create_engine(f"sqlite:///{database_path}")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        yield TaskService(session)

    engine.dispose()


@pytest.fixture
def utc() -> Callable[[int, int], datetime]:
    def build(hour: int, minute: int) -> datetime:
        return datetime(2026, 9, 18, hour, minute, tzinfo=UTC)

    return build
