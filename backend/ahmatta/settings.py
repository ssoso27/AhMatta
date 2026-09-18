from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./data/ahmatta.db"
    timezone: str = "Asia/Seoul"


settings = Settings()
