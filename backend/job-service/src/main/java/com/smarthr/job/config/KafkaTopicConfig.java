package com.smarthr.job.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

import com.smarthr.job.event.JobEventType;

@Configuration
@ConditionalOnProperty(name = "app.kafka.create-topics", havingValue = "true", matchIfMissing = true)
public class KafkaTopicConfig {

    @Bean
    public NewTopic jobEventsTopic(@Value("${app.kafka.partitions:3}") int partitions,
            @Value("${app.kafka.replicas:1}") int replicas) {
        return TopicBuilder.name(JobEventType.TOPIC).partitions(partitions).replicas(replicas).build();
    }
}
