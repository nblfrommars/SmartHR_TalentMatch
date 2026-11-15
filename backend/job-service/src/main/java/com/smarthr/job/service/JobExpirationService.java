package com.smarthr.job.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.smarthr.job.event.JobEventType;
import com.smarthr.job.event.OutboxPublisher;
import com.smarthr.job.mapper.JobMapper;
import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.repo.JobRepo;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class JobExpirationService {

    private final JobRepo jobRepo;
    private final JobMapper jobMapper;
    private final OutboxPublisher outboxPublisher;

    @Transactional
    public int closeExpiredBatch(int limit) {
        List<Job> expired = jobRepo.lockExpiredBatch(limit);
        for (Job job : expired) {
            job.setStatus(JobStatus.CLOSED);
        }
        jobRepo.flush();
        for (Job job : expired) {
            outboxPublisher.publish(JobEventType.EXPIRED, job.getId(), jobMapper.toResponse(job));
        }
        return expired.size();
    }
}
