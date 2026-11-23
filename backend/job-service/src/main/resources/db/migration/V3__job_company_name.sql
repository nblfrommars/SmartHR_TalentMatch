alter table jobs add column if not exists company_name varchar(255);
update jobs set company_name = 'Unknown' where company_name is null;
alter table jobs alter column company_name set not null;

create index if not exists idx_jobs_company_name_trgm on jobs using gin (lower(company_name) gin_trgm_ops);
