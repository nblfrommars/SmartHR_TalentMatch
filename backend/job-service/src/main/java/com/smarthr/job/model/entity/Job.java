package com.smarthr.job.model.entity;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity 
@Table(name = "jobs")
@NoArgsConstructor 
@AllArgsConstructor 
@Getter 
@Setter 
@Builder    
public class Job {
    @Id 
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false)
    private UUID id;   
    
    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "description", nullable = false, columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "level", nullable = false)
    private JobLevel level;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_type", nullable = false)
    private JobType jobType;

    @Enumerated(EnumType.STRING)
    @Column(name = "work_mode", nullable = false)
    private WorkMode workMode;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "location_id", nullable = false)
    private Location location;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "industry_id", nullable = false)
    private Industry industry;

    @Column(name = "salary_min")
    private Long salaryMin;

    @Column(name = "salary_max")
    private Long salaryMax;

    @Column(name = "min_years_exp")
    private Integer minYearsExp;

    @Column(name = "deadline", nullable = false)
    private OffsetDateTime deadline;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    @Column(name = "status", nullable = false)
    private JobStatus status = JobStatus.DRAFT;

    @Version 
    @Builder.Default
    @Column(name = "version", nullable = false)
    private Integer version = 0;

    @OneToMany(mappedBy = "job", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<JobSkill> jobSkills = new HashSet<>();

    public void addSkill(JobSkill skill) {
        jobSkills.add(skill);
        skill.setJob(this);
    }

    public void removeSkill(JobSkill skill) {
        jobSkills.remove(skill);
        skill.setJob(null);
    }
}
