create extension if not exists "pgcrypto";

create table if not exists jobs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    created_by uuid not null,
    title varchar(255) not null,
    description text not null,
    level varchar(50) not null,
    job_type varchar(50) not null,
    work_mode varchar(50) not null,
    location varchar(255) not null,
    industry varchar(100) not null,
    salary_min bigint,
    salary_max bigint,
    min_years_exp int,
    deadline timestamptz not null,
    status varchar(50) not null default 'DRAFT',
    version int not null default 0
);

create table if not exists job_skills (
    job_id uuid not null references jobs(id) on delete cascade,
    skill varchar(50) not null,
    must_have boolean not null default false,
    required boolean not null default true,
    primary key (job_id, skill)
);

create table if not exists outbox (
    id uuid primary key default gen_random_uuid(),
    event_type varchar(100) not null,
    aggregate_id uuid not null,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    published boolean not null default false
);

create table if not exists outbox (
    id uuid primary key default gen_random_uuid(),
    event_type varchar(100) not null,
    aggregate_id uuid not null,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    published boolean not null default false
);