-- ═══════════════════════════════════════════════════════════════════════
-- AI-API-Control — duas contas (Gemini e Claude), 23/10/2026
-- PARA CORRER UMA VEZ. Colar TUDO no SQL Editor do Supabase e correr. É
-- uma transação: ou entra tudo, ou nada.
--
-- Não é uma fonte de verdade: é o db/calibracao.sql (o 2 da ordem do
-- db/README.md) e o db/claude_sombra.sql (o 6) juntos, tal como estavam a
-- 23/10/2026, mais as duas leituras do Claude que o dono deu nesse dia.
-- Mexer no schema é mexer nesses dois ficheiros, nunca aqui.
--
-- Corre ANTES de publicar a app nova (o app.js já chama registar_leitura
-- com p_conta e lê listar_contas) e ANTES do deploy da vinho-info da
-- Garrafeira que grava o Claude no ia_uso.
-- ═══════════════════════════════════════════════════════════════════════
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- ia_uso / calibração — o euro deixa de ser adivinhado e passa a ser MEDIDO
-- ═══════════════════════════════════════════════════════════════════════
-- Corre DEPOIS do `ia_uso.sql` (usa a `registos`, a `config` e a
-- `sou_admin()` que estão lá). É IDEMPOTENTE.
--
-- O PROBLEMA QUE ISTO RESOLVE. O `registos.custo_estimado_eur` sai de
-- constantes escritas à mão dentro de cada uma das nove Edge Functions
-- (`CUSTO_ANALISE_EUR`, `CUSTO_CALENDARIO_EUR`, `CUSTO_VERIFICACAO_EUR`…).
-- Não é um preço publicado, ninguém as vai lá atualizar quando a Google
-- mexer na tabela, e a pesquisa Google — que é faturada À PARTE, por
-- pedido — não entra em nenhuma delas. Um número assim não serve para
-- controlar custo nenhum: serve para dar ordem de grandeza, e era isso
-- que o `ia_uso.sql` já dizia de si próprio.
--
-- A IDEIA, e é o que muda tudo: DE VEZ EM QUANDO LÊ-SE O SALDO REAL DA
-- CONTA GOOGLE e grava-se aqui. Entre duas leituras há um euro OBSERVADO,
-- e nessa mesma janela a `registos` tem todas as chamadas com os tokens
-- que cada uma gastou. Os TOKENS já eram facto; o euro passa a ser facto
-- também. O que sobra de estimativa — como repartir aquele euro por
-- aquelas chamadas — é só isso, e está todo aqui à vista.
--
-- COMO SE REPARTE: a `precos` dá a FORMA, a leitura dá a ESCALA.
--   · a `precos` diz quanto vale um token de entrada comparado com um de
--     saída, e este modelo comparado com aquele. São RÁCIOS, não preços —
--     ninguém tem de os acertar com a tabela da Google;
--   · o PESO de uma chamada é a soma dos seus tokens a esses rácios, mais
--     a pesquisa Google quando a houve;
--   · o FATOR da janela é o euro observado a dividir pela soma dos pesos.
--     É ele que corrige tudo o resto de uma vez: se os rácios estiverem
--     20% curtos, o fator fica 20% maior e as contas fecham na mesma.
--
-- A INVARIANTE: a soma das chamadas de uma janela dá EXACTAMENTE o euro
-- que foi lido — por construção e não por arredondamento, porque
-- `Σ(peso × fator) = Σpeso × (real / Σpeso) = real`. É a mesma regra que
-- já segura a divisão da fatura no SplitBill e o rateio das compras no
-- FestasBV: a soma das partes tem de dar a fatura.
--   E é por isso que aqui NÃO se arredonda ao cêntimo. Uma chamada custa
--   milésimos de euro; arredondá-la punha metade a zero e a outra metade
--   a um cêntimo, e a invariante ia com elas.
--
-- O QUE ISTO NÃO CONSEGUE DIZER, e é preciso saber-se:
--   · dentro de uma janela, a repartição continua a depender dos rácios.
--     O TOTAL está certo; a chamada individual está tão certa quanto a
--     `precos` estiver. Mais leituras não melhoram isso — o que melhora é
--     mexer nos rácios e ver o `desvio` das janelas descer;
--   · as chamadas ANTERIORES à primeira leitura e as POSTERIORES à última
--     não caem em janela nenhuma. Levam o fator da janela mais próxima e
--     vêm marcadas `provisorio` — nunca se calam nem se inventam;
--   · o `tokens_pensamento` esteve a NULL até 20/09/2026 (o
--     `usageMetadata()` local de cinco das nove functions deitava fora o
--     `thoughtsTokenCount`). No histórico anterior a essa data, uma
--     chamada que gastou o orçamento a PENSAR e não escreveu nada — o
--     "200 vazio" — pesa quase nada e leva menos euros do que gastou. O
--     total da janela fica certo à mesma; é a repartição dentro dela que
--     mente, e mente sempre no mesmo sentido.
--
-- DUAS CONTAS (23/10/2026): a Google (o Gemini) e a Anthropic (o Claude).
-- Cada uma tem o seu saldo, as suas leituras, as suas janelas e o seu
-- fator, e uma chamada só leva euros da conta que a cobrou. Com uma conta
-- só, o saldo da Google era repartido por TODAS as linhas da janela, e uma
-- linha do Claude levava euros da Google — foi por isso que a `vinho-info`
-- deixou o Claude fora do `ia_uso` até isto existir. A invariante passa a
-- ser por conta: a soma das chamadas de uma janela da Anthropic dá o
-- crédito da Anthropic que se gastou nela, e nem um cêntimo da Google.
-- ═══════════════════════════════════════════════════════════════════════

-- ── As contas ──────────────────────────────────────────────────────────
-- Uma conta é um SALDO que se lê. A MOEDA é a da consola: a Anthropic mostra
-- dólares, e uma leitura escreve-se como lá está — reescrevê-la em euros à
-- mão era mais uma conta para errar.
--
-- O `eur_por_unidade` passa a janela a euros DEPOIS de subtrair as duas
-- leituras, nunca antes: converter cada leitura ao câmbio do dia metia a
-- flutuação do câmbio no gasto, e com dólares de 4,36 a flutuação de uma
-- semana é do tamanho de um dia de chamadas.
--   É um câmbio FIXO, e é uma suposição à vista: o crédito da Anthropic é
-- pré-pago, e o euro que custou cada dólar foi o que o banco cobrou no
-- carregamento. Acerta-se em Definições, e mudá-lo refaz o euro de todas as
-- janelas da conta — que é o que deve acontecer, porque é a mesma suposição.
CREATE TABLE IF NOT EXISTS ia_uso.contas (
  conta           text PRIMARY KEY,
  nome            text NOT NULL,
  moeda           text NOT NULL DEFAULT 'EUR' CHECK (moeda IN ('EUR', 'USD')),
  eur_por_unidade numeric NOT NULL DEFAULT 1 CHECK (eur_por_unidade > 0),
  nota            text,
  -- Um euro vale um euro: um câmbio na conta em euros era um erro à espera.
  CHECK (moeda <> 'EUR' OR eur_por_unidade = 1)
);

INSERT INTO ia_uso.contas (conta, nome, moeda, eur_por_unidade, nota) VALUES
  ('google',    'Gemini', 'EUR', 1,    'o saldo da consola da Google'),
  ('anthropic', 'Claude', 'USD', 0.86, 'o crédito da consola da Anthropic; 0,86 € por dólar é o câmbio da vinho-info a 23/10/2026')
ON CONFLICT (conta) DO NOTHING;

-- ── As leituras do saldo ───────────────────────────────────────────────
-- Uma linha por vez que se vai ao painel da Google ver quanto lá está.
--
-- DOIS FEITIOS, porque as contas da Google não se leem todas da mesma
-- maneira: um saldo pré-pago DESCE (`tipo='saldo'`) e um gasto acumulado
-- SOBE (`tipo='gasto'`). Suportam-se os dois em vez de se adivinhar qual
-- é — adivinhar trocava o sinal, e a app dizia que não se tinha gasto
-- nada exactamente quando mais se tinha gasto.
--
-- `carregado` é o que se pôs na conta DESDE a leitura anterior. Sem ele,
-- um carregamento a meio da janela lia-se como dinheiro que não se gastou:
-- o saldo subia e a janela dava negativa.
--
-- `valor` e `carregado` são na moeda da CONTA. Até 23/10/2026 chamavam-se
-- `valor_eur` e `carregado_eur`, e com dólares lá dentro o nome mentia.
CREATE TABLE IF NOT EXISTS ia_uso.leituras (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  conta         text NOT NULL DEFAULT 'google' REFERENCES ia_uso.contas (conta),
  lido_em       timestamptz NOT NULL DEFAULT now(),
  tipo          text NOT NULL DEFAULT 'saldo' CHECK (tipo IN ('saldo', 'gasto')),
  valor         numeric NOT NULL CHECK (valor >= 0),
  carregado     numeric NOT NULL DEFAULT 0 CHECK (carregado >= 0),
  nota          text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- A tabela de antes das duas contas: só havia a Google, e era em euros.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'ia_uso' AND table_name = 'leituras'
                AND column_name = 'valor_eur') THEN
    ALTER TABLE ia_uso.leituras RENAME COLUMN valor_eur TO valor;
    ALTER TABLE ia_uso.leituras RENAME COLUMN carregado_eur TO carregado;
  END IF;
END $$;
ALTER TABLE ia_uso.leituras
  ADD COLUMN IF NOT EXISTS conta text NOT NULL DEFAULT 'google' REFERENCES ia_uso.contas (conta);

-- Duas leituras DA MESMA CONTA ao mesmo instante davam uma janela de
-- largura zero com chamadas lá dentro — e um fator sem sentido. Duas
-- contas lidas no mesmo minuto é o normal.
DROP INDEX IF EXISTS ia_uso.leituras_lido_em_idx;
CREATE UNIQUE INDEX IF NOT EXISTS leituras_conta_lido_em_idx
  ON ia_uso.leituras USING btree (conta, lido_em);

-- ── Os rácios (a FORMA, nunca o preço) ─────────────────────────────────
-- Estes números NÃO são a tabela de preços da Google e não têm de bater
-- certo com ela. Só importa a PROPORÇÃO entre eles. A escala vem toda do
-- fator da janela, e é isso que os torna seguros de errar.
--
-- `modelo = '*'` é a linha de recurso, para um modelo que apareça amanhã
-- sem ninguém o ter acrescentado aqui — é o que evita que uma chamada
-- fique com peso zero e leve euros a menos.
--
-- `eur_pensamento_1m` a NULL = cobra-se como saída, que é o que a Google
-- faz hoje. Fica como coluna própria para o dia em que deixar de ser.
--
-- `eur_pesquisa` é POR PESQUISA e não por token: o grounding com pesquisa
-- Google é faturado à parte, e era exactamente o que nenhuma das
-- constantes das Edge Functions sabia incluir. Na Google é uma por pedido
-- com grounding; no Claude é cada pesquisa que ele fez (ver `pesquisas()`).
--
-- A `conta` diz que saldo paga o modelo. Só se compara a proporção DENTRO
-- de uma conta — cada conta tem o seu fator, e é ele que dá a escala. Por
-- isso os rácios do Claude são a tabela da Anthropic em dólares tal e qual,
-- ao lado dos do Gemini em euros: os dois nunca se dividem um pelo outro.
--
-- Um `*` no modelo é um PADRÃO: `claude-*` apanha um Claude que apareça
-- amanhã sem ninguém o pôr aqui, e é isso que o mantém na conta da
-- Anthropic — pelo `*` de recurso ia levar euros ao saldo da Google.
CREATE TABLE IF NOT EXISTS ia_uso.precos (
  modelo            text PRIMARY KEY,
  conta             text NOT NULL DEFAULT 'google' REFERENCES ia_uso.contas (conta),
  eur_entrada_1m    numeric NOT NULL CHECK (eur_entrada_1m >= 0),
  eur_saida_1m      numeric NOT NULL CHECK (eur_saida_1m >= 0),
  eur_pensamento_1m numeric CHECK (eur_pensamento_1m >= 0),
  eur_pesquisa      numeric NOT NULL DEFAULT 0 CHECK (eur_pesquisa >= 0),
  nota              text
);
ALTER TABLE ia_uso.precos
  ADD COLUMN IF NOT EXISTS conta text NOT NULL DEFAULT 'google' REFERENCES ia_uso.contas (conta);

-- No Claude o pensamento vem DENTRO dos tokens de saída (o `usage` não o
-- separa), por isso o `eur_pensamento_1m` fica a NULL — cobra-se como saída.
-- O Haiku passa a 0,50/2,50 num pedido com mais de 100 mil tokens de
-- entrada; a linha não o distingue (a `registos` soma as voltas de uma
-- chamada), e é a repartição dentro da janela que o paga, não o total.
INSERT INTO ia_uso.precos (modelo, conta, eur_entrada_1m, eur_saida_1m, eur_pensamento_1m, eur_pesquisa, nota) VALUES
  ('*',                        'google',    0.10, 0.40, NULL, 0.030, 'linha de recurso: um modelo que ainda não está aqui'),
  ('gemini-flash-latest',      'google',    0.30, 2.50, NULL, 0.030, 'o ponteiro do flash'),
  ('gemini-flash-lite-latest', 'google',    0.10, 0.40, NULL, 0.030, 'o ponteiro do lite'),
  ('claude-*',                 'anthropic', 2.00, 10.0, NULL, 0.010, 'um Claude que ainda não está aqui: pesa como o Sonnet'),
  ('claude-haiku-5-5',         'anthropic', 0.10, 0.50, NULL, 0.010, 'tabela da Anthropic em dólares; a pesquisa é por pesquisa'),
  ('claude-sonnet-5-5',        'anthropic', 2.00, 10.0, NULL, 0.010, 'tabela da Anthropic em dólares; a pesquisa é por pesquisa'),
  ('claude-opus-5-5',          'anthropic', 4.00, 20.0, NULL, 0.010, 'tabela da Anthropic em dólares; a pesquisa é por pesquisa')
ON CONFLICT (modelo) DO NOTHING;

-- ── Houve pesquisa Google, ou não? ────────────────────────────────────
-- A `registos.pesquisa_web` NUNCA teve um significado definido, e as nove
-- Edge Functions inventaram um cada uma: a `catalogo-info` e a
-- `verificar-vinhos` pesquisam SEMPRE e não gravam a coluna; a
-- `vinho-info` grava um ESTADO em texto, que dá verdadeiro tanto para o
-- grounding da Google — faturado por pedido — como para a pesquisa
-- externa do motor `gratis`, que é paga a outro fornecedor; só a
-- `sugerir-vinho` e a `calendario-sporting` gravam um booleano a sério.
--
-- A pergunta decide-se AQUI e não lá, e é de propósito: "que chamadas
-- pagaram uma pesquisa à Google" é uma pergunta de CUSTO, logo é desta
-- app. É o mesmo movimento da `winecatalog.forca()` — o catálogo decide
-- quanto vale a afirmação de cada origem, em vez de pedir a cada escritor
-- que se auto-declare com honestidade. E tem uma vantagem que um deploy
-- não tem: arruma o HISTÓRICO, que já está escrito e não se redeploya.
--
-- ANTES DISTO, as chamadas da `catalogo-info` pesavam ~0,001 contra os
-- ~0,030 das da `vinho-info` — pareciam trinta vezes mais baratas só por
-- lhes faltar a bandeira, e levavam uma fatia do euro real a condizer.
CREATE TABLE IF NOT EXISTS ia_uso.funcoes (
  funcao    text PRIMARY KEY,
  grounding boolean NOT NULL,
  nota      text
);

INSERT INTO ia_uso.funcoes (funcao, grounding, nota) VALUES
  ('catalogo-info',       true,  'pesquisa sempre; NÃO grava a coluna — a regra daqui é a única fonte'),
  ('verificar-vinhos',    true,  'pesquisa sempre, e é a chamada mais cara; NÃO grava a coluna'),
  ('vinho-info',          true,  'grava o estado em TEXTO: só "grounding:" é que a Google fatura'),
  ('sugerir-vinho',       true,  'grava a coluna a sério, em booleano'),
  ('calendario-sporting', true,  'grava a coluna a sério; pode cair numa variante sem pesquisa'),
  ('catalogo-foto',       false, 'visão sobre uma fotografia — nunca pesquisa'),
  ('importar-vinhos',     false, 'lê fotos de rótulos — nunca pesquisa'),
  ('fatura-restaurante',  false, 'OCR de um talão'),
  ('fatura-ocr',          false, 'OCR de um talão'),
  -- As cinco que chegaram depois. As duas de fora (AnniversaryGifts,
  -- SplitWisely) foram metidas à mão no SQL Editor e as três da Garrafeira
  -- nem isso — apareciam no `semRegra`. Ficam aqui, que é a fonte de verdade.
  ('garrafeira-carta',      false, 'Sugestões da Garrafeira: lê a carta e ordena — sem pesquisa'),
  ('garrafeira-produtores', false, 'Backoffice: produtores com IA — sem pesquisa'),
  ('garrafeira-colheitas',  false, 'Backoffice: colheitas que não batem — sem pesquisa'),
  ('prendas-vinho',         true,  'pesquisa sempre (AnniversaryGifts); grava a coluna a sério, em booleano'),
  ('despesa-ia',            false, 'SplitWisely: texto (e foto do talão) → despesa em JSON; nunca pesquisa')
ON CONFLICT (funcao) DO NOTHING;

-- Do mais específico para o mais geral: o que a própria CHAMADA disser
-- ganha à regra da FUNÇÃO, e a regra da função só entra quando a chamada
-- não disse nada. Sem regra nenhuma, não se cobra pesquisa — mas a função
-- aparece em `semRegra` no resumo, para não descer a conta em silêncio.
CREATE OR REPLACE FUNCTION ia_uso.grounding(r ia_uso.registos)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  SELECT CASE
    WHEN jsonb_typeof(r.detalhe -> 'pesquisa') = 'string'
      THEN (r.detalhe ->> 'pesquisa') LIKE 'grounding:%'
    -- A `sugerir-vinho` e a `calendario-sporting` são as duas que podem
    -- cair numa variante SEM pesquisa a meio da mesma função: o booleano
    -- que elas gravam sabe mais do que qualquer regra por função.
    WHEN jsonb_typeof(r.detalhe -> 'pesquisa') = 'boolean'
      THEN (r.detalhe -> 'pesquisa')::boolean
    WHEN r.pesquisa_web IS NOT NULL THEN r.pesquisa_web
    -- A regra da função só vale para uma chamada que CHEGOU ao Gemini. Um
    -- pedido recusado à entrada (sem sessão, sem plano), servido pela cache
    -- ou pelo catálogo, não tem um token — e não pagou pesquisa nenhuma.
    -- Até 11/10/2026 levava os 0,03 da pesquisa na mesma: 40 linhas assim
    -- tinham ~0,45 € do euro medido que era das chamadas a sério.
    WHEN COALESCE(r.tokens_total, 0) = 0 AND COALESCE(r.tokens_entrada, 0) = 0 THEN false
    ELSE COALESCE((SELECT f.grounding FROM ia_uso.funcoes f WHERE f.funcao = r.funcao), false)
  END;
$$;

-- ── Quantas pesquisas a chamada pagou ─────────────────────────────────
-- A Google cobra o grounding POR PEDIDO — uma, por muitas consultas que o
-- modelo faça lá dentro. O Claude cobra POR PESQUISA (até cinco numa
-- chamada, 0,01 $ cada). A chamada que sabe quantas fez grava
-- `detalhe.pesquisas` (número), e isso ganha a tudo; sem ele é uma ou
-- nenhuma, pela `grounding()`.
CREATE OR REPLACE FUNCTION ia_uso.pesquisas(r ia_uso.registos)
RETURNS integer
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  SELECT CASE
    WHEN jsonb_typeof(r.detalhe -> 'pesquisas') = 'number'
      THEN GREATEST(round((r.detalhe ->> 'pesquisas')::numeric), 0)::integer
    WHEN ia_uso.grounding(r) THEN 1
    ELSE 0
  END;
$$;

-- ── A linha da `precos` de um modelo ───────────────────────────────────
-- A exacta; senão a da primeira parte (a `vinho-info` grava "a + b" quando
-- uma procura correu duas fases); senão o padrão mais comprido que lhe
-- sirva (`claude-*`); senão a de recurso (`*`). É também esta linha que diz
-- de que CONTA é o modelo.
--
-- A ordem é explícita e é de propósito: num `UNION ALL` sem ordem, qual das
-- linhas vinha primeiro era o acaso, e o mesmo modelo pesava de duas
-- maneiras conforme o plano.
CREATE OR REPLACE FUNCTION ia_uso.preco_de(p_modelo text)
RETURNS ia_uso.precos
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  WITH m AS (
    SELECT COALESCE(NULLIF(btrim(p_modelo), ''), '*') AS inteiro,
           COALESCE(NULLIF(btrim(split_part(p_modelo, ' + ', 1)), ''), '*') AS primeiro
  )
  SELECT p.*
    FROM ia_uso.precos p, m
   WHERE p.modelo IN (m.inteiro, m.primeiro)
      OR (strpos(p.modelo, '*') > 0
          AND m.primeiro LIKE replace(replace(p.modelo, '_', '\_'), '*', '%'))
   ORDER BY (p.modelo = m.inteiro) DESC, (p.modelo = m.primeiro) DESC, length(p.modelo) DESC
   LIMIT 1;
$$;

-- ── De que conta é um modelo ───────────────────────────────────────────
-- A de cada modelo que o texto nomeia. Uma linha "a + b" é de uma conta se
-- as partes forem todas da mesma; se misturar o Gemini e o Claude é NULL:
-- os tokens dela são de dois saldos somados e não há como os separar. Não
-- leva euro nenhum, e o resumo conta-as (`mistas`) para a function passar a
-- gravar uma linha por conta — calada, a conta descia sozinha.
--
-- Recebe o MODELO e não a chamada, de propósito: a conta só depende dele, e
-- assim procura-se uma vez por modelo em vez de uma vez por linha.
CREATE OR REPLACE FUNCTION ia_uso.conta_de(p_modelo text)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  SELECT CASE WHEN count(DISTINCT s.c) = 1 THEN min(s.c) END
    FROM (SELECT (ia_uso.preco_de(btrim(m))).conta AS c
            FROM unnest(string_to_array(COALESCE(NULLIF(btrim(p_modelo), ''), '*'), ' + ')) m) s;
$$;

-- ── O peso de uma chamada ──────────────────────────────────────────────
-- UMA SÓ DEFINIÇÃO disto, e é esta. Se um dia o peso passar a contar mais
-- alguma coisa (cache de contexto, imagens à parte), muda-se aqui e o
-- resto — janelas, custo por chamada, resumo — acompanha sozinho. Dois
-- sítios a pesar a mesma chamada davam dois euros para a mesma linha.
--
-- A linha da `precos` entra por fora porque é do modelo: a `pesadas()`
-- procura-a uma vez por modelo. A de um argumento é a mesma conta, para o
-- SQL Editor.
CREATE OR REPLACE FUNCTION ia_uso.peso(r ia_uso.registos, p ia_uso.precos)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  SELECT (
      COALESCE(r.tokens_entrada, 0)    * p.eur_entrada_1m
    + COALESCE(r.tokens_saida, 0)      * p.eur_saida_1m
    + COALESCE(r.tokens_pensamento, 0) * COALESCE(p.eur_pensamento_1m, p.eur_saida_1m)
    ) / 1000000.0
    + ia_uso.pesquisas(r) * p.eur_pesquisa;
$$;

CREATE OR REPLACE FUNCTION ia_uso.peso(r ia_uso.registos)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  SELECT ia_uso.peso(r, ia_uso.preco_de(r.modelo));
$$;

-- ── Todas as chamadas, pesadas e postas na sua conta ───────────────────
-- A base das janelas e do custo por chamada. O preço e a conta procuram-se
-- uma vez por MODELO (são uns dez) e não uma vez por linha: procurá-los por
-- linha punha o painel três vezes mais lento.
CREATE OR REPLACE FUNCTION ia_uso.pesadas()
RETURNS TABLE (id bigint, criado_em timestamptz, conta text, peso numeric, custo_estimado_eur numeric)
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  WITH mp AS MATERIALIZED (
    SELECT d.modelo, ia_uso.preco_de(d.modelo) AS p, ia_uso.conta_de(d.modelo) AS conta
      FROM (SELECT DISTINCT x.modelo FROM ia_uso.registos x) d
  )
  SELECT x.id, x.criado_em, mp.conta, ia_uso.peso(x, mp.p), x.custo_estimado_eur
    FROM ia_uso.registos x
    JOIN mp ON mp.modelo IS NOT DISTINCT FROM x.modelo;
$$;

-- ── As janelas, em cru ─────────────────────────────────────────────────
-- Interna: é a peça de que tudo o resto vive. Uma linha por par de
-- leituras consecutivas, com o euro observado, o peso das chamadas que lá
-- caíram e o fator que os reconcilia.
--
-- Leituras de tipos diferentes seguidas não dão janela (`real_eur` a
-- NULL): misturar um saldo que desce com um gasto que sobe dava um número
-- sem significado, e é melhor não dizer nada do que dizer isso. Um
-- `real_eur` NEGATIVO também não dá fator — é sinal de que faltou
-- declarar um carregamento, e inventar um fator negativo era espalhar
-- custos negativos por chamadas que custaram dinheiro.
--
-- O ATRASO DA GOOGLE. O saldo da Google só mostra uma chamada algum
-- tempo depois de ela acontecer. Com leituras várias vezes ao dia isso
-- dá dois desenhos falsos, sempre juntos: uma janela COM chamadas e
-- 0,00 € (a Google ainda não as tinha cobrado), seguida de uma janela
-- SEM chamadas e com euros (é quando as cobrou). Lida à letra, a
-- primeira dizia que aquelas chamadas não custaram nada e a segunda não
-- tinha a quem dar o euro. Por isso as janelas JUNTAM-SE:
--   · uma janela SEM chamadas junta-se à anterior — o euro que lá
--     apareceu é das chamadas de trás;
--   · uma janela a seguir a chamadas ainda a 0,00 € junta-se a elas — o
--     euro que vier é delas também.
-- O que sai é um GRUPO (`leituras` diz quantas janelas juntou), e é o
-- grupo que tem fator. A invariante continua: a soma das chamadas do
-- grupo dá exactamente o euro do grupo. Uma janela sem número a sério
-- (feitios diferentes, saldo que subiu) não se junta a nada nem deixa
-- nada juntar-se a ela.
--   Um grupo com chamadas e 0,00 € que ainda não teve sucessor fica
-- `pendente` e SEM fator: não é "custou zero", é "a Google ainda não
-- disse". As chamadas dele levam o fator mais próximo e vêm `provisorio`.
--
-- AS CONTAS NÃO SE MISTURAM: as leituras emparelham-se dentro de cada
-- conta, uma janela da Google só conta as chamadas da Google, e os grupos
-- juntam-se dentro da mesma conta. O `real_moeda` é na moeda da conta (o
-- que se leu na consola) e o `real_eur` é ele ao câmbio da conta — é o
-- `real_eur` que se reparte.
--
-- O DROP é porque a forma do resultado mudou (`conta`, `moeda`, `real_moeda`), e
-- isso o CREATE OR REPLACE não faz. Nada guarda dependência dela — a
-- `calc()` e as DEFINER chamam-na pelo nome — e os GRANTs voltam no fim.
DROP FUNCTION IF EXISTS ia_uso.fatores();
CREATE FUNCTION ia_uso.fatores()
RETURNS TABLE (
  leitura_id bigint, conta text, de timestamptz, ate timestamptz, tipo text,
  moeda text, real_moeda numeric, real_eur numeric, chamadas bigint, peso_total numeric,
  estimado_eur numeric, fator numeric, nota text,
  leituras integer, pendente boolean
)
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  WITH RECURSIVE pares AS (
    SELECT l.id, l.conta, l.tipo, l.valor, l.carregado, l.lido_em, l.nota,
           lag(l.lido_em) OVER w AS de,
           lag(l.valor)   OVER w AS val_ant,
           lag(l.tipo)    OVER w AS tipo_ant
      FROM ia_uso.leituras l
    WINDOW w AS (PARTITION BY l.conta ORDER BY l.lido_em)
  ), j AS (
    SELECT p.id, p.conta, p.de, p.lido_em AS ate, p.tipo, p.nota,
      CASE
        WHEN p.tipo_ant IS DISTINCT FROM p.tipo THEN NULL
        WHEN p.tipo = 'saldo' THEN p.val_ant + p.carregado - p.valor
        WHEN p.valor >= p.val_ant THEN p.valor - p.val_ant
        -- gasto acumulado que DESCEU = a conta virou o mês e voltou a
        -- zero; o que lá está agora é o que se gastou desde a viragem.
        ELSE p.valor
      END AS real_moeda
      FROM pares p
     WHERE p.de IS NOT NULL
  ), r AS MATERIALIZED (
    -- Cada chamada pesada e posta na sua conta UMA vez, e não uma vez por
    -- janela que a procure.
    SELECT * FROM ia_uso.pesadas()
  ), a AS (
    SELECT j.*, s.chamadas, s.peso_total, s.estimado_eur,
           (j.real_moeda IS NULL OR j.real_moeda < 0) AS invalida,
           row_number() OVER (PARTITION BY j.conta ORDER BY j.ate) AS n
      FROM j
      CROSS JOIN LATERAL (
        SELECT count(*) AS chamadas,
               COALESCE(sum(r.peso), 0) AS peso_total,
               COALESCE(sum(r.custo_estimado_eur), 0) AS estimado_eur
          FROM r
         WHERE r.conta = j.conta AND r.criado_em > j.de AND r.criado_em <= j.ate
      ) s
  ), g AS (
    -- Janela a janela, pela ordem, a decidir se abre grupo novo. Tem de
    -- ser recursivo: "as de trás ainda estão a 0,00 €" é o estado do
    -- GRUPO até aqui, não da janela imediatamente anterior.
    SELECT a.conta, a.n, 1::bigint AS grupo, a.real_moeda AS acum,
           a.peso_total > 0 AS com_chamadas, a.invalida
      FROM a WHERE a.n = 1
    UNION ALL
    SELECT a.conta, a.n,
           g.grupo + CASE WHEN x.junta THEN 0 ELSE 1 END,
           CASE WHEN x.junta THEN g.acum + a.real_moeda ELSE a.real_moeda END,
           (x.junta AND g.com_chamadas) OR a.peso_total > 0,
           a.invalida
      FROM g JOIN a ON a.conta = g.conta AND a.n = g.n + 1
      CROSS JOIN LATERAL (
        SELECT NOT g.invalida AND NOT a.invalida
               AND (a.peso_total = 0 OR (g.com_chamadas AND g.acum = 0)) AS junta
      ) x
  ), gr AS (
    SELECT g.conta, g.grupo,
           (array_agg(a.id ORDER BY a.ate DESC))[1] AS leitura_id,
           min(a.de) AS de, max(a.ate) AS ate, min(a.tipo) AS tipo,
           -- Um grupo inválido é sempre de UMA janela, por isso a soma não
           -- esconde um NULL no meio de números.
           sum(a.real_moeda) AS real_moeda,
           sum(a.chamadas)::bigint AS chamadas, sum(a.peso_total) AS peso_total,
           sum(a.estimado_eur) AS estimado_eur,
           string_agg(a.nota, ' · ' ORDER BY a.ate) AS nota,
           count(*)::integer AS leituras
      FROM g JOIN a ON a.conta = g.conta AND a.n = g.n
     GROUP BY g.conta, g.grupo
  )
  SELECT gr.leitura_id, gr.conta, gr.de, gr.ate, gr.tipo,
         c.moeda, gr.real_moeda, gr.real_moeda * c.eur_por_unidade,
         gr.chamadas, gr.peso_total, gr.estimado_eur,
         -- `> 0` e não `>= 0`: um grupo com chamadas a 0,00 € é um grupo
         -- que a consola ainda não cobrou, e um fator zero punha-as a
         -- custar nada.
         CASE WHEN gr.peso_total > 0 AND gr.real_moeda > 0
              THEN gr.real_moeda * c.eur_por_unidade / gr.peso_total END,
         gr.nota, gr.leituras,
         (gr.peso_total > 0 AND gr.real_moeda = 0)
    FROM gr JOIN ia_uso.contas c ON c.conta = gr.conta;
$$;

-- ── O custo medido de cada chamada ─────────────────────────────────────
-- `peso × fator da janela onde caiu`. Interna e SEM LIMITE: é a base de
-- que os agregados e a lista vivem, e calcula os fatores UMA vez para
-- todas as linhas. A primeira versão perguntava o fator por linha e era
-- quadrática — com sete registos não se nota, com sete mil nota-se muito.
--
-- Fora de qualquer janela usa-se o fator mais PRÓXIMO no tempo e a linha
-- vem `provisorio`. Sem leitura nenhuma ainda não há fator: `custo_eur`
-- fica NULL e a app mostra a estimativa antiga dizendo que é isso que
-- está a mostrar. NÃO se cai para o `custo_estimado_eur` às escondidas —
-- um número medido e um número adivinhado não se somam na mesma coluna
-- sem se dizer qual é qual.
--
-- O fator é sempre da MESMA conta: o mais próximo da Google para uma
-- chamada do Gemini, o mais próximo da Anthropic para uma do Claude. Uma
-- conta sem leitura nenhuma deixa as chamadas dela a NULL, mesmo que a
-- outra esteja calibrada — e o resumo diz quantas ficaram assim.
--
-- O DROP é porque se acrescentou a `conta` ao resultado.
DROP FUNCTION IF EXISTS ia_uso.calc();
CREATE FUNCTION ia_uso.calc()
RETURNS TABLE (id bigint, conta text, peso numeric, fator numeric, custo_eur numeric, provisorio boolean)
LANGUAGE sql STABLE
SET search_path TO 'ia_uso', 'public'
AS $$
  WITH f AS MATERIALIZED (
    SELECT x.conta, x.de, x.ate, x.fator FROM ia_uso.fatores() x WHERE x.fator IS NOT NULL
  ), r AS MATERIALIZED (
    -- MATERIALIZED, e não é enfeite: sem ele o LATERAL de baixo podia voltar
    -- a pesar a chamada uma vez por cada fator — 0,8 s passavam a 21 s.
    SELECT * FROM ia_uso.pesadas()
  )
  SELECT r.id, r.conta, r.peso, c.fator, r.peso * c.fator,
         COALESCE(c.provisorio, true)
    FROM r
    LEFT JOIN LATERAL (
      SELECT f.fator,
             NOT (r.criado_em > f.de AND r.criado_em <= f.ate) AS provisorio
        FROM f
       WHERE f.conta = r.conta
       ORDER BY (r.criado_em > f.de AND r.criado_em <= f.ate) DESC,
                LEAST(abs(extract(epoch FROM r.criado_em - f.ate)),
                      abs(extract(epoch FROM r.criado_em - f.de)))
       LIMIT 1
    ) c ON true;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- O que a app chama (tudo com o portão `sou_admin()` lá dentro)
-- ═══════════════════════════════════════════════════════════════════════

-- As janelas para o ecrã do saldo. O `desvio` é quanto a estimativa das
-- Edge Functions andava longe da realidade — é ele que diz se vale a pena
-- mexer nos rácios, e é a única coisa que esta app pode dizer sobre a
-- qualidade da própria conta.
CREATE OR REPLACE FUNCTION ia_uso.janelas()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin vê os acessos à IA.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(
             to_jsonb(f) || jsonb_build_object(
               'desvio', CASE WHEN f.estimado_eur > 0 AND f.real_eur IS NOT NULL
                              THEN (f.real_eur - f.estimado_eur) / f.estimado_eur END)
             ORDER BY f.ate DESC)
      FROM ia_uso.fatores() f
  ), '[]'::jsonb);
END;
$$;

-- Os registos com o custo medido, do mais recente para o mais antigo.
-- Limite capado a 1000 — é um painel, não um export.
CREATE OR REPLACE FUNCTION ia_uso.custos(
  p_limite integer DEFAULT 200,
  p_app text DEFAULT NULL,
  p_desde timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin vê os acessos à IA.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(
             to_jsonb(r) || jsonb_build_object(
               'conta', c.conta, 'peso', c.peso, 'fator', c.fator,
               'custo_eur', c.custo_eur, 'provisorio', c.provisorio)
             ORDER BY r.criado_em DESC)
      FROM (
        SELECT * FROM ia_uso.registos
         WHERE (p_app IS NULL OR app = p_app)
           AND (p_desde IS NULL OR criado_em >= p_desde)
         ORDER BY criado_em DESC
         LIMIT LEAST(GREATEST(COALESCE(p_limite, 200), 1), 1000)
      ) r
      JOIN ia_uso.calc() c ON c.id = r.id
  ), '[]'::jsonb);
END;
$$;

-- Os totais em euros MEDIDOS, com a estimativa ao lado para se ver a
-- diferença. Irmão do `ia_uso.resumo()` do `ia_uso.sql`, que só sabe
-- somar a estimativa: são duas perguntas diferentes e por isso são duas
-- funções — uma diz o que o código julgava que ia custar, esta diz o que
-- custou. O painel usa esta.
CREATE OR REPLACE FUNCTION ia_uso.resumo_medido(p_dias integer DEFAULT 30)
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
    -- `m` é um CTE com colunas a mais, por isso `m.*::ia_uso.registos` é
    -- um record com colunas a mais e o Postgres recusa-o — e só o diz
    -- quando a função CORRE. É a mesma pedra da `winecatalog.listar`: a
    -- linha tem de ser pesada ANTES de entrar no CTE.
    WITH m AS (
      SELECT r.*, c.conta, c.custo_eur, c.provisorio, ia_uso.pesquisas(r) AS n_pesquisas
        FROM ia_uso.registos r JOIN ia_uso.calc() c ON c.id = r.id
       -- `pedido` é o "ia começar" da `importar-vinhos`, não uma chamada:
       -- contado, metia cada importação a contar duas vezes.
       WHERE r.estado <> 'pedido'
    ), cal AS (
      SELECT DISTINCT f.conta FROM ia_uso.fatores() f WHERE f.fator IS NOT NULL
    )
    SELECT jsonb_build_object(
      'janelaDias', p_dias,
      'calibrado', EXISTS (SELECT 1 FROM cal),
      -- Cada conta na janela. Com uma calibrada e a outra não, o medido de
      -- cima só soma a que tem leituras: o `semMedida` diz quantas chamadas
      -- ficaram de fora, e quanto valiam pela estimativa. Sem isto, a conta
      -- nova descia o total em silêncio.
      'contas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'conta', k.conta, 'nome', k.nome, 'moeda', k.moeda,
                 'eurPorUnidade', k.eur_por_unidade,
                 'calibrado', EXISTS (SELECT 1 FROM cal WHERE cal.conta = k.conta),
                 'pedidos', x.pedidos, 'custoEur', x.custo, 'estimadoEur', x.est,
                 'semMedida', x.sem, 'semMedidaEstEur', x.sem_est,
                 'ultimaLeitura', (SELECT max(l.lido_em) FROM ia_uso.leituras l WHERE l.conta = k.conta))
               ORDER BY k.conta <> 'google', k.conta)
          FROM ia_uso.contas k
          CROSS JOIN LATERAL (
            SELECT count(*) AS pedidos, sum(m.custo_eur) AS custo,
                   COALESCE(sum(m.custo_estimado_eur), 0) AS est,
                   count(*) FILTER (WHERE m.custo_eur IS NULL) AS sem,
                   COALESCE(sum(m.custo_estimado_eur) FILTER (WHERE m.custo_eur IS NULL), 0) AS sem_est
              FROM m WHERE m.conta = k.conta AND m.criado_em >= v_desde
          ) x
      ), '[]'::jsonb),
      -- As linhas que misturam duas contas (ver `ia_uso.conta_de()`).
      'mistas', (SELECT count(*) FROM m WHERE m.conta IS NULL AND m.criado_em >= v_desde),
      -- Uma décima função que pesquise sempre e não grave a coluna ficava
      -- com a pesquisa por contar, e a conta descia sozinha — que é a pior
      -- maneira de uma conta estar errada. Assim aparece no painel.
      'semRegra', COALESCE((
        SELECT jsonb_agg(DISTINCT m.funcao) FROM m
         WHERE NOT EXISTS (SELECT 1 FROM ia_uso.funcoes f WHERE f.funcao = m.funcao)
      ), '[]'::jsonb),
      'porApp', COALESCE((
        SELECT jsonb_agg(x ORDER BY (x ->> 'pedidos')::int DESC) FROM (
          SELECT jsonb_build_object(
            'app', m.app,
            'pedidos', count(*),
            'ok', count(*) FILTER (WHERE m.estado = 'ok'),
            'erro', count(*) FILTER (WHERE m.estado = 'erro'),
            'tokensEntrada', COALESCE(sum(m.tokens_entrada), 0),
            'tokensSaida', COALESCE(sum(m.tokens_saida), 0),
            'tokensPensamento', COALESCE(sum(m.tokens_pensamento), 0),
            'pesquisas', COALESCE(sum(m.n_pesquisas), 0),
            'custoEur', sum(m.custo_eur),
            'estimadoEur', COALESCE(sum(m.custo_estimado_eur), 0),
            'provisorio', bool_or(m.provisorio),
            'ultimaChamada', max(m.criado_em)
          ) AS x FROM m GROUP BY m.app
        ) t
      ), '[]'::jsonb),
      -- Da JANELA, como diz o ecrã por cima dos cartões. Até 23/10/2026
      -- somava desde sempre ao lado de um "30 dias" — o mesmo erro do "Por
      -- app" de antes, que ficou por corrigir aqui.
      'porModelo', COALESCE((
        SELECT jsonb_agg(x ORDER BY (x ->> 'pedidos')::int DESC) FROM (
          SELECT jsonb_build_object(
            'modelo', COALESCE(m.modelo, '(desconhecido)'),
            'conta', min(m.conta),
            'pedidos', count(*),
            'tokensEntrada', COALESCE(sum(m.tokens_entrada), 0),
            'tokensSaida', COALESCE(sum(m.tokens_saida), 0),
            'tokensPensamento', COALESCE(sum(m.tokens_pensamento), 0),
            'pesquisas', COALESCE(sum(m.n_pesquisas), 0),
            'custoEur', sum(m.custo_eur),
            'estimadoEur', COALESCE(sum(m.custo_estimado_eur), 0)
          ) AS x FROM m WHERE m.criado_em >= v_desde GROUP BY m.modelo
        ) t
      ), '[]'::jsonb),
      -- `estimadoMedidoEur` é a estimativa só das chamadas que TÊM euro
      -- medido: é contra ela que se mede o desvio. Contra a estimativa de
      -- todas, uma conta sem leituras punha a estimativa a parecer longa.
      'janela', (
        SELECT jsonb_build_object(
          'pedidos', count(*), 'custoEur', sum(m.custo_eur),
          'estimadoEur', COALESCE(sum(m.custo_estimado_eur), 0),
          'estimadoMedidoEur', COALESCE(sum(m.custo_estimado_eur) FILTER (WHERE m.custo_eur IS NOT NULL), 0)
        ) FROM m WHERE m.criado_em >= v_desde
      ),
      'total', (
        SELECT jsonb_build_object(
          'pedidos', count(*), 'custoEur', sum(m.custo_eur),
          'estimadoEur', COALESCE(sum(m.custo_estimado_eur), 0),
          'estimadoMedidoEur', COALESCE(sum(m.custo_estimado_eur) FILTER (WHERE m.custo_eur IS NOT NULL), 0)
        ) FROM m
      )
    )
  );
END;
$$;

-- ── Escrever uma leitura ───────────────────────────────────────────────
-- O valor vai na moeda da CONTA, como a consola o mostra. O DROP é da
-- assinatura de antes das duas contas (`p_valor_eur`, sem `p_conta`): ficar
-- ao lado desta era uma segunda porta para a mesma tabela, e a velha já
-- nem corria — escrevia em colunas que mudaram de nome.
DROP FUNCTION IF EXISTS ia_uso.registar_leitura(numeric, text, numeric, timestamptz, text);
CREATE OR REPLACE FUNCTION ia_uso.registar_leitura(
  p_valor numeric,
  p_tipo text DEFAULT 'saldo',
  p_carregado numeric DEFAULT 0,
  p_lido_em timestamptz DEFAULT NULL,
  p_nota text DEFAULT NULL,
  p_conta text DEFAULT 'google'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
DECLARE
  v_id bigint;
  v_quando timestamptz := COALESCE(p_lido_em, now());
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin regista leituras do saldo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ia_uso.contas WHERE conta = p_conta) THEN
    RAISE EXCEPTION 'Conta desconhecida.';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido.';
  END IF;
  IF COALESCE(p_tipo, '') NOT IN ('saldo', 'gasto') THEN
    RAISE EXCEPTION 'Tipo tem de ser saldo ou gasto.';
  END IF;
  -- Uma leitura no futuro apanhava chamadas que ainda não aconteceram.
  IF v_quando > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'Não se lê um saldo que ainda não existe.';
  END IF;

  INSERT INTO ia_uso.leituras (conta, lido_em, tipo, valor, carregado, nota)
  VALUES (p_conta, v_quando, p_tipo, p_valor, COALESCE(p_carregado, 0),
          NULLIF(trim(COALESCE(p_nota, '')), ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'lido_em', v_quando);
END;
$$;

CREATE OR REPLACE FUNCTION ia_uso.apagar_leitura(p_id bigint)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin apaga leituras do saldo.';
  END IF;
  DELETE FROM ia_uso.leituras WHERE id = p_id;
  RETURN 'ok';
END;
$$;

-- Com a moeda de cada uma, para o ecrã não ter de a ir buscar à parte.
CREATE OR REPLACE FUNCTION ia_uso.listar_leituras()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin vê as leituras do saldo.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(l) || jsonb_build_object('moeda', c.moeda) ORDER BY l.lido_em DESC)
      FROM ia_uso.leituras l JOIN ia_uso.contas c ON c.conta = l.conta
  ), '[]'::jsonb);
END;
$$;

-- ── As contas, a ler e o câmbio a acertar ─────────────────────────────
CREATE OR REPLACE FUNCTION ia_uso.listar_contas()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin vê as contas.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.conta <> 'google', c.conta) FROM ia_uso.contas c
  ), '[]'::jsonb);
END;
$$;

-- Só numa conta que não é em euros: a da Google é 1 por construção.
CREATE OR REPLACE FUNCTION ia_uso.definir_cambio(p_conta text, p_eur_por_unidade numeric)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin mexe no câmbio.';
  END IF;
  IF p_eur_por_unidade IS NULL OR p_eur_por_unidade <= 0 THEN
    RAISE EXCEPTION 'Câmbio inválido.';
  END IF;
  UPDATE ia_uso.contas SET eur_por_unidade = p_eur_por_unidade
   WHERE conta = p_conta AND moeda <> 'EUR';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Essa conta não tem câmbio.';
  END IF;
  RETURN 'ok';
END;
$$;

-- ── Os rácios, a ler e a afinar ────────────────────────────────────────
CREATE OR REPLACE FUNCTION ia_uso.listar_precos()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin vê os rácios.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.conta <> 'google', p.conta, p.modelo) FROM ia_uso.precos p
  ), '[]'::jsonb);
END;
$$;

-- `p_conta` a NULL mantém a de uma linha que já existe, e numa nova vai
-- buscar a do padrão que lhe serve (`claude-*`) — um Claude novo escrito
-- aqui sem conta não pode ir parar à Google.
DROP FUNCTION IF EXISTS ia_uso.definir_preco(text, numeric, numeric, numeric, numeric, text);
CREATE OR REPLACE FUNCTION ia_uso.definir_preco(
  p_modelo text,
  p_entrada numeric,
  p_saida numeric,
  p_pensamento numeric DEFAULT NULL,
  p_pesquisa numeric DEFAULT 0,
  p_nota text DEFAULT NULL,
  p_conta text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'ia_uso', 'public'
AS $$
BEGIN
  IF NOT ia_uso.sou_admin() THEN
    RAISE EXCEPTION 'Só o admin mexe nos rácios.';
  END IF;
  IF COALESCE(trim(p_modelo), '') = '' THEN
    RAISE EXCEPTION 'Falta o modelo.';
  END IF;
  INSERT INTO ia_uso.precos AS p (modelo, conta, eur_entrada_1m, eur_saida_1m,
                                  eur_pensamento_1m, eur_pesquisa, nota)
  VALUES (trim(p_modelo),
          COALESCE(p_conta, (ia_uso.preco_de(trim(p_modelo))).conta, 'google'),
          COALESCE(p_entrada, 0), COALESCE(p_saida, 0),
          p_pensamento, COALESCE(p_pesquisa, 0),
          NULLIF(trim(COALESCE(p_nota, '')), ''))
  ON CONFLICT (modelo) DO UPDATE SET
    conta             = COALESCE(p_conta, p.conta),
    eur_entrada_1m    = EXCLUDED.eur_entrada_1m,
    eur_saida_1m      = EXCLUDED.eur_saida_1m,
    eur_pensamento_1m = EXCLUDED.eur_pensamento_1m,
    eur_pesquisa      = EXCLUDED.eur_pesquisa,
    nota              = EXCLUDED.nota;
  RETURN 'ok';
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RLS, GRANTS e policies
-- ═══════════════════════════════════════════════════════════════════════
-- Mesmo desenho do `ia_uso.sql`: as funções que a app chama são SECURITY
-- DEFINER com o portão `sou_admin()` lá dentro, e as policies são o
-- segundo cinto para quem chegue às tabelas por REST. Sem os GRANTs nada
-- disto é alcançável — foi o bloco que faltou correr à primeira, em
-- 20/09/2026, e a avaria foi silenciosa.
--
-- As INTERNAS (`grounding`, `pesquisas`, `preco_de`, `conta_de`, `peso`,
-- `pesadas`, `fatores`, `calc`) ficam fechadas a quem tem login: não passam por
-- `sou_admin()` nenhum, e servem-se sozinhas de dentro das DEFINER, que
-- correm como o dono. Uma função nasce com EXECUTE para PUBLIC, e um REVOKE
-- esquecido não dá erro — dá uma porta aberta calada.
ALTER TABLE ia_uso.contas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_uso.leituras ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_uso.precos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_uso.funcoes  ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON ia_uso.contas, ia_uso.leituras, ia_uso.precos, ia_uso.funcoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ia_uso.contas, ia_uso.leituras, ia_uso.precos, ia_uso.funcoes TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ia_uso TO service_role;

GRANT EXECUTE ON FUNCTION
  ia_uso.janelas(), ia_uso.custos(integer, text, timestamptz),
  ia_uso.resumo_medido(integer), ia_uso.listar_leituras(),
  ia_uso.registar_leitura(numeric, text, numeric, timestamptz, text, text),
  ia_uso.apagar_leitura(bigint), ia_uso.listar_precos(),
  ia_uso.definir_preco(text, numeric, numeric, numeric, numeric, text, text),
  ia_uso.listar_contas(), ia_uso.definir_cambio(text, numeric)
  TO authenticated, service_role;

-- E REVOGAR, que o GRANT acima só acrescenta. Uma função nasce com
-- EXECUTE para PUBLIC, e o `ALTER DEFAULT PRIVILEGES` do `ia_uso.sql` dá
-- EXECUTE a `authenticated` em TODAS as funções novas deste schema — por
-- isso as internas nascem abertas às duas e é preciso fechá-las à mão.
-- Não vazavam (a RLS da `registos` é admin-only e as DEFINER têm o portão
-- lá dentro), mas a trava é para ser dupla, como no catálogo.
--
-- FUNÇÃO INTERNA NOVA = mais uma linha aqui. Não dá erro esquecê-la; dá
-- uma porta aberta calada, que é a pior espécie.
REVOKE ALL ON FUNCTION ia_uso.grounding(ia_uso.registos) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ia_uso.pesquisas(ia_uso.registos) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ia_uso.preco_de(text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ia_uso.conta_de(text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ia_uso.peso(ia_uso.registos, ia_uso.precos) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ia_uso.peso(ia_uso.registos)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ia_uso.pesadas()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ia_uso.fatores()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ia_uso.calc()                     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ia_uso.grounding(ia_uso.registos), ia_uso.pesquisas(ia_uso.registos),
  ia_uso.preco_de(text), ia_uso.conta_de(text), ia_uso.peso(ia_uso.registos, ia_uso.precos),
  ia_uso.peso(ia_uso.registos), ia_uso.pesadas(), ia_uso.fatores(), ia_uso.calc() TO service_role;

-- As que a app chama ficam fechadas ao anon — ninguém entra aqui sem
-- login, e o schema inteiro também não tem de estar à vista dele.
REVOKE ALL ON FUNCTION
  ia_uso.janelas(), ia_uso.custos(integer, text, timestamptz),
  ia_uso.resumo_medido(integer), ia_uso.listar_leituras(),
  ia_uso.registar_leitura(numeric, text, numeric, timestamptz, text, text),
  ia_uso.apagar_leitura(bigint), ia_uso.listar_precos(),
  ia_uso.definir_preco(text, numeric, numeric, numeric, numeric, text, text),
  ia_uso.listar_contas(), ia_uso.definir_cambio(text, numeric)
  FROM PUBLIC, anon;
REVOKE USAGE ON SCHEMA ia_uso FROM anon;

DROP POLICY IF EXISTS contas_admin_le ON ia_uso.contas;
CREATE POLICY contas_admin_le ON ia_uso.contas
  FOR SELECT TO authenticated USING (ia_uso.sou_admin());

DROP POLICY IF EXISTS leituras_admin_le ON ia_uso.leituras;
CREATE POLICY leituras_admin_le ON ia_uso.leituras
  FOR SELECT TO authenticated USING (ia_uso.sou_admin());

DROP POLICY IF EXISTS precos_admin_le ON ia_uso.precos;
CREATE POLICY precos_admin_le ON ia_uso.precos
  FOR SELECT TO authenticated USING (ia_uso.sou_admin());

DROP POLICY IF EXISTS funcoes_admin_le ON ia_uso.funcoes;
CREATE POLICY funcoes_admin_le ON ia_uso.funcoes
  FOR SELECT TO authenticated USING (ia_uso.sou_admin());

-- ── Conferir depois de correr ──────────────────────────────────────────
-- select count(*) from ia_uso.contas;                                 -- 2
-- select count(*) from ia_uso.precos;                                 -- 7
-- select has_function_privilege('authenticated','ia_uso.janelas()','EXECUTE');
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'ia_uso';                                       -- tudo false
-- select ia_uso.janelas();                                            -- [] sem leituras
-- select * from ia_uso.calc() limit 5;                                -- custo_eur a NULL
-- -- Nenhum Gemini na conta da Anthropic, e nenhum Claude na da Google:
-- select ia_uso.conta_de(modelo), modelo, count(*) from ia_uso.registos group by 1, 2;

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
-- SÓ AS DA SOMBRA: até ao deploy da `vinho-info` das 18:44 UTC desse dia.
-- Daí para a frente quem escreve no `ia_uso` é a própria function, e uma
-- comparação nova copiada daqui era a mesma chamada contada duas vezes.
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
           'origem', 'ia_comparacao', 'ia_comparacao_id', c.id, 'sombra', true,
           'fase', c.fase, 'nome', c.nome, 'ano', c.ano, 'modelo', x ->> 'modelo',
           'pesquisas', COALESCE((x ->> 'pesquisas')::int, 0),
           'custo_usd', (x ->> 'custo_usd')::numeric, 'stop_reason', x ->> 'stop_reason')
    FROM garrafeira.ia_comparacao c
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c.claude) = 'array' THEN c.claude ELSE '[]'::jsonb END) x
   WHERE c.criado_em < '2026-10-23 18:44:23+00'
     AND x ->> 'modelo' LIKE 'claude%'
     AND NOT EXISTS (
       SELECT 1 FROM ia_uso.registos r
        WHERE r.detalhe ->> 'origem' = 'ia_comparacao'
          AND r.detalhe ->> 'ia_comparacao_id' = c.id::text
          AND r.modelo = x ->> 'modelo');
END $$;

-- ── Conferir depois de correr ──────────────────────────────────────────
-- select modelo, count(*), sum((detalhe->>'custo_usd')::numeric) as usd
--   from ia_uso.registos where detalhe->>'origem' = 'ia_comparacao'
--  group by 1;                                   -- 11 + 11, 0,064 + 0,580 $

-- ── As duas leituras do Claude (o dono, 23/10/2026) ───────────────────
-- 5,00 $ antes da primeira chamada (reconstituída: 4,36 $ de agora + os
-- 0,64 $ gastos hoje) e 4,36 $ às 19:44 de Lisboa.
INSERT INTO ia_uso.leituras (conta, lido_em, tipo, valor, carregado, nota) VALUES
  ('anthropic', '2026-10-23 17:50:00+00', 'saldo', 5.00, 0,
   'reconstituída: 4,36 $ + os 0,64 $ gastos hoje, antes da 1.ª chamada'),
  ('anthropic', '2026-10-23 18:44:00+00', 'saldo', 4.36, 0, NULL)
ON CONFLICT (conta, lido_em) DO NOTHING;

COMMIT;

-- ── Confere: deve dar 2 contas, 7 rácios, 22 chamadas do Claude e uma
--    janela da Anthropic com 0,64 $ lidos e 0,5504 € repartidos.
SELECT (SELECT count(*) FROM ia_uso.contas) AS contas,
       (SELECT count(*) FROM ia_uso.precos) AS racios,
       (SELECT count(*) FROM ia_uso.registos WHERE detalhe ->> 'origem' = 'ia_comparacao') AS chamadas_claude,
       (SELECT jsonb_agg(jsonb_build_object('lidos', real_moeda, 'eur', real_eur, 'chamadas', chamadas, 'fator', round(fator, 4)))
          FROM ia_uso.fatores() WHERE conta = 'anthropic') AS janela_claude;
