create extension if not exists "pgcrypto";

create table if not exists industries (
    id uuid primary key default gen_random_uuid(),
    name varchar(100) not null unique,
    parent_id uuid references industries(id)
);

create index if not exists idx_industries_parent_id on industries (parent_id);

create table if not exists locations (
    id uuid primary key default gen_random_uuid(),
    name varchar(100) not null,
    parent_id uuid references locations(id)
);

create index if not exists idx_locations_parent_id on locations (parent_id);
-- Province names are unique; area names only need to be unique within their province.
create unique index if not exists uq_locations_province_name on locations (name) where parent_id is null;
create unique index if not exists uq_locations_area_name on locations (parent_id, name) where parent_id is not null;

create table if not exists jobs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    created_by uuid not null,
    title varchar(255) not null,
    description text not null,
    level varchar(50) not null,
    job_type varchar(50) not null,
    work_mode varchar(50) not null,
    location_id uuid not null references locations(id),
    industry_id uuid not null references industries(id),
    salary_min bigint,
    salary_max bigint,
    min_years_exp int,
    deadline timestamptz not null,
    status varchar(50) not null default 'DRAFT',
    version int not null default 0,
    constraint chk_jobs_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create index if not exists idx_jobs_company_id on jobs (company_id);
create index if not exists idx_jobs_status_deadline on jobs (status, deadline);
create index if not exists idx_jobs_industry_id on jobs (industry_id);
create index if not exists idx_jobs_location_id on jobs (location_id);

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

create index if not exists idx_outbox_published_created_at on outbox (published, created_at);

-- Seed data: root industries, then child industries linked by name.
insert into industries (name) values
    ('Information Technology'), ('Finance & Banking'), ('Marketing & Sales'),
    ('Manufacturing'), ('Education'), ('Healthcare')
on conflict (name) do nothing;

insert into industries (name, parent_id)
select v.name, p.id
from (values
    ('Software Development', 'Information Technology'),
    ('Data & AI', 'Information Technology'),
    ('QA & Testing', 'Information Technology'),
    ('DevOps & Cloud', 'Information Technology'),
    ('Banking', 'Finance & Banking'),
    ('Accounting & Audit', 'Finance & Banking'),
    ('Insurance', 'Finance & Banking'),
    ('Digital Marketing', 'Marketing & Sales'),
    ('Sales', 'Marketing & Sales'),
    ('Content & Communications', 'Marketing & Sales')
) as v(name, parent_name)
join industries p on p.name = v.parent_name
on conflict (name) do nothing;

-- Seed data: provinces (parent_id is null), then their areas linked by province name.
insert into locations (name) values
    ('Hà Nội'), ('Hồ Chí Minh'), ('Đà Nẵng'), ('Hải Phòng'), ('Cần Thơ'),
    ('Quảng Ninh'), ('Nghệ An'), ('Huế'), ('Khánh Hòa'), ('Lâm Đồng'), ('Đồng Nai')
on conflict do nothing;

insert into locations (name, parent_id)
select v.name, p.id
from (values
    ('Hoàng Mai', 'Hà Nội'), ('Cầu Giấy', 'Hà Nội'), ('Đống Đa', 'Hà Nội'),
    ('Ba Đình', 'Hà Nội'), ('Hoàn Kiếm', 'Hà Nội'), ('Hai Bà Trưng', 'Hà Nội'),
    ('Thanh Xuân', 'Hà Nội'), ('Tây Hồ', 'Hà Nội'), ('Long Biên', 'Hà Nội'),
    ('Hà Đông', 'Hà Nội'), ('Nam Từ Liêm', 'Hà Nội'), ('Bắc Từ Liêm', 'Hà Nội'),
    ('Quận 1', 'Hồ Chí Minh'), ('Quận 3', 'Hồ Chí Minh'), ('Quận 7', 'Hồ Chí Minh'),
    ('Bình Thạnh', 'Hồ Chí Minh'), ('Phú Nhuận', 'Hồ Chí Minh'), ('Tân Bình', 'Hồ Chí Minh'),
    ('Gò Vấp', 'Hồ Chí Minh'), ('Thủ Đức', 'Hồ Chí Minh'),
    ('Hải Châu', 'Đà Nẵng'), ('Thanh Khê', 'Đà Nẵng'), ('Sơn Trà', 'Đà Nẵng'),
    ('Ngũ Hành Sơn', 'Đà Nẵng'), ('Liên Chiểu', 'Đà Nẵng'), ('Cẩm Lệ', 'Đà Nẵng')
) as v(name, province_name)
join locations p on p.name = v.province_name and p.parent_id is null
on conflict do nothing;
