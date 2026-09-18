from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from ahmatta.db import Base
from ahmatta.settings import settings
from ahmatta.tasks.router import Clock, create_task_router


def utc_now() -> datetime:
    return datetime.now(UTC)


def create_app(
    *,
    session_factory: sessionmaker[Session] | None = None,
    clock: Clock = utc_now,
    database_url: str | None = None,
) -> FastAPI:
    engine: Engine | None = None
    if session_factory is None:
        resolved_database_url = database_url or settings.database_url
        engine = create_engine(resolved_database_url)
        session_factory = sessionmaker(engine)

    @asynccontextmanager
    async def lifespan(_application: FastAPI) -> AsyncIterator[None]:
        if engine is not None:
            _create_schema(engine)
        try:
            yield
        finally:
            if engine is not None:
                engine.dispose()

    application = FastAPI(lifespan=lifespan)
    application.include_router(create_task_router(session_factory, clock))

    @application.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


def _create_schema(engine: Engine) -> None:
    database_url = make_url(str(engine.url))
    if database_url.get_backend_name() == "sqlite":
        database_path = database_url.database
        if database_path and database_path != ":memory:":
            Path(database_path).expanduser().parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)


app = create_app()
