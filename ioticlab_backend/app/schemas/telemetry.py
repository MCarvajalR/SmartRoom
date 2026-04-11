from datetime import datetime

from pydantic import BaseModel


class TelemetryResponse(BaseModel):
    id: int
    device_id: int
    entity_id: str
    device_name: str
    value: float | None
    raw_state: str
    recorded_at: datetime

    model_config = {"from_attributes": True}


class TelemetryLatest(BaseModel):
    device_id: int
    entity_id: str
    device_name: str
    device_type: str
    unit: str | None
    value: float | None
    raw_state: str
    recorded_at: datetime | None
