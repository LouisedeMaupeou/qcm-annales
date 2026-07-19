-- =============================================================================
-- Stockage des PDF sources d'annales (§6.1 : « PDF archivés et rattachés »)
-- =============================================================================

-- Bucket privé : les sujets d'annales sont des œuvres de tiers dont les droits
-- de reproduction ne sont pas encore sécurisés (§8.9). Aucune URL publique ne
-- doit exister ; le back-office sert les fichiers par URL signée à durée
-- limitée.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'annales',
  'annales',
  false,
  52428800,                       -- 50 Mo
  array['application/pdf']
)
on conflict (id) do nothing;

-- Seul le personnel du back-office manipule ces fichiers. Les élèves n'y ont
-- aucun accès : ils ne voient que les questions transcrites.
create policy annales_staff_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'annales' and public.is_staff());

create policy annales_staff_ecriture on storage.objects
  for insert to authenticated
  with check (bucket_id = 'annales' and public.is_staff());

create policy annales_staff_maj on storage.objects
  for update to authenticated
  using (bucket_id = 'annales' and public.is_staff())
  with check (bucket_id = 'annales' and public.is_staff());

create policy annales_staff_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'annales' and public.is_staff());
