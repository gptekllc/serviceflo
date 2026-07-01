UPDATE storage.buckets
SET
  file_size_limit = 125829120,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
WHERE id = 'program-images';
