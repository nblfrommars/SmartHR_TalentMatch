create extension if not exists "pgcrypto";

create table if not exists jobs (
	id UUID primary key default gen_random_uuid(),
	company_id UUID not null,
	hr_id UUID not null,
	title varchar(255) not null,
	description text not null,
	level varchar(50) not null, 
	job_type varchar(50) not null,
	work_mode varchar(50) not null,
	location varchar(255) not null, 
	industry varchar(100) not null,
	salary_min bigint,
	salary_max bigint,
	salary_negotiable boolean not null default false,
	yoe int not null default 0,
	deadline timestamptz not null, 
	status varchar(50) not null default 'OPEN',
	created_at timestamptz not null default CURRENT_TIMESTAMP,
	updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create table if not exists job_skills (
	id UUID primary key default gen_random_uuid(),
	job_id UUID not null references jobs(id) on delete cascade,
	skill_name varchar(100) not null, 
	must_have boolean not null default false,
	required boolean not null default true
);



