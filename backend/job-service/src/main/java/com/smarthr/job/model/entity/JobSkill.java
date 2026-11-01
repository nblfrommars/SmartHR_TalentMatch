package com.smarthr.job.model.entity;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "job_skills")
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
@EqualsAndHashCode(of = "jobSkillId")
public class JobSkill {

    @Embeddable
    @NoArgsConstructor
    @AllArgsConstructor
    @Getter
    @Setter
    @Builder
    @EqualsAndHashCode
    public static class JobSkillId implements java.io.Serializable {
        private static final long serialVersionUID = 1L;

        @Column(name = "job_id", nullable = false)
        private UUID jobId;

        @Column(name = "skill", nullable = false)
        private String skill;
    }

    @EmbeddedId
    private JobSkillId jobSkillId;

    @Column(name = "must_have", nullable = false)
    @Builder.Default
    private Boolean mustHave = false;

    @Column(name = "required", nullable = false)
    @Builder.Default
    private Boolean required = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("jobId")
    @JoinColumn(name = "job_id", nullable = false)
    private Job job;
}
