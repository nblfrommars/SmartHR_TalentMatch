package com.smarthr.gateway.filter;

import java.util.UUID;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

@Component
public class DefenseInDepthGlobalFilter implements GlobalFilter, Ordered {

    private static final String CORRELATION_ID = "X-Correlation-Id";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String correlationId = exchange.getRequest().getHeaders().getFirst(CORRELATION_ID);
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString();
        }

        String finalCorrelationId = correlationId;
        exchange.getResponse().getHeaders().set(CORRELATION_ID, finalCorrelationId);
        return exchange.getPrincipal()
                .cast(JwtAuthenticationToken.class)
                .map(authentication -> {
                    String userId = authentication.getToken().getSubject();
                    String role = authentication.getAuthorities().stream()
                            .map(authority -> authority.getAuthority().replaceFirst("^ROLE_", ""))
                            .filter(value -> value.equals("ADMIN") || value.equals("HR") || value.equals("USER"))
                            .findFirst().orElse("");

                    return withIdentityHeaders(exchange, userId, role, finalCorrelationId);
                })
                .defaultIfEmpty(withIdentityHeaders(exchange, "", "", finalCorrelationId))
                .flatMap(mutated -> addSecurityHeaders(mutated, chain));
    }

    private ServerWebExchange withIdentityHeaders(ServerWebExchange exchange, String userId,
            String role, String correlationId) {
        HttpHeaders headers = new HttpHeaders();
        headers.putAll(exchange.getRequest().getHeaders());
        headers.remove("X-User-Id");
        headers.remove("X-User-Role");
        headers.remove("X-Company-Id");
        headers.set("X-User-Id", userId);
        headers.set("X-User-Role", role);
        headers.set(CORRELATION_ID, correlationId);

        ServerHttpRequest decoratedRequest = new ServerHttpRequestDecorator(exchange.getRequest()) {
            @Override
            public HttpHeaders getHeaders() {
                return headers;
            }
        };
        return exchange.mutate().request(decoratedRequest).build();
    }

    private Mono<Void> addSecurityHeaders(ServerWebExchange exchange, GatewayFilterChain chain) {
        exchange.getResponse().getHeaders().addIfAbsent("X-Content-Type-Options", "nosniff");
        exchange.getResponse().getHeaders().addIfAbsent("X-Frame-Options", "DENY");
        exchange.getResponse().getHeaders().addIfAbsent("Referrer-Policy", "no-referrer");
        exchange.getResponse().getHeaders().addIfAbsent("Content-Security-Policy", "default-src 'none'");
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
