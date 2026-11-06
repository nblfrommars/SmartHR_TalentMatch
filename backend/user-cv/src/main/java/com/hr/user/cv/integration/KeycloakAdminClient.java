package com.hr.user.cv.integration;

import java.net.URI;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class KeycloakAdminClient {

    private final RestClient.Builder restClientBuilder;

    @Value("${keycloak.admin.base-url:http://localhost:8180}")
    private String baseUrl;

    @Value("${keycloak.admin.realm:smarthr}")
    private String realm;

    @Value("${keycloak.admin.client-id:smarthr-admin-service}")
    private String clientId;

    @Value("${keycloak.admin.client-secret:smarthr-admin-secret}")
    private String clientSecret;

    public String createUser(String username, String email, String fullName, String password, String role) {
        String accessToken = getServiceToken();
        Map<String, Object> user = Map.of(
                "username", username,
                "email", email,
                "emailVerified", true,
                "enabled", true,
                "requiredActions", List.of(),
                "firstName", fullName == null ? "" : fullName,
                "credentials", List.of(Map.of(
                        "type", "password",
                        "value", password,
                        "temporary", false)));

        URI location = restClientBuilder.build()
                .post()
                .uri(baseUrl + "/admin/realms/{realm}/users", realm)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(user)
                .retrieve()
                .toBodilessEntity()
                .getHeaders()
                .getLocation();

        if (location == null) {
            throw new IllegalStateException("Keycloak did not return the created user location");
        }

        String userId = location.getPath().substring(location.getPath().lastIndexOf('/') + 1);
        assignRealmRole(accessToken, userId, role);
        return userId;
    }

    public void deleteUser(String userId) {
        String accessToken = getServiceToken();
        restClientBuilder.build()
                .delete()
                .uri(baseUrl + "/admin/realms/{realm}/users/{userId}", realm, userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .retrieve()
                .toBodilessEntity();
    }

    private String getServiceToken() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);

        Map<String, Object> response = restClientBuilder.build()
                .post()
                .uri(baseUrl + "/realms/{realm}/protocol/openid-connect/token", realm)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(new ParameterizedTypeReference<>() {});

        Object token = response == null ? null : response.get("access_token");
        if (token == null) {
            throw new IllegalStateException("Keycloak did not return an access token");
        }
        return token.toString();
    }

    private void assignRealmRole(String accessToken, String userId, String roleName) {
        Map<String, Object> role = restClientBuilder.build()
                .get()
                .uri(baseUrl + "/admin/realms/{realm}/roles/{roleName}", realm, roleName)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .retrieve()
                .body(new ParameterizedTypeReference<>() {});

        restClientBuilder.build()
                .post()
                .uri(baseUrl + "/admin/realms/{realm}/users/{userId}/role-mappings/realm", realm, userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(List.of(role))
                .retrieve()
                .toBodilessEntity();
    }
}
