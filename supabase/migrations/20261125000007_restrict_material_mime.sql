-- ============================================================================
-- Restrict session-materials bucket MIME types to supported kinds.
-- ============================================================================
update storage.buckets
set allowed_mime_types = array[
  'text/plain',
  'text/x-c++src',
  'text/x-c',
  'text/x-python',
  'text/markdown',
  'application/json',
  'application/x-ipynb+json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'application/octet-stream'
]
where id = 'session-materials';

notify pgrst, 'reload schema';
