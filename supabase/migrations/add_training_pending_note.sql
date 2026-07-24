-- Scratch field for an optional admin message to include in the next
-- schedule-change notification for this allocation (pause, resume, cancel,
-- or a plain reschedule). Not shown anywhere in the UI besides the edit
-- form itself; notify-schedule-change reads it and folds it into the
-- message it sends, then it's naturally overwritten next time.
alter table public.training_allocations add column if not exists pending_note text;
