# `ia_uso` — a base de dados do controlo de custos

**Este repo é o dono do schema `ia_uso`.** A fonte de verdade é esta pasta,
e mais nenhuma.

Viveu até 22/09/2026 em `WineCatalog/db/ia_uso.sql`, porque foi de lá que
nasceu. Mudou-se pela mesma razão que o catálogo se mudou da Garrafeira
para a WineCatalog: **o `ia_uso` não é de nenhuma das seis apps que
escrevem nele.** Regista o gasto de todas, tem dono próprio
(`ia_uso.config.admin_email`, que não tem de ser o admin de nenhuma) e
agora tem app própria. Deixá-lo dentro de uma das consumidoras era dar a
quem herdasse essa app o poder sobre a tabela que mede as outras.

## A ordem

| # | ficheiro | o que traz |
|---|---|---|
| 1 | `ia_uso.sql` | o registo: `config`, `registos`, `sou_admin()`, `listar()`, `resumo()` |
| 2 | `calibracao.sql` | o euro medido: `contas` (Google e Anthropic), `leituras`, `precos`, `pesadas()`, `fatores()`, `calc()`, `janelas()`, `custos()`, `resumo_medido()` |
| 3 | `poupanca.sql` | o que o catálogo de vinhos poupou: `poupanca_catalogo()` |
| 4 | `funcionalidades.sql` | o custo por app e por funcionalidade: a coluna `registos.funcionalidade`, `funcionalidades` (os nomes), `funcionalidade()`, `resumo_apps()` |
| 5 | `utilizadores.sql` | o custo por utilizador: `custo_utilizadores()`, o cubo dia × app × utilizador |
| 6 | `claude_sombra.sql` | as 22 chamadas ao Claude do primeiro dia (23/10/2026), que só ficaram em `garrafeira.ia_comparacao` |

Os seis são **idempotentes** — correm as vezes que forem precisas. O 6
depende do 2 e da `garrafeira.ia_comparacao` (sem ela não faz nada). O 2
depende do 1, o 4 e o 5 do 1 e do 2 (usa a `registos`, a `config` e a `sou_admin()`). O 3 depende
do 1 e da vista `winecatalog.consumo`, que é da WineCatalog
(`WineCatalog/db/catalogo.sql`) — é a única coisa deste painel que não sai
da `registos`, porque um pedido servido pelo catálogo não chamou o Gemini e
por isso não deixou linha aqui.

`aplicar-duas-contas.sql` não entra na ordem: é o 2 e o 6 de 23/10/2026
juntos numa transação, com as duas leituras do Claude desse dia, para colar
**uma vez** no SQL Editor. Mexer no schema é mexer no 2 e no 6, nunca nele.

## Passos manuais no painel do Supabase

1. **Project Settings → API → Data API → Exposed schemas** tem de incluir
   `ia_uso`. Sem isso o PostgREST responde `PGRST106` e — pior — os
   INSERTs das Edge Functions são engolidos pelo `try/catch` delas: a
   tabela fica a zero **sem um único erro à vista**. Já aconteceu.
2. **Authentication → URL Configuration → Redirect URLs**: juntar o URL
   desta app (`https://diogoandrefsilva-ghc.github.io/AI-API-Control/`).

## Se a `ia_uso.registos` estiver vazia

Pela ordem, e só depois desconfiar do código:

1. o `ia_uso` está nos *Exposed schemas*?
2. o bloco de GRANTs do `ia_uso.sql` correu? (em 20/09/2026 não correu, e
   os INSERTs levavam 403 em silêncio durante um dia inteiro)
3. as Edge Functions estão deployed com a `registarIaUso()`?

```sql
select has_schema_privilege('service_role','ia_uso','USAGE')            as srv_usage,
       has_table_privilege('service_role','ia_uso.registos','INSERT')   as srv_insert,
       has_function_privilege('authenticated','ia_uso.resumo_medido(integer)','EXECUTE') as auth_exec;
select count(*) from pg_policies where schemaname = 'ia_uso';  -- 4
```

## Quem escreve aqui

Catorze Edge Functions, em oito repos. Nenhuma delas vive neste — a
`registarIaUso()` de cada uma é duplicada de propósito (cada Edge Function
deste projeto é auto-contida). **Mexer no que se grava é mexer em todas.**

| app | functions | repo |
|---|---|---|
| `winecatalog` | `catalogo-info`, `catalogo-foto` | WineCatalog |
| `garrafeira` | `vinho-info`, `importar-vinhos` | Garrafeira |
| `wineselection` | `sugerir-vinho`, `verificar-vinhos` | WineSelection |
| `splitbill` | `fatura-restaurante` | SplitBill |
| `festasbv` | `fatura-ocr` | FestasBV |
| `goals` **ou** `splitbill` | `calendario-sporting` | Goals |
| `garrafeira` | `garrafeira-carta`, `garrafeira-produtores`, `garrafeira-colheitas` | Garrafeira |
| `splitwisely` | `despesa-ia` | SplitWisely |
| `anniversarygifts` | `prendas-vinho` | AnniversaryGifts |

A última é a única que serve duas apps — o SplitBill lê o mesmo calendário
— e por isso grava a app de **quem chamou**, não um `goals` fixo.

## O contrato do registo (11/10/2026)

Todas as Edge Functions escrevem a `ia_uso.registos` **da mesma maneira** —
é o que deixa o painel somar e comparar apps sem pontas soltas:

- **uma linha por uso** que chegou ao fim (bem ou mal). Nada de `pedido`
  ("vai começar") aqui: isso é do `sync_log` de cada app. A `importar-vinhos`
  gravava-os e contava cada importação duas vezes;
- **`funcionalidade`** sempre que se sabe: a chave curta da coisa que a pessoa
  fez (`sites`, `lote`, `lista`, `grupo`…), com o nome legível na
  `ia_uso.funcionalidades`. Um pedido recusado antes de se saber o que era
  grava `entrada`. Sem coluna (o histórico), a `ia_uso.funcionalidade()`
  deduz do `detalhe`;
- `app`, `funcao`, `estado` (`ok`/`erro`), `modelo`, os quatro tokens do
  `usageMetadata`, `duracao_ms`, `quem`, `erro` e o `detalhe` inteiro;
- **`pesquisa_web`** só quando a chamada sabe se pesquisou; senão vale a
  regra da `ia_uso.funcoes` — e só para chamadas que chegaram ao Gemini;
- **uma função nova** entra na `ia_uso.funcoes` (com a `app`) e as suas
  funcionalidades na `ia_uso.funcionalidades`. Sem isso aparece no painel em
  "Funções sem regra" — e uma função listada que nunca escreveu aparece em
  "Nunca registaram".

### O Claude (23/10/2026)

O mesmo contrato, com três coisas a mais — é o que deixa o crédito da
Anthropic repartir-se só pelas chamadas do Claude:

- **uma linha é de UMA conta**. O `modelo` é o id tal e qual
  (`claude-haiku-5-5`); é por ele que a `ia_uso.precos` diz que a linha é da
  Anthropic. Uma procura que correu o Gemini E o Claude grava **duas
  linhas**, uma por conta, cada uma com os tokens dela. Uma linha
  "gemini-… + claude-…" fica sem euro e aparece no Resumo como mistura;
- os tokens vêm do `usage`: `input_tokens` → `tokens_entrada`,
  `output_tokens` → `tokens_saida` (o pensamento já vem lá dentro, por isso
  `tokens_pensamento` vai a 0), somados pelas voltas de um `pause_turn`;
- **`detalhe.pesquisas`** (número): quantas pesquisas o Claude fez na
  chamada (`usage.server_tool_use.web_search_requests`). Paga-se cada uma,
  e é este número que a `ia_uso.pesquisas()` conta.

A `vinho-info` deixou o Claude fora do `ia_uso` até a calibração saber de
contas (a linha `if (/claude/i.test(...)) return;` antes da
`registarIaUso()`). Com o `calibracao.sql` corrido, essa linha sai — e a
linha do Claude passa a levar o `pesquisas`.

**A ORDEM do deploy importa**: o `funcionalidades.sql` corre ANTES de se
fazer deploy de uma function que grave a coluna. Ao contrário, o PostgREST
recusa a coluna que não conhece, o `try/catch` engole o erro e as linhas
**perdem-se em silêncio** — a avaria de 20/09/2026 outra vez.

## Uma função nova nasce ABERTA

`EXECUTE` para `PUBLIC` é o defeito do Postgres, e o `ALTER DEFAULT
PRIVILEGES` do `ia_uso.sql` ainda acrescenta `authenticated` por cima. Um
`REVOKE` esquecido **não dá erro** — dá uma porta aberta calada. Confere
sempre depois de correr:

```sql
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'ia_uso';   -- anon tem de ser false em todas
```
