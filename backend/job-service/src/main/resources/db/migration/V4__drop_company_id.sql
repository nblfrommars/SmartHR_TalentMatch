drop index if exists idx_jobs_company_id;
alter table jobs drop column if exists company_id;
