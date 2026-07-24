alter table public.training_allocations add column if not exists pause_start date;
alter table public.training_allocations add column if not exists pause_end date;
