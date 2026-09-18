from collections.abc import Callable, Iterator
from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, sessionmaker

from ahmatta.history.service import DailyHistoryResponse, HistoryService


def create_history_router(
    session_factory: sessionmaker[Session],
    clock: Callable[[], datetime],
) -> APIRouter:
    router = APIRouter(prefix="/api")

    def get_service() -> Iterator[HistoryService]:
        with session_factory() as session:
            yield HistoryService(session, clock)

    Service = Annotated[HistoryService, Depends(get_service)]

    @router.get("/history", response_model=DailyHistoryResponse)
    def get_history(
        date: date, service: Service, timezone: str = "Asia/Seoul"
    ) -> DailyHistoryResponse:
        try:
            zone = ZoneInfo(timezone)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise HTTPException(
                status_code=422, detail="올바른 시간대를 입력해 주세요."
            ) from error
        return service.for_day(date, zone)

    return router
