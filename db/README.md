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
| 2 | `calibracao.sql` | o euro medido: `leituras`, `precos`, `fatores()`, `calc()`, `janelas()`, `custos()`, `resumo_medido()` |

Os dois são **idempotentes** — correm as vezes que forem precisas. O 2
depende do 1 (usa a `registos`, a `config` e a `sou_admin()`).

## Passos manuais no painel do Supabase

1. **Project Settings → API → Data API → Exposed schemas** tem de incluir
   `ia_uso`. Sem isso o PostgREST responde `PGRST106` e — pior — os
   INSERTs das nove Edge Functions são engolidos pelo `try/catch` delas: a
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

Nove Edge Functions, em seis repos. Nenhuma delas vive neste — a
`registarIaUso()` de cada uma é duplicada de propósito (cada Edge Function
deste projeto é auto-contida). **Mexer no que se grava é mexer nas nove.**

| app | functions | repo |
|---|---|---|
| `winecatalog` | `catalogo-info`, `catalogo-foto` | WineCatalog |
| `garrafeira` | `vinho-info`, `importar-vinhos` | Garrafeira |
| `wineselection` | `sugerir-vinho`, `verificar-vinhos` | WineSelection |
| `splitbill` | `fatura-restaurante` | SplitBill |
| `festasbv` | `fatura-ocr` | FestasBV |
| `goals` **ou** `splitbill` | `calendario-sporting` | Goals |

A última é a única que serve duas apps — o SplitBill lê o mesmo calendário
— e por isso grava a app de **quem chamou**, não um `goals` fixo.

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
