"""Phân quyền dựa trên header do api-gateway gắn sau khi xác thực JWT (Keycloak).

Gateway luôn xóa X-User-Id / X-User-Role do client tự gửi rồi gắn lại từ token:
- X-User-Id: `sub` của token, cũng chính là userId của CV bên user-cv (cvId = userId).
- X-User-Role: ADMIN / HR / USER (chuỗi rỗng nếu token không có vai trò nào trong ba vai trò này).

Không có X-User-Id nghĩa là lời gọi không đi qua gateway: service nội bộ trong mạng Docker
(application-service, user-cv) hoặc dev/test. Cho qua, trừ khi bật AI_REQUIRE_IDENTITY=true.
KHÔNG được mở cổng ai-matching ra Internet: mọi request từ ngoài phải đi qua gateway.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app.core.config import get_settings
from app.core.container import Container
from app.vectorstore import Kind

USER_ID_HEADER = "X-User-Id"
ROLE_HEADER = "X-User-Role"


class Role(StrEnum):
    ADMIN = "ADMIN"
    HR = "HR"
    USER = "USER"


@dataclass(frozen=True)
class Identity:
    user_id: str | None
    role: str | None

    @property
    def internal(self) -> bool:
        """Lời gọi nội bộ, không qua gateway (không có người dùng đăng nhập)."""
        return not self.user_id

    def require_roles(self, *roles: Role) -> None:
        if self.internal:
            return
        if self.role not in {r.value for r in roles}:
            allowed = ", ".join(r.value for r in roles)
            raise HTTPException(status_code=403, detail=f"Chỉ {allowed} được dùng chức năng này")


def get_identity(request: Request) -> Identity:
    user_id = (request.headers.get(USER_ID_HEADER) or "").strip() or None
    role = (request.headers.get(ROLE_HEADER) or "").strip().upper() or None
    if user_id is None and get_settings().require_identity:
        raise HTTPException(status_code=401, detail="Thiếu thông tin người dùng (X-User-Id)")
    return Identity(user_id=user_id, role=role)


IdentityDep = Annotated[Identity, Depends(get_identity)]


async def ensure_cv_access(identity: Identity, container: Container, cv_id: str) -> None:
    """USER chỉ được dùng CV của chính mình; ADMIN và lời gọi nội bộ thì được tất cả.

    CV của người khác luôn trả 403 (kể cả khi không tồn tại) để không lộ CV nào có thật.
    """
    if identity.internal or identity.role == Role.ADMIN:
        return
    payload = await container.store.get_payload(Kind.CV, cv_id)
    owner = payload.get("user_id") if payload is not None else cv_id
    if owner != identity.user_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền dùng CV này")
