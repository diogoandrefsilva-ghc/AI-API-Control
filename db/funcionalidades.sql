-- ═══════════════════════════════════════════════════════════════════════
-- ia_uso — FUNCIONALIDADES: quanto custa cada coisa que se faz em cada app
-- ═══════════════════════════════════════════════════════════════════════
-- 11/10/2026, o dono: "interessa-me entender, dentro de cada app, quais são
-- as features mais caras, para facilmente identificar que feature devo
-- tornar premium".
--
-- A `funcao` (a Edge Function) não chega para isto: a `vinho-info` faz SEIS
-- coisas diferentes — perguntar à IA, ler sites concretos, ler um documento,
-- sugerir links, a atualização massiva, o vinho de uma carta — e a
-- `fatura-ocr` faz quatro. Somadas, a média diz "uma chamada da vinho-info
-- custa X", que é a média de coisas que não têm nada a ver umas com as
-- outras. A pergunta "isto devia ser premium?" faz-se à FUNCIONALIDADE.
--
-- DUAS FONTES, pela ordem do `ia_uso.grounding()` — o que a CHAMADA disser
-- ganha à regra:
--   1. a coluna `registos.funcionalidade`, que cada Edge Function passa a
--      gravar (é o contrato: ver "O contrato do registo" no README);
--   2. para o HISTÓRICO, que já está escrito e não se redeploya, uma regra
--      por função que a deduz do `detalhe` (`ia_uso.funcionalidade()`).
--
-- Depende do `ia_uso.sql` e do `calibracao.sql` (usa a `calc()` e a
-- `fatores()`). É IDEMPOTENTE: corre as vezes que forem precisas.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE ia_uso.registos ADD COLUMN IF NOT EXISTS funcionalidade text;

-- ── O nome legível de cada funcionalidade ─────────────────────────────
-- A chave é curta e estável (é o que as functions gravam); o nome é o que
-- o painel mostra, e muda-se aqui sem deploy nenhum. Uma chave sem linha
-- aqui aparece com a própria chave — feia, mas à vista.
CREATE TABLE IF NOT EXISTS ia_uso.funcionalidades (
  funcao text NOT NULL,
  chave  text NOT NULL,
  nome   text NOT NULL,
  PRIMARY KEY (funcao, chave)
);

INSERT INTO ia_uso.funcionalidades (funcao, chave, nome) VALUES
  ('vinho-info',            'procurar',           'Procurar informação · perguntar à IA'),
  ('vinho-info',            'sites',              'Procurar informação · em sites concretos'),
  ('vinho-info',            'documento',          'Procurar informação · num documento'),
  ('vinho-info',            'links',              'Sugere-me sites (Serper)'),
  ('vinho-info',            'lote',               'Atualização massiva'),
  ('vinho-info',            'carta',              'Sugestões · procurar vinho da carta'),
  ('importar-vinhos',       'importar',           'Importar de imagens ou documentos'),
  ('garrafeira-carta',      'ler',                'Sugestões · ler a carta'),
  ('garrafeira-carta',      'recomendar',         'Sugestões · sugerir da carta'),
  ('garrafeira-carta',      'sugerir-garrafeira', 'Sugestões · da minha garrafeira'),
  ('garrafeira-carta',      'sugerir-catalogo',   'Sugestões · do Catálogo'),
  ('garrafeira-produtores', 'analisar',           'Backoffice · produtores com IA'),
  ('garrafeira-colheitas',  'analisar',           'Backoffice · colheitas que não batem'),
  ('catalogo-info',         'procurar',           'Procurar ficha do vinho'),
  ('catalogo-foto',         'foto',               'Ler fotografia do rótulo'),
  ('sugerir-vinho',         'sugerir',            'Sugerir vinho da carta'),
  ('verificar-vinhos',      'verificar',          'Pesquisa a sério'),
  ('prendas-vinho',         'prendas',            'Sugerir vinho para prenda'),
  ('fatura-restaurante',    'fatura',             'Ler a fatura do restaurante'),
  ('fatura-ocr',            'fatura',             'Importar fatura'),
  ('fatura-ocr',            'lista',              'Foto → lista de compras'),
  ('fatura-ocr',            'artigos',            'Classificar artigos'),
  ('fatura-ocr',            'normalizar',         'Normalizar nomes'),
  ('calendario-sporting',   'calendario',         'Sincronizar o calendário'),
  ('despesa-ia',            'despesa',            'Despesa com IA'),
  ('despesa-ia',            'grupo',              'Várias despesas de uma vez'),
  ('despesa-ia',            'alterar',            'Alterar despesas registadas')
ON CONFLICT (funcao, chave) DO UPDATE SET nome = EXCLUDED.nome;

-- ── As funções que DEVIAM estar a escrever ────────────────────────────
-- A `ia_uso.funcoes` já era o mapa da pesquisa Google; passa a dizer
-- também DE QUE APP é cada função. É isso que deixa o painel dizer "esta
-- nunca registou nada" — um silêncio que, sem lista do que se espera, não
-- se distingue de uma app que ninguém usou.
-- (As cinco funções que faltavam nessa tabela entram no `calibracao.sql`,
-- que é a casa dela.)
ALTER TABLE ia_uso.funcoes ADD COLUMN IF NOT EXISTS app text;

UPDATE ia_uso.funcoes f SET app = v.app
  FROM (VALUES
    ('catalogo-info', 'winecatalog'), ('catalogo-foto', 'winecatalog'),
    ('vinho-info', 'garrafeira'), ('importar-vinhos', 'garrafeira'),
    ('garrafeira-carta', 'garrafeira'), ('garrafeira-produtores', 'garrafeira'),
    ('garrafeira-colheitas', 'garrafeira'),
    ('sugerir-vinho', 'wineselection'), ('verificar-vinhos', 'wineselection'),
    ('prendas-vinho', 'anniversarygifts'),
    ('fatura-restaurante', 'splitbill'), ('fatura-ocr', 'festasbv'),
    -- serve o Goals e o SplitBill; grava a app de quem chamou
    ('calendario-sporting', 'goals'),
    ('despesa-ia', 'splitwisely')
  ) AS v(funcao, app)
 WHERE f.funcao = v.funcao AND f.app IS DISTINCT FROM v.app;

-- ── A funcionalidade de uma chamada ───────────────────────────────────
-- UMA SÓ DEFINIÇÃO, como o `peso()`. O que a chamada gravou ganha sempre;
-- o resto é a regra do histórico, função a função, a partir das chaves que
-- cada uma já punha no `detalhe` (vistas na base a 11/10/2026).
--
-- `entrada` é o pedido recusado ANTES de se saber o que era (sem sessão,
-- sem plano, o corpo ilegível): não custa nada e não é de nenhuma
-- funcionalidade, mas os erros dele têm de se ver em algum lado.
CREATE OR REPLACE FUNCTION ia_uso.funcionalidade(r ia_uso.registos)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  SELECT COALESCE(
    NULLIF(r.funcionalidade, ''),
    NULLIF(r.detalhe ->> 'funcionalidade', ''),
    CASE
      WHEN r.detalhe ->> 'passo' IN ('autorizacao', 'plano', 'excecao_inicial', 'entrada')
        THEN 'entrada'
      WHEN r.funcao = 'vinho-info' THEN CASE
        WHEN r.detalhe ->> 'passo' LIKE 'links%' THEN 'links'
        WHEN r.detalhe ->> 'passo' LIKE 'lote%'
          OR r.detalhe ->> 'modo' = 'catalogo-lote'
          OR r.detalhe ->> 'nome' LIKE 'lote de %'
          OR jsonb_typeof(r.detalhe -> 'vinhos') = 'number' THEN 'lote'
        WHEN r.detalhe ->> 'da_carta' = 'true' THEN 'carta'
        WHEN r.detalhe ? 'imagem_doc' OR r.detalhe ? 'documentos'
          OR r.detalhe ->> 'passo' = 'documentos' THEN 'documento'
        WHEN r.detalhe ->> 'so_sites' = 'true'
          OR r.detalhe ->> 'passo' = 'so_sites_vazio'
          OR r.detalhe ->> 'pesquisa' = 'paginas' THEN 'sites'
        ELSE 'procurar' END
      WHEN r.funcao = 'garrafeira-carta' THEN CASE r.detalhe ->> 'passo'
        WHEN 'sugerir'    THEN 'sugerir-' || COALESCE(r.detalhe ->> 'modo', 'garrafeira')
        WHEN 'recomendar' THEN 'recomendar'
        ELSE 'ler' END
      WHEN r.funcao IN ('fatura-ocr', 'despesa-ia') THEN COALESCE(
        r.detalhe ->> 'modo', CASE r.funcao WHEN 'fatura-ocr' THEN 'fatura' ELSE 'despesa' END)
      WHEN r.funcao IN ('garrafeira-produtores', 'garrafeira-colheitas') THEN 'analisar'
      WHEN r.funcao = 'importar-vinhos'     THEN 'importar'
      WHEN r.funcao = 'fatura-restaurante'  THEN 'fatura'
      WHEN r.funcao = 'calendario-sporting' THEN 'calendario'
      WHEN r.funcao = 'catalogo-info'       THEN 'procurar'
      WHEN r.funcao = 'catalogo-foto'       THEN 'foto'
      WHEN r.funcao = 'sugerir-vinho'       THEN 'sugerir'
      WHEN r.funcao = 'verificar-vinhos'    THEN 'verificar'
      WHEN r.funcao = 'prendas-vinho'       THEN 'prendas'
      ELSE r.funcao
    END
  );
$$;

-- ── O resumo por app e por funcionalidade ─────────────────────────────
-- O que o ecrã do Resumo pede. Tudo na JANELA escolhida (7/30/90 dias) —
-- o "Por app" de antes somava desde sempre, ao lado de um seletor de
-- janela que não lhe mexia, e lia-se como se fosse do mês.
--
-- O CUSTO MÉDIO é por uso CONSEGUIDO: o total (erros pagos incluídos —
-- o 200 vazio paga-se) a dividir pelos que correram bem. É o custo real
-- de conseguir uma resposta daquela funcionalidade, que é o número que
-- decide se ela é premium. Uma média que só olhasse aos que correram bem
-- escondia exatamente as avarias que mais custam.
--
-- As linhas `pedido` não contam em sítio nenhum: são o "ia começar" da
-- `importar-vinhos`, não uma chamada — contadas, metiam a importação a
-- custar metade do que custa.
CREATE OR REPLACE FUNCTION ia_uso.resumo_apps(p_dias integer DEFAULT 30)
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

  RETURN (
    -- A linha é pesada e classificada ANTES de entrar no CTE — com colunas
    -- a mais já não é um `ia_uso.registos` (a pedra da `winecatalog.listar`).
    WITH m AS (
      SELECT r.app, r.funcao, r.estado, r.criado_em,
             r.tokens_entrada, r.tokens_saida, r.tokens_pensamento,
             r.custo_estimado_eur,
             ia_uso.funcionalidade(r) AS func,
             ia_uso.grounding(r)      AS com_pesquisa,
             (COALESCE(r.detalhe ->> 'passo', '') = 'gemini_vazio'
               OR (r.estado = 'ok' AND COALESCE(r.tokens_saida, 0) = 0
                   AND COALESCE(r.tokens_entrada, 0) > 0)) AS vazio,
             -- As consultas ao Serper pagam-se a outro fornecedor e não entram
             -- no saldo Google: não há euro para lhes dar, mas CONTAM-SE.
             CASE WHEN jsonb_typeof(r.detalhe -> 'serper_consultas') = 'number'
                  THEN (r.detalhe ->> 'serper_consultas')::numeric ELSE 0 END AS serper,
             c.custo_eur, c.provisorio
        FROM ia_uso.registos r JOIN ia_uso.calc() c ON c.id = r.id
       WHERE r.estado <> 'pedido'
    ), j AS (
      SELECT * FROM m WHERE m.criado_em >= v_desde
    ), fx AS (
      SELECT j.app, j.funcao, j.func,
        jsonb_build_object(
          'funcao', j.funcao,
          'chave', j.func,
          'nome', COALESCE(
            (SELECT f.nome FROM ia_uso.funcionalidades f
              WHERE f.funcao = j.funcao AND f.chave = j.func),
            CASE j.func WHEN 'entrada' THEN 'Recusado à entrada' ELSE j.func END),
          'usos', count(*),
          'ok', count(*) FILTER (WHERE j.estado = 'ok'),
          'erro', count(*) FILTER (WHERE j.estado = 'erro'),
          'vazios', count(*) FILTER (WHERE j.vazio),
          'pesquisas', count(*) FILTER (WHERE j.com_pesquisa),
          'serper', sum(j.serper),
          'custoEur', sum(j.custo_eur),
          'estimadoEur', COALESCE(sum(j.custo_estimado_eur), 0),
          'medioEur', sum(j.custo_eur) / NULLIF(count(*) FILTER (WHERE j.estado = 'ok'), 0),
          'medioEstEur', COALESCE(sum(j.custo_estimado_eur), 0)
                         / NULLIF(count(*) FILTER (WHERE j.estado = 'ok'), 0),
          'maxEur', max(j.custo_eur),
          'tokensMedios', round(avg(COALESCE(j.tokens_entrada, 0) + COALESCE(j.tokens_saida, 0)
                                    + COALESCE(j.tokens_pensamento, 0))
                                FILTER (WHERE j.estado = 'ok')),
          'provisorio', bool_or(j.provisorio),
          'ultimaChamada', max(j.criado_em)
        ) AS x
        FROM j GROUP BY j.app, j.funcao, j.func
    ), ax AS (
      -- As apps saem de TODO o histórico, e não só da janela: uma app que
      -- não chamou nada nestes dias tem de aparecer na mesma, a zero e com
      -- a última chamada — é esse o sinal de vida.
      SELECT m.app,
        jsonb_build_object(
          'app', m.app,
          'usos', count(*) FILTER (WHERE m.criado_em >= v_desde),
          'ok', count(*) FILTER (WHERE m.criado_em >= v_desde AND m.estado = 'ok'),
          'erro', count(*) FILTER (WHERE m.criado_em >= v_desde AND m.estado = 'erro'),
          'vazios', count(*) FILTER (WHERE m.criado_em >= v_desde AND m.vazio),
          'serper', COALESCE(sum(m.serper) FILTER (WHERE m.criado_em >= v_desde), 0),
          'custoEur', sum(m.custo_eur) FILTER (WHERE m.criado_em >= v_desde),
          'estimadoEur', COALESCE(sum(m.custo_estimado_eur) FILTER (WHERE m.criado_em >= v_desde), 0),
          'provisorio', COALESCE(bool_or(m.provisorio) FILTER (WHERE m.criado_em >= v_desde), false),
          'ultimaChamada', max(m.criado_em),
          'funcionalidades', COALESCE((
            SELECT jsonb_agg(fx.x ORDER BY COALESCE((fx.x ->> 'custoEur')::numeric,
                                                    (fx.x ->> 'estimadoEur')::numeric) DESC NULLS LAST,
                                           (fx.x ->> 'usos')::int DESC)
              FROM fx WHERE fx.app = m.app
          ), '[]'::jsonb)
        ) AS x
        FROM m GROUP BY m.app
    )
    SELECT jsonb_build_object(
      'janelaDias', p_dias,
      'desde', v_desde,
      'calibrado', EXISTS (SELECT 1 FROM ia_uso.fatores() WHERE fator IS NOT NULL),
      'apps', COALESCE((
        SELECT jsonb_agg(ax.x ORDER BY COALESCE((ax.x ->> 'custoEur')::numeric, 0) DESC,
                                       (ax.x ->> 'estimadoEur')::numeric DESC,
                                       ax.x ->> 'ultimaChamada' DESC)
          FROM ax
      ), '[]'::jsonb),
      -- As que deviam escrever e NUNCA escreveram. Pode ser só falta de
      -- uso — ou o deploy sem a `registarIaUso()`. Sem esta lista, as duas
      -- coisas eram o mesmo silêncio.
      'semRegisto', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('funcao', f.funcao, 'app', f.app) ORDER BY f.app, f.funcao)
          FROM ia_uso.funcoes f
         WHERE NOT EXISTS (SELECT 1 FROM ia_uso.registos r WHERE r.funcao = f.funcao)
      ), '[]'::jsonb)
    )
  );
END;
$$;

-- ── Permissões ─────────────────────────────────────────────────────────
-- A interna nasce aberta (EXECUTE para PUBLIC, mais o DEFAULT PRIVILEGES do
-- `ia_uso.sql`): fecha-se à mão, como as do `calibracao.sql`.
ALTER TABLE ia_uso.funcionalidades ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON ia_uso.funcionalidades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ia_uso.funcionalidades TO service_role;

DROP POLICY IF EXISTS funcionalidades_admin_le ON ia_uso.funcionalidades;
CREATE POLICY funcionalidades_admin_le ON ia_uso.funcionalidades
  FOR SELECT TO authenticated USING (ia_uso.sou_admin());

REVOKE ALL ON FUNCTION ia_uso.funcionalidade(ia_uso.registos) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ia_uso.funcionalidade(ia_uso.registos) TO service_role;

REVOKE ALL ON FUNCTION ia_uso.resumo_apps(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ia_uso.resumo_apps(integer) TO authenticated, service_role;

-- ── Conferir depois de correr ──────────────────────────────────────────
-- select ia_uso.funcionalidade(r), count(*) from ia_uso.registos r group by 1 order by 2 desc;
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'ia_uso';                                       -- tudo false
