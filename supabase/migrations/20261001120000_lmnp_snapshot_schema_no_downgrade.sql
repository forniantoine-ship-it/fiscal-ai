-- R2B.2a — protection serveur anti-régression de version des snapshots LMNP.
--
-- Un workspace scopé multi-bien est stocké en schema_version 2 ; un dossier mono reste en 1. Un ancien client (v1)
-- ne doit jamais pouvoir réécrire un snapshot v2 avec des champs propres au bien à plat. Le garde client
-- (lecture puis écriture) n'est pas atomique : ce trigger est la protection robuste, côté serveur et atomique.
--
-- Autorisé : v1 → v1, v1 → v2, v2 → v2. Refusé : toute baisse de version (v2 → v1).
-- Aucune autre politique, colonne ou règle métier n'est modifiée.

create or replace function public.lmnp_prevent_snapshot_schema_downgrade()
returns trigger
language plpgsql
as $$
begin
  if new.schema_version < old.schema_version then
    raise exception 'lmnp_snapshot_schema_downgrade: schema_version % cannot replace %',
      new.schema_version, old.schema_version;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lmnp_prevent_snapshot_schema_downgrade on public.lmnp_workspace_snapshots;
create trigger trg_lmnp_prevent_snapshot_schema_downgrade
  before update on public.lmnp_workspace_snapshots
  for each row
  execute function public.lmnp_prevent_snapshot_schema_downgrade();
