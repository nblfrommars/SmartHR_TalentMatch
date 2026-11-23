package com.hr.user.cv.dto.response;

import java.util.Date;
import java.util.UUID;

import com.hr.user.cv.enums.UserRole;
import com.hr.user.cv.enums.Gender;

import lombok.Data;

@Data
public class UserResponse {
    private UUID id;
    private String userName;
    private String fullName;
    private Date dob;
    private Gender gender;
    private UserRole role;
    private UUID companyId;
    private boolean active;
}
