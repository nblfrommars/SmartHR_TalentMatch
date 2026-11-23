alter table jobs add column if not exists created_at timestamptz not null default now();
alter table jobs add column if not exists updated_at timestamptz not null default now();
alter table jobs add column if not exists published_at timestamptz;

update jobs set status = 'CLOSED' where status = 'EXPIRED';
update jobs set published_at = created_at where published_at is null and status <> 'DRAFT';

alter table jobs add constraint chk_jobs_status check (status in ('DRAFT', 'OPEN', 'CLOSED'));

create extension if not exists pg_trgm;
create index if not exists idx_jobs_title_trgm on jobs using gin (lower(title) gin_trgm_ops);
create index if not exists idx_jobs_description_trgm on jobs using gin (lower(description) gin_trgm_ops);
create index if not exists idx_jobs_created_by on jobs (created_by);
