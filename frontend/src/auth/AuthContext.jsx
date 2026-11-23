import { useEffect, useMemo, useState } from "react";
import keycloak, { getRoles, getValidToken, initKeycloak } from "./keycloak";
import { AuthContext } from "./context";

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    initKeycloak()
      .then((loggedIn) => {
        if (mounted) {
          setAuthenticated(loggedIn);
          setReady(true);
        }
      })
      .catch(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(() => ({
    ready,
    authenticated,
    roles: getRoles(),
    getToken: getValidToken,
    login: (options) => keycloak.login(options),
    logout: () => keycloak.logout({ redirectUri: window.location.origin }),
  }), [ready, authenticated]);

  if (!ready) {
    return <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Đang kết nối Keycloak...</div>;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

