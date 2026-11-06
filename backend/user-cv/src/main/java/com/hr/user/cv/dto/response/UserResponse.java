package com.hr.user.cv.dto.response;

import java.util.Date;

import com.hr.user.cv.enums.UserRole;

import lombok.Data;

@Data
public class UserResponse {
    private Long id;
    private String userName;
    private String fullName;
    private Date dob;
    private UserRole role;
    private boolean active;
}
