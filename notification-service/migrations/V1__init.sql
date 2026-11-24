CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Read-model dựng từ topic job.events (data = JobRes, xem backend/job-service/DATAFORAISERVICE.md).
-- Dùng để biết job do HR nào đăng (createdBy) và tên job khi tạo thông báo.
CREATE TABLE job_snapshots (
    job_id      uuid PRIMARY KEY,                    -- data.id
    hr_user_id  uuid         NOT NULL,               -- data.createdBy: người nhận thông báo
    title       varchar(255) NOT NULL,               -- data.title
    status      varchar(20)  NOT NULL,               -- DRAFT / OPEN / CLOSED, cộng DELETED do service tự đặt
    version     int          NOT NULL,               -- data.version: chống event đến sai thứ tự
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Mỗi người nhận một dòng (fan-out on write)
CREATE TABLE notifications (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id     uuid          NOT NULL,         -- Keycloak sub (X-User-Id)
    type             varchar(50)   NOT NULL,
    title            varchar(255)  NOT NULL,
    body             varchar(1000),                  -- giới hạn để payload pg_notify < 8000 byte
    entity_type      varchar(30),                    -- 'APPLICATION' | 'JOB': FE dùng để điều hướng
    entity_id        uuid,
    data             jsonb         NOT NULL DEFAULT '{}'::jsonb,
    source_event_id  uuid          NOT NULL,         -- eventId của EventEnvelope
    read_at          timestamptz,                    -- NULL = chưa đọc
    created_at       timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_notifications_event_recipient UNIQUE (source_event_id, recipient_id),
    CONSTRAINT chk_notifications_type CHECK (type IN (
        'APPLICATION_RECEIVED',        -- HR: có người apply
        'APPLICATION_WITHDRAWN',       -- HR: ứng viên rút đơn (chờ user-cv phát event)
        'APPLICATION_STATUS_CHANGED',  -- USER: HR đổi trạng thái (chờ user-cv phát event)
        'JOB_EXPIRED'                  -- HR: job hết hạn và bị đóng
    ))
);

-- Danh sách thông báo, phân trang keyset theo (created_at, id)
CREATE INDEX idx_notifications_recipient_created
    ON notifications (recipient_id, created_at DESC, id DESC);

-- Đếm số chưa đọc
CREATE INDEX idx_notifications_recipient_unread
    ON notifications (recipient_id) WHERE read_at IS NULL;

-- Realtime: NOTIFY chỉ phát khi transaction commit, mọi instance đang LISTEN đều nhận được
CREATE FUNCTION notify_notification_created() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('notification_created', row_to_json(NEW)::text);
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notifications_created
    AFTER INSERT ON notifications
    FOR EACH ROW EXECUTE FUNCTION notify_notification_created();
