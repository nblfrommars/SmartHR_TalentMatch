package com.hr.user.cv.dto.response;

import java.util.UUID;

import com.hr.user.cv.enums.UserRole;

import lombok.AllArgsConstructor;
import lombok.Data;

/** Identity context consumed by the gateway when it builds job-service headers. */
@Data
@AllArgsConstructor
public class UserContextResponse {
    private UUID userId;
    private UserRole role;
    private UUID companyId;
    private boolean active;
}
