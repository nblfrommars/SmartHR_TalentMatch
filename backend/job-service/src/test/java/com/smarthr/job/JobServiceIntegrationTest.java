package com.smarthr.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.entity.Outbox;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;
import com.smarthr.job.repo.IndustryRepo;
import com.smarthr.job.repo.JobRepo;
import com.smarthr.job.repo.LocationRepo;
import com.smarthr.job.repo.OutboxRepo;
import com.smarthr.job.scheduler.OutboxRelayScheduler;
import com.smarthr.job.service.JobExpirationService;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(properties = {
        "app.scheduling.enabled=false",
        "app.kafka.create-topics=false"
})
@AutoConfigureMockMvc
class JobServiceIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired JobRepo jobRepo;
    @Autowired OutboxRepo outboxRepo;
    @Autowired IndustryRepo industryRepo;
    @Autowired LocationRepo locationRepo;
    @Autowired JobExpirationService expirationService;
    @Autowired OutboxRelayScheduler relay;
    @MockBean KafkaTemplate<String, String> kafkaTemplate;

    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void cleanDatabase() {
        outboxRepo.deleteAll();
        jobRepo.deleteAll();
    }

    @Test
    void createJobStoresEnvelopedEventInOutbox() throws Exception {
        JsonNode created = createJob("Java Developer", skills("java", "kafka"));

        List<Outbox> events = outboxRepo.findAll();
        assertThat(events).hasSize(1);
        JsonNode envelope = objectMapper.readTree(events.get(0).getPayload());
        assertThat(envelope.get("type").asText()).isEqualTo("job.created");
        assertThat(envelope.get("producer").asText()).isEqualTo("job-service");
        assertThat(envelope.get("version").asInt()).isEqualTo(1);
        assertThat(envelope.get("eventId").asText()).isNotBlank();
        assertThat(envelope.get("occurredAt").asText()).isNotBlank();
        assertThat(envelope.at("/data/id").asText()).isEqualTo(created.get("id").asText());
        assertThat(envelope.at("/data/version").asInt()).isZero();
        assertThat(created.get("publishedAt").isNull()).isFalse();
        assertThat(created.get("createdAt").isNull()).isFalse();
    }

    @Test
    void updateKeepingSomeSkillsDoesNotViolateThePrimaryKey() throws Exception {
        String id = createJob("Backend", skills("java", "spring")).get("id").asText();

        Map<String, Object> body = jobBody("Backend", List.of(
                Map.of("skill", "Java", "mustHave", true),
                Map.of("skill", "docker")));
        mvc.perform(put("/api/v1/jobs/" + id).headers(hr()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.skills.length()").value(2))
                .andExpect(jsonPath("$.version").value(1));

        assertThat(eventTypes()).containsExactly("job.created", "job.updated");
    }

    @Test
    void updatingOnlySkillsStillBumpsTheVersion() throws Exception {
        String id = createJob("Backend", skills("java")).get("id").asText();

        mvc.perform(put("/api/v1/jobs/" + id).headers(hr()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(jobBody("Backend", skills("java", "kafka")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    void publicSearchOnlyReturnsOpenJobsWithFutureDeadline() throws Exception {
        String token = "zq" + UUID.randomUUID().toString().substring(0, 8);
        createJob("Open " + token, skills("java"));
        String closedId = createJob("Closed " + token, skills("java")).get("id").asText();
        mvc.perform(patch("/api/v1/jobs/" + closedId + "/close").headers(hr())).andExpect(status().isNoContent());
        saveRawJob("Expired " + token, JobStatus.OPEN, OffsetDateTime.now().minusDays(1));
        saveRawJob("Draft " + token, JobStatus.DRAFT, OffsetDateTime.now().plusDays(5));

        mvc.perform(get("/api/v1/jobs").param("keyword", token.toUpperCase()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Open " + token));
    }

    @Test
    void searchByCompanyNameIsCaseInsensitiveAndPartial() throws Exception {
        String unique = "Co" + UUID.randomUUID().toString().substring(0, 8);
        Map<String, Object> body = jobBody("Any title", skills("java"));
        body.put("companyName", unique + " Holdings");
        mvc.perform(post("/api/v1/jobs").headers(hr()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.companyName").value(unique + " Holdings"));

        mvc.perform(get("/api/v1/jobs").param("companyName", unique.toUpperCase()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/jobs").param("companyName", "no-such-" + unique))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void keywordAlsoMatchesSkillsAndTreatsWildcardsLiterally() throws Exception {
        String skill = "sk" + UUID.randomUUID().toString().substring(0, 8);
        createJob("Some title", skills(skill));

        mvc.perform(get("/api/v1/jobs").param("keyword", skill))
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/jobs").param("keyword", "%"))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void closedJobIsHiddenFromOthersButVisibleToItsOwner() throws Exception {
        String id = createJob("Hidden soon", skills("java")).get("id").asText();
        mvc.perform(patch("/api/v1/jobs/" + id + "/close").headers(hr())).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/jobs/" + id)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/jobs/" + id).header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/jobs/" + id).header("X-User-Id", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED"));
    }

    @Test
    void closingTwiceEmitsOnlyOneEventAndClosedJobsCannotBeEdited() throws Exception {
        String id = createJob("Close me", skills("java")).get("id").asText();

        mvc.perform(patch("/api/v1/jobs/" + id + "/close").headers(hr())).andExpect(status().isNoContent());
        mvc.perform(patch("/api/v1/jobs/" + id + "/close").headers(hr())).andExpect(status().isNoContent());

        assertThat(eventTypes()).containsExactly("job.created", "job.closed");
        mvc.perform(put("/api/v1/jobs/" + id).headers(hr()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(jobBody("Close me", skills("java")))))
                .andExpect(status().isConflict());
    }

    @Test
    void deleteEmitsJobDeleted() throws Exception {
        String id = createJob("Delete me", skills("java")).get("id").asText();

        mvc.perform(delete("/api/v1/jobs/" + id).headers(hr())).andExpect(status().isNoContent());

        assertThat(jobRepo.findById(UUID.fromString(id))).isEmpty();
        assertThat(eventTypes()).containsExactly("job.created", "job.deleted");
    }

    @Test
    void invalidRequestsReturnStructuredErrors() throws Exception {
        Map<String, Object> body = jobBody("Bad salary", skills("java"));
        body.put("salaryMin", 50_000_000);
        body.put("salaryMax", 10_000_000);

        mvc.perform(post("/api/v1/jobs").headers(hr()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.details[0].field").value("salaryRangeValid"));
    }

    @Test
    void onlyTheCreatingHrCanModify() throws Exception {
        String id = createJob("Mine", skills("java")).get("id").asText();

        mvc.perform(patch("/api/v1/jobs/" + id + "/close").headers(headers("USER", userId)))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/jobs/" + id + "/close").headers(headers("HR", UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void expiredJobsAreClosedAndAnnounced() {
        Job expired = saveRawJob("Past deadline", JobStatus.OPEN, OffsetDateTime.now().minusMinutes(1));
        saveRawJob("Still open", JobStatus.OPEN, OffsetDateTime.now().plusDays(1));

        int closed = expirationService.closeExpiredBatch(100);

        assertThat(closed).isEqualTo(1);
        assertThat(jobRepo.findById(expired.getId()).orElseThrow().getStatus()).isEqualTo(JobStatus.CLOSED);
        assertThat(eventTypes()).containsExactly("job.expired");
        assertThat(expirationService.closeExpiredBatch(100)).isZero();
    }

    @Test
    void outboxEventsSurviveKafkaOutageAndArePublishedOnceItRecovers() throws Exception {
        createJob("Outbox", skills("java"));

        when(kafkaTemplate.send(any(ProducerRecord.class)))
                .thenReturn(CompletableFuture.failedFuture(new RuntimeException("Kafka down")));
        relay.processOutboxEvents();
        assertThat(outboxRepo.findAll()).allMatch(e -> !e.getPublished());

        when(kafkaTemplate.send(any(ProducerRecord.class))).thenReturn(CompletableFuture.completedFuture(null));
        relay.processOutboxEvents();
        assertThat(outboxRepo.findAll()).allMatch(Outbox::getPublished);
    }

    private JsonNode createJob(String title, List<Map<String, Object>> skills) throws Exception {
        ResultActions result = mvc.perform(post("/api/v1/jobs").headers(hr()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(jobBody(title, skills))))
                .andExpect(status().isCreated());
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private Map<String, Object> jobBody(String title, List<Map<String, Object>> skills) {
        Map<String, Object> body = new HashMap<>();
        body.put("companyName", "Acme Corp");
        body.put("title", title);
        body.put("description", "Description of " + title);
        body.put("level", "SENIOR");
        body.put("jobType", "FULL_TIME");
        body.put("workMode", "HYBRID");
        body.put("locationId", locationRepo.findAll().get(0).getId().toString());
        body.put("industryId", industryRepo.findAll().get(0).getId().toString());
        body.put("salaryMin", 15_000_000);
        body.put("salaryMax", 40_000_000);
        body.put("minYearsExp", 2);
        body.put("deadline", OffsetDateTime.now().plusDays(30).toString());
        body.put("skills", skills);
        return body;
    }

    private static List<Map<String, Object>> skills(String... names) {
        return java.util.Arrays.stream(names).map(n -> Map.<String, Object>of("skill", n)).toList();
    }

    private org.springframework.http.HttpHeaders hr() {
        return headers("HR", userId);
    }

    private org.springframework.http.HttpHeaders headers(String role, UUID user) {
        org.springframework.http.HttpHeaders h = new org.springframework.http.HttpHeaders();
        h.add("X-User-Id", user.toString());
        h.add("X-User-Role", role);
        return h;
    }

    private List<String> eventTypes() {
        return outboxRepo.findAll().stream()
                .sorted(java.util.Comparator.comparing(Outbox::getCreatedAt))
                .map(Outbox::getEventType)
                .toList();
    }

    private Job saveRawJob(String title, JobStatus status, OffsetDateTime deadline) {
        return jobRepo.saveAndFlush(Job.builder()
                .companyName("Acme Corp")
                .createdBy(userId)
                .title(title)
                .description("raw")
                .level(JobLevel.JUNIOR)
                .jobType(JobType.FULL_TIME)
                .workMode(WorkMode.ONSITE)
                .location(locationRepo.findAll().get(0))
                .industry(industryRepo.findAll().get(0))
                .deadline(deadline)
                .status(status)
                .build());
    }
}
