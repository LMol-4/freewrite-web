insert into storage.buckets (id, name, public)
values ('notes', 'notes', false)
on conflict (id) do nothing;

create policy notes_read on storage.objects for select
  using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy notes_insert on storage.objects for insert
  with check (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy notes_update on storage.objects for update
  using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy notes_delete on storage.objects for delete
  using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
