package com.hr.user.cv.controller;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.hr.user.cv.dto.request.CreateCVProfileRequest;
import com.hr.user.cv.dto.response.CVDetailResponse;
import com.hr.user.cv.service.impl.CVProfileServiceImpl;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/cvs")
@RequiredArgsConstructor
public class CVProfileController {

    private final CVProfileServiceImpl cvProfileService;

    @GetMapping("/me")
    public CVDetailResponse getMyCv(@AuthenticationPrincipal Jwt jwt) {
        return cvProfileService.get(userId(jwt));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CVDetailResponse create(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateCVProfileRequest request) {
        return cvProfileService.create(userId(jwt), request);
    }

    @PutMapping("/me")
    public CVDetailResponse update(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateCVProfileRequest request) {
        return cvProfileService.update(userId(jwt), request);
    }

    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt) {
        cvProfileService.delete(userId(jwt));
    }

    private UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException ex) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "JWT subject must be a UUID", ex);
        }
    }
}
