package com.smarthr.job.scheduler;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthr.job.dto.res.JobRes;
import com.smarthr.job.mapper.JobMapper;
import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.entity.Outbox;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.repo.JobRepo;
import com.smarthr.job.repo.OutboxRepo;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class JobExpirationScheduler {

    private final JobRepo jobRepo;
    private final OutboxRepo outboxRepo;
    private final JobMapper jobMapper;
    private final ObjectMapper objectMapper;

    @Scheduled(cron = "0 */5 * * * *")
    @Transactional
    public void closeExpiredJobs() {
        List<Job> expiredJobs = jobRepo.findByStatusAndDeadlineBefore(JobStatus.OPEN, OffsetDateTime.now());

        for (Job job : expiredJobs) {
            job.setStatus(JobStatus.CLOSED);
            Job closedJob = jobRepo.save(job);

            JobRes res = jobMapper.toResponse(closedJob);
            try {
                String payload = objectMapper.writeValueAsString(res);
                Outbox outbox = Outbox.builder()
                        .eventType("job.expired")
                        .aggregateId(closedJob.getId())
                        .payload(payload)
                        .build();
                outboxRepo.save(outbox);
            } catch (JsonProcessingException e) {
                log.error("Failed to serialize job.expired event for jobId: {}", closedJob.getId(), e);
            }
        }
    }
}