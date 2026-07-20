-- =============================================================================
-- Le statut d'un bloc découle de celui de ses questions
-- =============================================================================
-- §2.2 : « un bloc est tiré entier ou pas du tout ». Un bloc n'est donc jouable
-- que si toutes ses questions le sont.
--
-- Jusqu'ici ce statut était maintenu à la main par le seed, l'import et la file
-- de relecture — mais pas par la dépublication automatique sur signalement
-- (§6.1). Résultat : une question signalée passait en « depubliee » tandis que
-- son bloc restait marqué « publie ». Le tirage n'était pas trompé, il vérifie
-- les questions une à une, mais la donnée était fausse et le back-office
-- affichait un bloc publié qui ne l'était plus.
--
-- On dérive donc le statut du bloc, plutôt que de compter sur chaque chemin
-- d'écriture pour y penser.

create or replace function public.synchroniser_statut_bloc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cible uuid;
  toutes_publiees boolean;
begin
  cible := coalesce(new.bloc_id, old.bloc_id);
  if cible is null then
    return null;
  end if;

  select count(*) > 0 and bool_and(q.statut = 'publie')
    into toutes_publiees
    from public.questions q
   where q.bloc_id = cible;

  update public.blocs
     set statut = (case when toutes_publiees then 'publie' else 'brouillon' end)::public.contenu_statut
   where id = cible
     -- Un bloc archivé l'est par décision explicite : on n'y touche pas.
     and statut <> 'archive'
     and statut <> (case when toutes_publiees then 'publie' else 'brouillon' end)::public.contenu_statut;

  return null;
end;
$$;

create trigger questions_synchronisent_leur_bloc
  after insert or delete or update of statut, bloc_id
  on public.questions
  for each row execute function public.synchroniser_statut_bloc();

-- Remise en cohérence de l'existant.
update public.blocs b
   set statut = (case
     when exists (select 1 from public.questions q where q.bloc_id = b.id)
      and not exists (
        select 1 from public.questions q
         where q.bloc_id = b.id and q.statut <> 'publie'
      )
     then 'publie'
     else 'brouillon'
   end)::public.contenu_statut
 where b.statut <> 'archive';
