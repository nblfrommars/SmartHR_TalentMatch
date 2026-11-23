package com.smarthr.gateway.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@ConfigurationProperties(prefix = "app.gateway")
public class GatewayProperties {
    private String allowedOrigins = "http://localhost:5173,http://localhost:5174";
}
