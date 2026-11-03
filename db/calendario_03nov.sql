-- ═══════════════════════════════════════════════════════════════════════
-- ia_uso — as chamadas do calendário de 02-03/11/2026 que não ficaram aqui
-- ═══════════════════════════════════════════════════════════════════════
-- Corre DEPOIS do `calibracao.sql` e do `funcionalidades.sql`. É
-- IDEMPOTENTE (cada linha trazida leva no `detalhe` de onde veio, e não se
-- traz duas vezes).
--
-- O QUE ACONTECEU. Entre a leitura de 02/11 08:49 (2,34 €) e a de 03/11
-- 11:26 (11,21 €, com 20 € carregados pelo meio) a conta da Google gastou
-- 11,13 €. Foi quase tudo o botão do calendário do Goals (Edge Function
-- `calendario-sporting`, v24-v26) e um diagnóstico dele: o
-- `gemini-flash-latest` com pesquisa Google e o pensamento a 4096, a pensar
-- 3-12 mil tokens e a ler dezenas de fontes por chamada. Mas no `ia_uso`
-- essas chamadas quase não ficaram:
--   · os três toques no botão (02/11 21:07, 03/11 08:46 e 09:22) deixaram
--     UMA linha de resumo cada ('sem-resposta', sem modelo nem tokens), quando
--     foram 10 chamadas, todas cortadas por tempo do nosso lado — e uma
--     chamada cortada paga-se na mesma (a Google acaba-a do lado dela);
--   · o diagnóstico (`calendario-diag`, 03/11 09:15-09:27) fez 31 chamadas
--     (23 pagas, 8 já recusadas por falta de crédito) e só escrevia no
--     `goals.sync_log`.
-- Sem elas, a janela tinha 11,13 € e 62 chamadas da Garrafeira a quem os
-- dar: o fator foi 434× (o normal anda nos 1,5-3,5×) e a Garrafeira ficou
-- com o gasto todo.
--
-- DE ONDE VÊM:
--   · o diagnóstico, do `goals.sync_log` (`app = 'diag'`): modelo, tokens do
--     `usage`, fontes (`chunks`), duração e estado de cada chamada;
--   · os toques no botão, dos logs da função (Supabase › Edge Functions ›
--     Logs, "tentativa presa (sem resposta)"): que modelo, que variante, e
--     quando começou e acabou cada uma. As durações são as desses logs.
-- Escreve-se como a `calendario-sporting` de hoje escreve (o contrato do
-- `db/README.md`): uma linha por chamada, `detalhe.pesquisa` em booleano, a
-- cortada com `cortada: true` e os tokens a NULL (não se sabem), os 402 e os
-- 404 com `pesquisa: false` (a Google recusa-os à porta e não os cobra). O
-- estimado é o que a v26 escrevia (0,02 € por chamada paga).

-- ── As funções e a funcionalidade do diagnóstico ───────────────────────
INSERT INTO ia_uso.funcoes (funcao, grounding, nota, app) VALUES
  ('calendario-diag', true,
   'diagnóstico temporário do calendário (03/11/2026, já desativado); as chamadas vieram do goals.sync_log pelo calendario_03nov.sql',
   'goals')
ON CONFLICT (funcao) DO UPDATE SET nota = EXCLUDED.nota, app = EXCLUDED.app;

INSERT INTO ia_uso.funcionalidades (funcao, chave, nome) VALUES
  ('calendario-diag', 'diagnostico', 'Diagnóstico do calendário')
ON CONFLICT (funcao, chave) DO UPDATE SET nome = EXCLUDED.nome;

-- ── 1. O diagnóstico: uma linha por chamada do goals.sync_log ──────────
INSERT INTO ia_uso.registos (
  criado_em, app, funcao, funcionalidade, estado, modelo, pesquisa_web,
  tokens_entrada, tokens_saida, tokens_pensamento, tokens_total,
  custo_estimado_eur, duracao_ms, quem, erro, detalhe)
SELECT s.criado_em, 'goals', 'calendario-diag', 'diagnostico',
       CASE WHEN v.status = 200 THEN 'ok' ELSE 'erro' END,
       s.detalhe ->> 'model',
       v.pesquisa,
       (s.detalhe -> 'usage' ->> 'promptTokenCount')::int,
       (s.detalhe -> 'usage' ->> 'candidatesTokenCount')::int,
       COALESCE((s.detalhe -> 'usage' ->> 'thoughtsTokenCount')::int,
                CASE WHEN s.detalhe ? 'usage' AND jsonb_typeof(s.detalhe -> 'usage') = 'object' THEN 0 END),
       (s.detalhe -> 'usage' ->> 'totalTokenCount')::int,
       CASE WHEN v.status = 402 THEN 0 ELSE 0.02 END,
       (s.detalhe ->> 'ms')::int,
       'diogo.andre.f.silva@gmail.com',
       CASE WHEN v.status = 402 THEN 'sem_credito'
            WHEN v.status <> 200 THEN 'cortada' END,
       jsonb_strip_nulls(jsonb_build_object(
         'origem', 'goals.sync_log', 'sync_log_id', s.id,
         'passo', CASE WHEN v.status = 402 THEN 'sem_credito'
                       WHEN v.status <> 200 THEN 'cortada' END,
         'nome', s.detalhe ->> 'nome', 'lote', s.detalhe ->> 'lote',
         'bloco', s.detalhe ->> 'bloco', 'modelo', s.detalhe ->> 'model',
         'pensar', s.detalhe -> 'pensar', 'pesquisa', v.pesquisa,
         'fontes_n', (s.detalhe ->> 'chunks')::int,
         'cortada', CASE WHEN v.status NOT IN (200, 402) THEN true END,
         'jogos', (s.detalhe ->> 'jogos')::int,
         'usageMetadata', s.detalhe -> 'usage',
         'ms', (s.detalhe ->> 'ms')::int,
         'reconstruida', '03/11/2026, do goals.sync_log'))
  FROM goals.sync_log s
  CROSS JOIN LATERAL (
    SELECT COALESCE((s.detalhe ->> 'status')::int, 0) AS status,
           -- pesquisou se trouxe fontes; a cortada (status 0) pagou-se com a
           -- pesquisa; a recusada por falta de crédito não pesquisou nada
           CASE WHEN COALESCE((s.detalhe ->> 'status')::int, 0) = 402 THEN false
                WHEN COALESCE((s.detalhe ->> 'status')::int, 0) = 0 THEN true
                ELSE COALESCE((s.detalhe ->> 'chunks')::int, 0) > 0 END AS pesquisa
  ) v
 WHERE s.app = 'diag' AND s.acao = 'calendario'
   AND s.criado_em >= '2026-11-03 09:00+00' AND s.criado_em < '2026-11-03 09:40+00'
   AND NOT EXISTS (
     SELECT 1 FROM ia_uso.registos r
      WHERE r.detalhe ->> 'origem' = 'goals.sync_log'
        AND r.detalhe ->> 'sync_log_id' = s.id::text);

-- ── 2. Os três toques no botão: as chamadas que os logs da função mostram ──
-- Cada toque deixou uma linha de RESUMO ('sem-resposta'), que o contrato já
-- não quer. Em vez de a apagar, passa a ser a PRIMEIRA chamada desse toque
-- (o gemini-flash-latest com pesquisa, presa ~96 s); as outras entram ao lado.
UPDATE ia_uso.registos r SET
  modelo = 'gemini-flash-latest',
  pesquisa_web = true,
  funcionalidade = 'calendario',
  erro = 'cortada',
  duracao_ms = 96000,
  custo_estimado_eur = 0.02,
  detalhe = r.detalhe || jsonb_build_object(
    'passo', 'cortada', 'era', 'sem-resposta', 'modelo', 'gemini-flash-latest',
    'variante', 'pesquisa', 'pesquisa', true, 'cortada', true, 'ms', 96000,
    'origem', 'function_logs', 'reconstruida', '03/11/2026, dos logs da função')
 WHERE r.funcao = 'calendario-sporting'
   AND r.detalhe ->> 'passo' = 'sem-resposta'
   AND r.modelo IS NULL
   AND r.criado_em >= '2026-11-02 21:00+00' AND r.criado_em < '2026-11-03 09:30+00';

INSERT INTO ia_uso.registos (
  criado_em, app, funcao, funcionalidade, estado, modelo, pesquisa_web,
  tokens_entrada, tokens_saida, tokens_pensamento, tokens_total,
  custo_estimado_eur, duracao_ms, quem, erro, detalhe)
SELECT c.fim, 'goals', 'calendario-sporting', 'calendario', 'erro', c.modelo,
       c.pesquisa, NULL, NULL, NULL, NULL,
       CASE WHEN c.pesquisa THEN 0.02 ELSE 0 END,
       c.ms, 'diogo.andre.f.silva@gmail.com',
       CASE WHEN c.pesquisa THEN 'cortada' ELSE 'gemini 404' END,
       jsonb_strip_nulls(jsonb_build_object(
         'origem', 'function_logs', 'chave', c.chave, 'clique', c.clique,
         'passo', CASE WHEN c.pesquisa THEN 'cortada' ELSE 'gemini' END,
         'status', CASE WHEN c.pesquisa THEN NULL ELSE 404 END,
         'modelo', c.modelo, 'variante', c.variante, 'pesquisa', c.pesquisa,
         'cortada', CASE WHEN c.pesquisa THEN true END, 'ms', c.ms,
         'reconstruida', '03/11/2026, dos logs da função'))
  FROM (VALUES
    -- clique, fim da chamada, modelo, variante, ms, pesquisou/cobrável
    ('2026-11-02 21:07', timestamptz '2026-11-02 21:09:45.07+00', 'gemini-flash-latest', 'pesquisa+sem-pensar', 11930, true),
    ('2026-11-03 08:46', timestamptz '2026-11-03 08:46:48.82+00', 'gemini-2.5-flash',    'pesquisa',              114, false),
    ('2026-11-03 08:46', timestamptz '2026-11-03 08:48:24.82+00', 'gemini-3.8-flash',    'pesquisa',            96000, true),
    ('2026-11-03 08:46', timestamptz '2026-11-03 08:48:36.64+00', 'gemini-3.8-flash',    'pesquisa+sem-pensar', 11815, true),
    ('2026-11-03 08:46', timestamptz '2026-11-03 08:48:36.64+00', 'gemini-flash-latest', 'pesquisa+sem-pensar', 11925, true),
    ('2026-11-03 09:22', timestamptz '2026-11-03 09:22:15.54+00', 'gemini-2.5-flash',    'pesquisa',              151, false),
    ('2026-11-03 09:22', timestamptz '2026-11-03 09:23:51.54+00', 'gemini-3.8-flash',    'pesquisa',            96000, true),
    ('2026-11-03 09:22', timestamptz '2026-11-03 09:24:03.32+00', 'gemini-3.8-flash',    'pesquisa+sem-pensar', 11780, true),
    ('2026-11-03 09:22', timestamptz '2026-11-03 09:24:03.32+00', 'gemini-flash-latest', 'pesquisa+sem-pensar', 11930, true)
  ) AS v(clique, fim, modelo, variante, ms, pesquisa)
  CROSS JOIN LATERAL (SELECT v.*, v.clique || '|' || v.modelo || '|' || v.variante AS chave) c
 WHERE NOT EXISTS (
   SELECT 1 FROM ia_uso.registos r
    WHERE r.detalhe ->> 'origem' = 'function_logs'
      AND r.detalhe ->> 'chave' = c.chave);

-- ── 3. As recusas à entrada da v26 ─────────────────────────────────────
-- A v26 gravava a falta de autorização como 'calendario'; o contrato diz
-- 'entrada' (e a v27 já o faz).
UPDATE ia_uso.registos SET funcionalidade = 'entrada'
 WHERE funcao = 'calendario-sporting'
   AND detalhe ->> 'passo' IN ('autorizacao', 'epoca')
   AND funcionalidade IS DISTINCT FROM 'entrada';

-- ── Conferir depois de correr ──────────────────────────────────────────
-- select funcao, modelo, estado, count(*), sum(duracao_ms)/1000 as s
--   from ia_uso.registos
--  where criado_em >= '2026-11-02 21:00+00' and criado_em < '2026-11-03 09:40+00'
--    and funcao like 'calendario%'
--  group by 1, 2, 3 order by 1, 2, 3;
-- O diagnóstico: 31 linhas (2 lite, 1 3.8-flash, 19 flash ok, 1 flash
-- cortada, 8 recusadas por falta de crédito). O botão: 12 linhas (10
-- cortadas e 2 recusas 404 do gemini-2.5-flash, que já foi retirado).
--
-- E a janela de 02/11 08:49 → 03/11 11:26:
-- select de, ate, real_eur, chamadas, round(peso_total, 4), round(fator, 2)
--   from ia_uso.fatores() where conta = 'google' order by de desc limit 2;
