package com.smarthr.gateway.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import reactor.core.publisher.Mono;

@Configuration
@EnableConfigurationProperties(GatewayProperties.class)
public class GatewayConfig {

    @Bean
    KeyResolver userOrIpKeyResolver() {
        return exchange -> exchange.getPrincipal()
                .map(principal -> "user:" + principal.getName())
                .switchIfEmpty(Mono.just("ip:" + exchange.getRequest().getRemoteAddress()));
    }

    @Bean
    CorsWebFilter corsWebFilter(GatewayProperties properties) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.stream(properties.getAllowedOrigins().split(","))
                .map(String::trim).filter(origin -> !origin.isBlank()).toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of(HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_TYPE,
                "X-Correlation-Id"));
        config.setExposedHeaders(List.of("X-Correlation-Id"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsWebFilter(source);
    }
}
