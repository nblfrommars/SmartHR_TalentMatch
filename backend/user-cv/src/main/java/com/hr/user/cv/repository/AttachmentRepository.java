package com.hr.user.cv.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.hr.user.cv.entity.Attachment;

@Repository
public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {
}
