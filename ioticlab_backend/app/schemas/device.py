from datetime import datetime

from pydantic import BaseModel


class DeviceCreate(BaseModel):
    entity_id: str
    name: str
    device_type: str = "other"
    unit: str | None = None
    visibility: str = "public"


class DeviceUpdate(BaseModel):
    name: str | None = None
    device_type: str | None = None
    unit: str | None = None
    is_active: bool | None = None
    visibility: str | None = None


class DeviceResponse(BaseModel):
    id: int
    entity_id: str
    name: str
    device_type: str
    unit: str | None
    is_active: bool
    visibility: str
    created_at: datetime

    model_config = {"from_attributes": True}
