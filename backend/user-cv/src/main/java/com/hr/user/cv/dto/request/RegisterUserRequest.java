package com.hr.user.cv.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class RegisterUserRequest extends CreateUserRequest {

    @NotBlank
    private String password;
}
