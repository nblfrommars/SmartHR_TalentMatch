package com.smarthr.job.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import com.smarthr.job.dto.req.CreateJobReq;
import com.smarthr.job.dto.req.JobSkillReq;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

class JobReqValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    @Test
    void validRequestHasNoViolations() {
        assertThat(validator.validate(validRequest())).isEmpty();
    }

    @Test
    void salaryMinGreaterThanSalaryMaxIsRejected() {
        CreateJobReq req = validRequest();
        req.setSalaryMin(30_000_000L);
        req.setSalaryMax(20_000_000L);

        assertThat(paths(validator.validate(req))).contains("salaryRangeValid");
    }

    @Test
    void openEndedSalaryIsAllowed() {
        CreateJobReq req = validRequest();
        req.setSalaryMin(30_000_000L);
        req.setSalaryMax(null);

        assertThat(validator.validate(req)).isEmpty();
    }

    @Test
    void valuesLongerThanColumnsAreRejected() {
        CreateJobReq req = validRequest();
        req.setTitle("t".repeat(256));
        req.setSkills(List.of(JobSkillReq.builder().skill("s".repeat(51)).build()));

        assertThat(paths(validator.validate(req))).contains("title", "skills[0].skill");
    }

    @Test
    void negativeMinYearsExpIsRejected() {
        CreateJobReq req = validRequest();
        req.setMinYearsExp(-1);

        assertThat(paths(validator.validate(req))).contains("minYearsExp");
    }

    private static Set<String> paths(Set<ConstraintViolation<CreateJobReq>> violations) {
        return violations.stream().map(v -> v.getPropertyPath().toString()).collect(java.util.stream.Collectors.toSet());
    }

    private static CreateJobReq validRequest() {
        CreateJobReq req = new CreateJobReq();
        req.setCompanyName("Acme Corp");
        req.setTitle("Senior Java Developer");
        req.setDescription("Build services");
        req.setLevel(JobLevel.SENIOR);
        req.setJobType(JobType.FULL_TIME);
        req.setWorkMode(WorkMode.REMOTE);
        req.setLocationId(UUID.randomUUID());
        req.setIndustryId(UUID.randomUUID());
        req.setSalaryMin(20_000_000L);
        req.setSalaryMax(40_000_000L);
        req.setMinYearsExp(3);
        req.setDeadline(OffsetDateTime.now().plusDays(30));
        req.setSkills(List.of(JobSkillReq.builder().skill("java").mustHave(true).build()));
        return req;
    }
}
