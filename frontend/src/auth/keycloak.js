import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8180",
  realm: import.meta.env.VITE_KEYCLOAK_REALM || "smarthr",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "smarthr-frontend",
});

let initPromise;

export function initKeycloak() {
  if (!initPromise) {
    initPromise = keycloak.init({
      onLoad: "check-sso",
      pkceMethod: "S256",
      checkLoginIframe: false,
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
    });
  }
  return initPromise;
}

export async function getValidToken() {
  if (!keycloak.authenticated) return null;
  await keycloak.updateToken(30);
  return keycloak.token;
}

export function getRoles() {
  return keycloak.tokenParsed?.realm_access?.roles || [];
}

export default keycloak;
