import { useCallback, useEffect, useMemo, useState } from "react";
import keycloak, { getRoles, getValidToken, initKeycloak } from "./keycloak";
import { AuthContext } from "./context";

function readUser() {
  const token = keycloak.tokenParsed;
  if (!token) return null;
  return {
    id: token.sub,
    username: token.preferred_username,
    name: token.name || token.preferred_username,
    email: token.email,
  };
}

/**
 * Không chặn render: trang công khai hiển thị ngay, kể cả khi Keycloak chậm hoặc đang tắt.
 * `ready` = đã biết trạng thái đăng nhập (Keycloak khởi tạo xong hoặc lỗi).
 */
export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    initKeycloak()
      .then((loggedIn) => {
        if (!mounted) return;
        setAuthenticated(Boolean(loggedIn));
        setReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setUnavailable(true);
        setReady(true);
      });
    keycloak.onAuthLogout = () => mounted && setAuthenticated(false);
    keycloak.onTokenExpired = () => keycloak.updateToken(30).catch(() => mounted && setAuthenticated(false));
    return () => {
      mounted = false;
    };
  }, []);

  const getToken = useCallback(async () => {
    try {
      return await getValidToken();
    } catch {
      setAuthenticated(false);
      return null;
    }
  }, []);

  const value = useMemo(() => {
    const roles = authenticated ? getRoles() : [];
    return {
      ready,
      authenticated,
      unavailable,
      roles,
      user: authenticated ? readUser() : null,
      hasRole: (role) => roles.includes(role),
      getToken,
      login: (options) => keycloak.login({ redirectUri: window.location.href, ...options }),
      logout: () => keycloak.logout({ redirectUri: window.location.origin }),
    };
  }, [ready, authenticated, unavailable, getToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
