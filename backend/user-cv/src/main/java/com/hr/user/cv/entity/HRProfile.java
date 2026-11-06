package com.hr.user.cv.entity;

import java.util.UUID;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "hr_profile")
@Getter
@Setter
@NoArgsConstructor
public class HRProfile {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "is_verified", nullable = false)
    private boolean verified = false;
}