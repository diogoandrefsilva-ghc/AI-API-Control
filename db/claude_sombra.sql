-- ═══════════════════════════════════════════════════════════════════════
-- ia_uso — as primeiras chamadas ao Claude, que só ficaram na Garrafeira
-- ═══════════════════════════════════════════════════════════════════════
-- Corre DEPOIS do `calibracao.sql` (precisa da conta `anthropic` e dos
-- rácios do Claude). É IDEMPOTENTE.
--
-- A 23/10/2026, antes de o Claude entrar a sério na `vinho-info`, a
-- Garrafeira correu-o "à sombra": nas procuras do admin, o Haiku e o
-- Sonnet recebiam o mesmo pedido que o Gemini, e as respostas ficavam lado
-- a lado em `garrafeira.ia_comparacao`. Essas chamadas NÃO vieram para o
-- `ia_uso` — de propósito, porque a calibração ainda só tinha a conta da
-- Google e uma linha do Claude ia levar euros da Google.
--
-- Foram elas os 0,64 $ do primeiro dia da conta da Anthropic (a soma do
-- `custo_usd` delas dá 0,644 $). Sem elas aqui, a primeira janela dessa
-- conta tinha dólares e nenhuma chamada a quem os dar, e o Claude começava
-- a ser medido sem o teste que decidiu entre o Haiku e o Sonnet.
--
-- E AS DO MULTI ATÉ AO DEPLOY QUE AS GRAVA. A `vinho-info` das 18:44 UTC
-- desse dia pôs o Claude a sério (o multi-modelo do admin), mas continuou
-- a deixá-lo fora do `ia_uso` até a calibração saber de contas. As 19
-- chamadas do multi dessa tarde só ficaram na `ia_comparacao` (a do Claude
-- de cada procura, as duas fases à parte), e a conta da Anthropic pagou-as.
-- A `vinho-info` que as escreve no `ia_uso` entrou às 22:19:43 UTC (a
-- versão 74): daí para a frente é a própria function, e uma comparação
-- nova copiada daqui era a mesma chamada contada duas vezes.
--
-- Como a function escreve: `app` garrafeira, `funcao` vinho-info, a
-- `funcionalidade` que a comparação gravou, os tokens do `usage` (o
-- pensamento vem dentro da saída) e `detalhe.pesquisas` — o Claude paga
-- cada pesquisa, e a `ia_uso.pesquisas()` lê-a daqui. O estimado é o
-- `custo_usd` dela ao câmbio da conta, como a `vinho-info` o faz.
DO $$
BEGIN
  IF to_regclass('garrafeira.ia_comparacao') IS NULL THEN
    RAISE NOTICE 'Sem garrafeira.ia_comparacao: não há sombra para trazer.';
    RETURN;
  END IF;

  INSERT INTO ia_uso.registos (
    criado_em, app, funcao, funcionalidade, estado, modelo, pesquisa_web,
    tokens_entrada, tokens_saida, tokens_pensamento, tokens_total,
    custo_estimado_eur, duracao_ms, quem, erro, detalhe)
  SELECT c.criado_em, 'garrafeira', 'vinho-info', c.funcionalidade,
         CASE WHEN x ? 'erro' THEN 'erro' ELSE 'ok' END,
         x ->> 'modelo',
         COALESCE((x ->> 'pesquisas')::int, 0) > 0,
         (x ->> 'tokens_entrada')::int, (x ->> 'tokens_saida')::int, 0,
         (x ->> 'tokens_entrada')::int + (x ->> 'tokens_saida')::int,
         round((x ->> 'custo_usd')::numeric
               * (SELECT k.eur_por_unidade FROM ia_uso.contas k WHERE k.conta = 'anthropic'), 6),
         (x ->> 'ms')::int, c.quem, left(x ->> 'erro', 500),
         jsonb_build_object(
           'origem', 'ia_comparacao', 'ia_comparacao_id', c.id,
           'sombra', c.criado_em < '2026-10-23 18:44:23+00',
           'fase', c.fase, 'nome', c.nome, 'ano', c.ano, 'modelo', x ->> 'modelo',
           'pesquisas', COALESCE((x ->> 'pesquisas')::int, 0),
           'custo_usd', (x ->> 'custo_usd')::numeric, 'stop_reason', x ->> 'stop_reason')
    FROM garrafeira.ia_comparacao c
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c.claude) = 'array' THEN c.claude ELSE '[]'::jsonb END) x
   WHERE c.criado_em < '2026-10-23 22:19:43+00'
     AND x ->> 'modelo' LIKE 'claude%'
     AND NOT EXISTS (
       SELECT 1 FROM ia_uso.registos r
        WHERE r.detalhe ->> 'origem' = 'ia_comparacao'
          AND r.detalhe ->> 'ia_comparacao_id' = c.id::text
          AND r.modelo = x ->> 'modelo');
END $$;

-- ── Conferir depois de correr ──────────────────────────────────────────
-- select modelo, detalhe->>'sombra' as sombra, count(*),
--        sum((detalhe->>'custo_usd')::numeric) as usd
--   from ia_uso.registos where detalhe->>'origem' = 'ia_comparacao'
--  group by 1, 2;
-- A sombra: 11 Haiku + 11 Sonnet, 0,064 + 0,580 $. O multi: 19 Haiku,
-- 0,131 $ (2 em erro, a 0 tokens).
