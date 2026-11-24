import { createRemoteJWKSet, jwtVerify } from 'jose';
import { isUuid } from '../notifications/cursor.js';

/**
 * Xác thực access token Keycloak cho kết nối WebSocket. Trình duyệt không gửi được header
 * Authorization khi mở WebSocket, nên service tự verify token thay vì dựa vào X-User-Id của gateway.
 * Trả về userId (claim sub).
 */
export function createTokenVerifier({ issuer, jwksUri, jwks = createRemoteJWKSet(new URL(jwksUri)) }) {
  return async function verify(token) {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (!isUuid(payload.sub)) throw new Error('Token không có sub hợp lệ');
    return payload.sub;
  };
}
