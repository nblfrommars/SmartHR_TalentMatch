package com.hr.user.cv.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.Date;

import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import com.hr.user.cv.enums.UserRole;
@Entity
@Getter
@Setter
@EntityListeners({AuditingEntityListener.class})
public class User{

    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "username", unique = true, nullable = false)
    private String userName;
    
    @Column(name = "full_name")
    private String fullName;

    @Column(name = "dob")
    private Date dob;

    @Column(name = "is_active")
    private boolean isActive;

    @Column(name = "is_deleted")
    private boolean isDeleted;

    @Column(name = "role")
    @Enumerated(EnumType.STRING)
    private UserRole role;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    void prepare() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}