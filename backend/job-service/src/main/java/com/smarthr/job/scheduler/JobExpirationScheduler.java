package com.smarthr.job.scheduler;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.smarthr.job.service.JobExpirationService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class JobExpirationScheduler {

    private final JobExpirationService expirationService;

    @Value("${app.expiration.batch-size:100}")
    private int batchSize;

    @Scheduled(cron = "0 */5 * * * *")
    public void closeExpiredJobs() {
        int closed;
        int total = 0;
        do {
            closed = expirationService.closeExpiredBatch(batchSize);
            total += closed;
        } while (closed >= batchSize);

        if (total > 0) {
            log.info("Closed {} expired job(s)", total);
        }
    }
}
