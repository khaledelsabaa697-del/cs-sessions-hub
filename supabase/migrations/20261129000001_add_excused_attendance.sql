-- Add "excused" as a valid attendance status.
alter type public.attendance_status add value if not exists 'excused';
