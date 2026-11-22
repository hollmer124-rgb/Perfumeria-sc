import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env", override=False)


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True)

    supabase_url: str = ""
    supabase_key: str = ""
    frontend_origins_raw: str = (
        "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000"
    )

    @property
    def frontend_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.frontend_origins_raw.split(",")]
        return list(dict.fromkeys(origin for origin in origins if origin))


settings = Settings(
    supabase_url=os.getenv("SUPABASE_URL", "").strip(),
    supabase_key=os.getenv("SUPABASE_KEY", "").strip(),
    frontend_origins_raw=os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000",
    ),
)
