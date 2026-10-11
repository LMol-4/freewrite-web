-- Note bodies are plain text; cap uploads so the bucket can't serve as general file storage.
update storage.buckets set file_size_limit = 5242880 where id = 'notes';
