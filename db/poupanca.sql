-- ═══════════════════════════════════════════════════════════════════════
-- ia_uso.poupanca_catalogo — o que o catálogo de vinhos poupou
-- ═══════════════════════════════════════════════════════════════════════
-- Até 23/09/2026 isto era o separador "Resumo" da WineCatalog. Saiu de lá
-- porque é uma pergunta de CUSTO, e as perguntas de custo são desta app —
-- duas apps a responder a "quanto gastei?" com números diferentes era o
-- erro de sempre.
--
-- PORQUE NÃO SAI DA `ia_uso.registos`. É a única análise que o `ia_uso`
-- não consegue fazer sozinho: a `registos` tem uma linha por chamada AO
-- GEMINI, e um pedido servido pelo catálogo é, por definição, um pedido
-- que NÃO chamou o Gemini — não deixa rasto nenhum aqui. Esse rasto está
-- no `sync_log` de cada app, e a vista `winecatalog.consumo` (fonte de
-- verdade: `WineCatalog/db/catalogo.sql`) já os junta na mesma forma. Esta
-- função só agrega essa vista; não copia a tradução de cada `sync_log` —
-- duas cópias dela divergiam no dia em que uma app mudasse o que grava.
--
-- AS UNIDADES NÃO SE SOMAM: a `vinho-info` conta CAMPOS, a `sugerir-vinho`
-- NOTAS, a `verificar-vinhos` VINHOS. Cada linha leva a sua. O que
-- atravessa as três e se pode somar é o PEDIDO.
--
-- A POUPANÇA EM EUROS é uma estimativa EM CIMA de uma estimativa: um
-- pedido servido pelo catálogo não deixou registo do que TERIA custado,
-- e usa-se o `custo_estimado_eur` MÉDIO dos pedidos da mesma ação que
-- foram mesmo à IA — a constante escrita à mão, não o euro medido. O
-- número que é FACTO é a contagem de pedidos servidos sem IA nenhuma.
--
-- Depende do `ia_uso.sql` (a `sou_admin()`) e da vista
-- `winecatalog.consumo`. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ia_uso.poupanca_catalogo(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
DECLARE
  v_desde timestamptz := CASE WHEN COALESCE(p_dias, 0) > 0
                              THEN now() - make_interval(days => p_dias) END;
  v_res jsonb;
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin vê os acessos à IA.';
  END IF;

  -- Nunca devolve o `quem` da vista: quanto é que o catálogo poupou não
  -- precisa de dizer quem andou a usar o quê.
  WITH base AS (
    SELECT * FROM winecatalog.consumo
     WHERE estado <> 'pedido'
       AND (v_desde IS NULL OR criado_em >= v_desde)
  ), medias AS (
    SELECT app, acao, AVG(custo_eur) AS custo_medio
      FROM base WHERE NOT so_catalogo AND custo_eur > 0
     GROUP BY app, acao
  ), por_acao AS (
    SELECT b.app, b.acao, b.unidade,
           count(*)                                    AS pedidos,
           count(*) FILTER (WHERE b.so_catalogo)        AS pedidos_catalogo,
           sum(b.itens_catalogo)                        AS itens_catalogo,
           sum(b.itens_ia)                              AS itens_ia,
           COALESCE(count(*) FILTER (WHERE b.so_catalogo) * max(m.custo_medio), 0) AS poupado
      FROM base b
      LEFT JOIN medias m ON m.app = b.app AND m.acao = b.acao
     GROUP BY b.app, b.acao, b.unidade
  )
  SELECT jsonb_build_object(
    'desde', v_desde,
    'total', jsonb_build_object(
      'pedidos',         COALESCE((SELECT sum(pedidos)          FROM por_acao), 0),
      'pedidosCatalogo', COALESCE((SELECT sum(pedidos_catalogo) FROM por_acao), 0),
      'poupadoEstimado', COALESCE((SELECT sum(poupado)          FROM por_acao), 0)
    ),
    'porAcao', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'app', app, 'acao', acao, 'unidade', unidade,
               'pedidos', pedidos, 'pedidosCatalogo', pedidos_catalogo,
               'itensCatalogo', itens_catalogo, 'itensIA', itens_ia,
               'poupadoEstimado', poupado
             ) ORDER BY app, acao) FROM por_acao), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

-- Nasce aberta (PUBLIC + o `ALTER DEFAULT PRIVILEGES` do `ia_uso.sql`).
-- Fecha-se ao anon; o portão de dentro é que decide quem é admin.
REVOKE ALL ON FUNCTION ia_uso.poupanca_catalogo(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ia_uso.poupanca_catalogo(integer) TO authenticated, service_role;
