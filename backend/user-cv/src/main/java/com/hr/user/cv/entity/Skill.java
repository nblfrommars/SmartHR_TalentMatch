package com.hr.user.cv.entity;

import java.time.Instant;

import com.hr.user.cv.enums.SkillStatus;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "skill", uniqueConstraints = @UniqueConstraint(name = "uk_skills_normalized_title", columnNames = "normalized_title"))
@Getter
@Setter
@NoArgsConstructor
public class Skill {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "normalized_title", nullable = false)
    private String normalizedTitle;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SkillStatus status = SkillStatus.PENDING;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // Khi admin gộp skill này vào skill chính
    @Column(name = "merged_into_id")
    private Long mergedIntoId;

    @PrePersist
    @PreUpdate
    void prepare() {
        if (title != null) {
            title = title.trim();
            normalizedTitle = title.toLowerCase();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}