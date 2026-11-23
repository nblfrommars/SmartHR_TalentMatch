package com.hr.user.cv.integration;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import lombok.Data;

@Component
public class JobServiceClient {

    private final RestClient restClient;

    public JobServiceClient(@Value("${job-service.base-url}") String baseUrl) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    public JobSnapshot getOpenJob(UUID jobId) {
        try {
            JobSnapshot job = restClient.get()
                    .uri("/api/v1/jobs/{id}", jobId)
                    .retrieve()
                    .body(JobSnapshot.class);

            if (job == null || !"OPEN".equalsIgnoreCase(job.getStatus())
                    || job.getDeadline() == null || !job.getDeadline().isAfter(OffsetDateTime.now())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Job is not open for applications");
            }
            return job;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found", ex);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to verify job", ex);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Job-service is unavailable", ex);
        }
    }

    public JobSnapshot getJob(UUID jobId) {
        try {
            JobSnapshot job = restClient.get()
                    .uri("/api/v1/jobs/{id}", jobId)
                    .retrieve()
                    .body(JobSnapshot.class);
            if (job == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found");
            }
            return job;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found", ex);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to verify job owner", ex);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Job-service is unavailable", ex);
        }
    }

    @Data
    public static class JobSnapshot {
        private UUID id;
        private String title;
        private String status;
        private OffsetDateTime deadline;
        private UUID createdBy;
    }
}
