package com.hr.user.cv.scheduler;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.hr.user.cv.entity.JobApplicationOutbox;
import com.hr.user.cv.event.JobApplicationEventType;
import com.hr.user.cv.repository.JobApplicationOutboxRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class JobApplicationOutboxRelayScheduler {

    private final JobApplicationOutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Scheduled(fixedDelay = 2000)
    @Transactional
    public void publishPendingEvents() {
        List<JobApplicationOutbox> events = outboxRepository.findTop50ByPublishedFalseOrderByCreatedAtAsc();
        for (JobApplicationOutbox event : events) {
            try {
                ProducerRecord<String, String> record = new ProducerRecord<>(
                        JobApplicationEventType.TOPIC,
                        event.getAggregateId().toString(),
                        event.getPayload());
                record.headers().add("event-type", event.getEventType().getBytes(StandardCharsets.UTF_8));
                kafkaTemplate.send(record).get(5, TimeUnit.SECONDS);
                event.setPublished(true);
            } catch (Exception ex) {
                log.error("Failed to publish job application event {} ({}); will retry", event.getId(),
                        event.getEventType(), ex);
                break;
            }
        }
    }
}
