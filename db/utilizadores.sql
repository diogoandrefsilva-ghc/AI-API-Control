-- ═══════════════════════════════════════════════════════════════════
-- ia_uso — o custo por UTILIZADOR (21/10/2026)
-- ═══════════════════════════════════════════════════════════════════
-- O dono: "uma visão de custos por utilizador. Utilizador vs App vs Data,
-- e um filtro que vá ajustando". Depende do `ia_uso.sql` e do
-- `calibracao.sql` (usa a `registos`, a `calc()` e a `sou_admin()`).
--
-- Devolve o CUBO já somado — uma linha por (dia, app, utilizador) — e não
-- as chamadas: o ecrã cruza as três dimensões como quiser e os filtros
-- respondem sem voltar à base. São umas centenas de linhas por 90 dias;
-- as chamadas eram milhares, e a `custos()` corta nas 1000.
--
-- O `quem` vem em minúsculas: as functions gravam o email como o recebem,
-- e "Ana@x" e "ana@x" eram duas pessoas. Um `quem` a NULL (chamadas de
-- antes de as functions o gravarem, ou sem sessão) fica NULL — o ecrã diz
-- "sem utilizador"; inventar-lhe um dono era mentir na coluna.
--
-- O DIA é o de Lisboa, não o UTC: uma chamada às 00:30 de Lisboa é desse
-- dia, não do anterior.
--
-- O euro é o mesmo de todo o painel: o MEDIDO (`calc()`) quando há
-- calibração, e a estimativa ao lado, sem nunca cair de um para o outro às
-- escondidas — quem decide qual mostra é o ecrã, pela bandeira `calibrado`.
-- As linhas `pedido` não contam (são o "ia começar" da `importar-vinhos`).

CREATE OR REPLACE FUNCTION ia_uso.custo_utilizadores(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
DECLARE
  v_desde timestamptz := now() - make_interval(days => GREATEST(COALESCE(p_dias, 30), 1));
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin vê os acessos à IA.';
  END IF;

  RETURN jsonb_build_object(
    'janelaDias', p_dias,
    'desde', v_desde,
    'calibrado', EXISTS (SELECT 1 FROM ia_uso.fatores() WHERE fator IS NOT NULL),
    'linhas', COALESCE((
      SELECT jsonb_agg(x ORDER BY x ->> 'dia' DESC, x ->> 'app', x ->> 'quem')
        FROM (
          SELECT jsonb_build_object(
                   'dia', (r.criado_em AT TIME ZONE 'Europe/Lisbon')::date,
                   'app', r.app,
                   'quem', NULLIF(lower(btrim(r.quem)), ''),
                   'usos', count(*),
                   'ok', count(*) FILTER (WHERE r.estado = 'ok'),
                   'erro', count(*) FILTER (WHERE r.estado = 'erro'),
                   'custoEur', sum(c.custo_eur),
                   'estimadoEur', COALESCE(sum(r.custo_estimado_eur), 0),
                   'provisorio', COALESCE(bool_or(c.provisorio), false)
                 ) AS x
            FROM ia_uso.registos r JOIN ia_uso.calc() c ON c.id = r.id
           WHERE r.estado <> 'pedido' AND r.criado_em >= v_desde
           GROUP BY (r.criado_em AT TIME ZONE 'Europe/Lisbon')::date, r.app,
                    NULLIF(lower(btrim(r.quem)), '')
        ) s
    ), '[]'::jsonb)
  );
END;
$$;

-- Nasce ABERTA (EXECUTE para PUBLIC): fecha-se ao anon à mão.
REVOKE ALL ON FUNCTION ia_uso.custo_utilizadores(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ia_uso.custo_utilizadores(integer) TO authenticated, service_role;

-- ── Conferir depois de correr ──────────────────────────────────────────
-- select has_function_privilege('anon', 'ia_uso.custo_utilizadores(integer)', 'EXECUTE');  -- false
