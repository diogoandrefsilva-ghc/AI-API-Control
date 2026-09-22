# AI-API-Control

Painel de controlo do que as apps pessoais gastam na API do Gemini.

**Sem build, sem npm.** Site estático (GitHub Pages), PWA. Lê o schema
`ia_uso` do projeto Supabase partilhado (`gjweqwfbnkgnibhajldc`) — o
registo central onde **nove Edge Functions, de seis apps**, gravam uma
linha por cada chamada ao Gemini.

## O que responde

- **quanto é que isto custa**, por app, por modelo, na janela e desde
  sempre;
- **o que correu mal**: os erros, e os 200 com o corpo vazio (o modelo
  gastou o orçamento a pensar e não escreveu uma letra — aparecem com
  tokens de entrada aos milhares e saída a zero);
- **quem está calado**: a última chamada de cada app. Um `sync_log` limpo
  numa app que não corre não é saúde, é desuso — e foi assim que duas
  avarias ficaram semanas por apanhar na WineSelection.

## O euro é MEDIDO, não adivinhado

É a decisão que separa esta app de um relatório bonito.

Cada Edge Function grava um `custo_estimado_eur` que sai de uma constante
escrita à mão lá dentro. Não é um preço publicado, ninguém a vai atualizar
quando a Google mexer na tabela, e a pesquisa Google — faturada à parte,
por pedido — não entra em nenhuma delas.

Por isso, **de vez em quando lê-se o saldo real da conta Google** e
regista-se aqui. Entre duas leituras há um euro observado; nessa janela a
`registos` tem todas as chamadas com os tokens de cada uma. A tabela
`ia_uso.precos` dá a **forma** (quanto vale um token de saída comparado
com um de entrada), a leitura dá a **escala**, e o fator da janela
reconcilia os dois.

**A soma das chamadas de uma janela dá exactamente o saldo lido** — por
construção, não por arredondamento. É a mesma regra que segura a divisão
da fatura no SplitBill e o rateio das compras no FestasBV.

O detalhe todo, com o que isto **não** consegue dizer, está em
`db/calibracao.sql` e no `CLAUDE.md`.

## Estrutura

| ficheiro | o que é |
|---|---|
| `index.html` | markup e os ecrãs de autenticação |
| `app.js` | toda a lógica (script normal, **não** module) |
| `style.css` | todo o CSS |
| `sw.js` | service worker (PWA) |
| `db/` | **fonte de verdade do schema `ia_uso`** — ver `db/README.md` |

## Acesso

Não há `allowed_users` aqui: o `ia_uso` tem **um dono só**
(`ia_uso.config.admin_email`), e passa-se com `ia_uso.definir_admin()`.
Quem entrar sem ser ele vê o ecrã de sem-acesso e mais nada — as funções
de leitura recusam do lado do servidor, não é a UI que protege.

## Deploy

GitHub Pages a partir de `main`. Um push para `main` publica
(`/AI-API-Control/`).
