from datetime import datetime

from pydantic import BaseModel


class DoorStateResponse(BaseModel):
    entity_id: str
    state: str
    friendly_name: str | None


class AccessLogResponse(BaseModel):
    id: int
    entity_id: str
    action: str
    triggered_by: str
    triggered_at: datetime

    model_config = {"from_attributes": True}
