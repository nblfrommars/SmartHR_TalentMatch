package com.smarthr.job.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.smarthr.job.dto.req.JobSkillReq;
import com.smarthr.job.dto.req.UpdateJobReq;
import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.entity.JobSkill;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;

class JobMapperTest {

    private final JobMapper mapper = new JobMapper();

    @Test
    void updateKeepsExistingSkillsInsteadOfRecreatingThem() {
        UUID jobId = UUID.randomUUID();
        Job job = Job.builder().id(jobId).build();
        JobSkill java = skill(jobId, "java", false, true);
        JobSkill spring = skill(jobId, "spring", false, true);
        job.addSkill(java);
        job.addSkill(spring);

        mapper.updateEntity(job, request(
                skillReq("Java", true, true),
                skillReq("docker", false, false)));

        Map<String, JobSkill> byName = job.getJobSkills().stream()
                .collect(Collectors.toMap(s -> s.getJobSkillId().getSkill(), Function.identity()));
        assertThat(byName).containsOnlyKeys("java", "docker");

        assertThat(byName.get("java")).isSameAs(java);
        assertThat(java.getMustHave()).isTrue();
        assertThat(byName.get("docker").getRequired()).isFalse();
        assertThat(byName.get("docker").getJobSkillId().getJobId()).isEqualTo(jobId);
    }

    @Test
    void duplicateSkillsInRequestAreCollapsedCaseInsensitively() {
        Job job = Job.builder().id(UUID.randomUUID()).build();

        mapper.updateEntity(job, request(
                skillReq("Kafka", false, true),
                skillReq(" kafka ", true, true),
                skillReq("Postgres", false, true)));

        assertThat(job.getJobSkills())
                .extracting(s -> s.getJobSkillId().getSkill())
                .containsExactlyInAnyOrder("Kafka", "Postgres");
    }

    private static JobSkill skill(UUID jobId, String name, boolean mustHave, boolean required) {
        return JobSkill.builder()
                .jobSkillId(JobSkill.JobSkillId.builder().jobId(jobId).skill(name).build())
                .mustHave(mustHave)
                .required(required)
                .build();
    }

    private static JobSkillReq skillReq(String name, boolean mustHave, boolean required) {
        return JobSkillReq.builder().skill(name).mustHave(mustHave).required(required).build();
    }

    private static UpdateJobReq request(JobSkillReq... skills) {
        UpdateJobReq req = new UpdateJobReq();
        req.setCompanyName("Acme Corp");
        req.setTitle("Backend Developer");
        req.setDescription("desc");
        req.setLevel(JobLevel.SENIOR);
        req.setJobType(JobType.FULL_TIME);
        req.setWorkMode(WorkMode.HYBRID);
        req.setDeadline(OffsetDateTime.now().plusDays(7));
        req.setSkills(List.of(skills));
        return req;
    }
}
