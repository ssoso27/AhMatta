from collections.abc import Callable, Iterator
from datetime import UTC, datetime

import pytest
from ahmatta.db import Base
from ahmatta.tasks.service import TaskService
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def session_factory(
    tmp_path_factory: pytest.TempPathFactory,
) -> Iterator[sessionmaker[Session]]:
    database_path = tmp_path_factory.mktemp("task-domain") / "test.db"
    engine = create_engine(f"sqlite:///{database_path}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine)

    yield factory

    engine.dispose()


@pytest.fixture
def db_session(
    session_factory: sessionmaker[Session],
) -> Iterator[Session]:
    with session_factory() as session:
        yield session


@pytest.fixture
def task_service(db_session: Session) -> TaskService:
    return TaskService(db_session)


@pytest.fixture
def utc() -> Callable[[int, int], datetime]:
    def build(hour: int, minute: int) -> datetime:
        return datetime(2026, 9, 18, hour, minute, tzinfo=UTC)

    return build
