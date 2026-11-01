package com.smarthr.job.repo;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.smarthr.job.model.entity.JobSkill;
import com.smarthr.job.model.entity.JobSkill.JobSkillId;

@Repository
public interface JobSkillRepo extends JpaRepository<JobSkill, JobSkillId> {

    List<JobSkill> findByJobSkillIdJobId(UUID jobId);

    void deleteByJobSkillIdJobId(UUID jobId);
}