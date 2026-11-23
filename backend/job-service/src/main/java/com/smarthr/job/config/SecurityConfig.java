package com.smarthr.job.config;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Job-service là OAuth2 resource server: tự verify chữ ký JWT do Keycloak cấp, không tin header do client gửi.
 * Role lấy từ claim realm_access.roles (USER, HR, ADMIN) và trở thành authority ROLE_*.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String JOBS = "/api/v1/jobs";

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info", "/error")
                                .permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()

                        // Phải đứng trước rule GET /jobs/** vì "/my" cũng khớp mẫu "/jobs/{id}".
                        .requestMatchers(HttpMethod.GET, JOBS + "/my").hasRole("HR")

                        // Công khai: tìm kiếm, xem chi tiết (service tự ẩn job đã đóng/hết hạn), danh mục.
                        .requestMatchers(HttpMethod.GET, JOBS, JOBS + "/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/industries", "/api/v1/locations").permitAll()

                        // Ghi dữ liệu: chỉ HR. Quyền sở hữu (createdBy) vẫn do service kiểm tra.
                        .requestMatchers(HttpMethod.POST, JOBS).hasRole("HR")
                        .requestMatchers(HttpMethod.PUT, JOBS + "/*").hasRole("HR")
                        .requestMatchers(HttpMethod.PATCH, JOBS + "/*/close").hasRole("HR")
                        .requestMatchers(HttpMethod.DELETE, JOBS + "/*").hasRole("HR")

                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtConverter())));
        return http.build();
    }

    private JwtAuthenticationConverter jwtConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Collection<GrantedAuthority> authorities = new ArrayList<>();
            if (jwt.getClaims().get("realm_access") instanceof Map<?, ?> realmAccess
                    && realmAccess.get("roles") instanceof List<?> roles) {
                roles.stream()
                        .filter(String.class::isInstance)
                        .map(String.class::cast)
                        .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                        .forEach(authorities::add);
            }
            return authorities;
        });
        return converter;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(o -> !o.isBlank())
                .toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Correlation-Id"));
        configuration.setExposedHeaders(List.of("X-Correlation-Id"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
