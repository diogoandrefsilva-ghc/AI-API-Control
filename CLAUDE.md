# AI-API-Control — guia para o assistente

Painel de controlo do que as apps pessoais gastam na API do Gemini.
**Sem build, sem npm.** Site estático (GitHub Pages), PWA. Lê o schema
`ia_uso` do projeto Supabase partilhado (`gjweqwfbnkgnibhajldc`).

**Este repo é o DONO do schema `ia_uso`.** A fonte de verdade é `db/`, e
mais nenhuma. Esteve até 22/09/2026 em `WineCatalog/db/ia_uso.sql` porque
foi de lá que nasceu; mudou-se pela mesma razão que o catálogo se mudou da
Garrafeira para a WineCatalog — não é de nenhuma das seis apps que
escrevem nele. Lá ficou um ponteiro em `db/README.md` e **nenhuma cópia**.

## Estrutura
- `index.html` — só markup: os quatro separadores, os três ecrãs de
  autenticação, o splash e a ficha de um registo.
- `app.js` — toda a lógica (~950 linhas). Secções (`grep` pelo título, não
  leias o ficheiro todo): SESSÃO SUPABASE · RPC · ESCAPES · TOAST ·
  MODAIS · TABS · FORMATAÇÃO · **O 200 VAZIO** · **RESUMO** · REGISTOS ·
  **SALDO** · RÁCIOS · AUTH · INIT.
- `style.css` — todo o CSS. Ler o cabeçalho antes de lhe mexer: a cor é um
  sistema, não gosto.
- `sw.js` — service worker.
- `db/` — **fonte de verdade do schema `ia_uso`**; ver `db/README.md`.
- `tests/ecras.js` — o teste dos quatro ecrãs; ver `tests/README.md`.
- Não mexer à mão: `apple-touch-icon.png`, `icon-512.png` (são gerados —
  ver "Ícones").

## O EURO É MEDIDO, não adivinhado (é a decisão que segura tudo)
Cada uma das nove Edge Functions grava um `custo_estimado_eur` que sai de
uma constante escrita à mão lá dentro (`CUSTO_ANALISE_EUR`,
`CUSTO_CALENDARIO_EUR`…). Não é um preço publicado, ninguém a vai
atualizar quando a Google mexer na tabela, e a pesquisa Google — faturada
à parte, por pedido — não entra em nenhuma delas. Um número assim dá ordem
de grandeza; não controla custo nenhum.

Por isso: **de vez em quando lê-se o saldo real da conta Google**
(`ia_uso.leituras`) e entre duas leituras há um euro OBSERVADO. Nessa
janela a `registos` tem todas as chamadas com os tokens de cada uma.

- a **`ia_uso.precos`** dá a FORMA — quanto vale um token de saída
  comparado com um de entrada, este modelo comparado com aquele. São
  **rácios, não preços**, e é isso que os torna seguros de errar;
- o **peso** de uma chamada é a soma dos seus tokens a esses rácios, mais
  a pesquisa quando a houve;
- o **fator** da janela é o euro observado a dividir pela soma dos pesos.
  Se os rácios estiverem 20% curtos, o fator fica 20% maior e as contas
  fecham na mesma.

**A INVARIANTE: a soma das chamadas de uma janela dá EXACTAMENTE o saldo
lido** — por construção, não por arredondamento
(`Σ(peso × fator) = Σpeso × (real/Σpeso) = real`). É a mesma regra da
divisão da fatura no SplitBill e do rateio das compras no FestasBV. E é
por isso que **aqui não se arredonda ao cêntimo**: uma chamada custa
milésimos de euro, e arredondá-la punha metade a zero.

**O que isto NÃO consegue dizer**, e tem de continuar escrito no ecrã:
- dentro de uma janela, a repartição depende dos rácios. O TOTAL está
  certo; a chamada individual está tão certa quanto a `precos` estiver.
  Mais leituras não melhoram isso — o que melhora é mexer nos rácios e ver
  o `desvio` das janelas descer;
- as chamadas fora de qualquer janela levam o fator mais próximo e vêm
  `provisorio`. Nunca se calam nem se inventam;
- o `tokens_pensamento` esteve a NULL até 20/09/2026, por isso no
  histórico anterior o "200 vazio" pesa quase nada e leva menos euros do
  que gastou. O total da janela fica certo; a repartição dentro dela mente,
  e mente sempre no mesmo sentido.

**Sem uma leitura, `custo_eur` é NULL e o painel diz que está a mostrar a
estimativa.** NÃO se cai para o `custo_estimado_eur` às escondidas: um
número medido e um número adivinhado não se somam na mesma coluna sem se
dizer qual é qual. É a mesma regra da nota pesquisada vs. o palpite no
catálogo da WineCatalog.

## A pesquisa Google decide-se AQUI, não nas nove functions
A `registos.pesquisa_web` nunca teve um significado definido, e as nove
inventaram um cada uma: a `catalogo-info` e a `verificar-vinhos` pesquisam
**sempre** e não gravam a coluna; a `vinho-info` grava um ESTADO em texto,
verdadeiro tanto para o grounding da Google (faturado por pedido) como
para a pesquisa externa do motor `gratis` (paga a outro fornecedor); só a
`sugerir-vinho` e a `calendario-sporting` gravam um booleano a sério.

Isto não é arrumação: a pesquisa é a **maior parcela do peso** de uma
chamada pequena. Antes da correção, as chamadas da `catalogo-info` pesavam
~0,001 contra os ~0,030 das da `vinho-info` — pareciam trinta vezes mais
baratas só por lhes faltar a bandeira.

- **`ia_uso.funcoes`** diz, por função, se ela pesquisa sempre;
- **`ia_uso.grounding()`** decide do mais específico para o mais geral: o
  que a própria CHAMADA disser ganha à regra da FUNÇÃO. São a
  `sugerir-vinho` e a `calendario-sporting` que justificam essa ordem —
  podem cair numa variante SEM pesquisa a meio da mesma função, e o
  booleano delas sabe mais do que qualquer regra.

**Porquê na BD.** *"Que chamadas pagaram uma pesquisa à Google"* é uma
pergunta de CUSTO, logo é desta app — o mesmo movimento da
`winecatalog.forca()`, que decide quanto vale a afirmação de cada origem
em vez de pedir a cada escritor que se auto-declare. E arruma o
**histórico**, que já está escrito e não se redeploya.

**A rede para a décima função:** `semRegra` no resumo lista quem já
escreveu e não está no mapa. Sem isso, uma função nova que pesquise sempre
ficava com a pesquisa por contar e **a conta descia sozinha**, que é a pior
maneira de uma conta estar errada.

## O 200 vazio é o que este painel existe para mostrar
HTTP 200, `candidatesTokenCount: 0` — o modelo gastou o orçamento a PENSAR
e não escreveu uma letra. Paga-se a entrada e a pesquisa e não vem nada.
Durante meses passou por sucesso em quatro das nove functions (a lição
inteira está no `CLAUDE.md` da WineCatalog).

`ehVazio()` reconhece-o de **duas** maneiras, e são precisas as duas: as
functions já corrigidas fecham em `erro` com `passo: 'gemini_vazio'`; o
histórico anterior a 20/09/2026 ficou gravado como `ok` com zero tokens de
saída e milhares de entrada, e **esse não há deploy que o volte a
escrever**.

Na lista, uma linha que é `erro` **e** 200-vazio fica **âmbar, não
vermelha** — e é de propósito: o âmbar diz *porquê*, e "gastou e não veio
nada" é outra coisa de "o modelo rebentou". As duas pastilhas aparecem na
mesma. O vermelho fica para o erro sem explicação melhor.

## A cor é informação, não decoração
- **grafite** = a app, e o euro **MEDIDO** — a afirmação firme;
- **cinzento** = o euro **ESTIMADO**. Um palpite não se veste de facto, e
  é essa a diferença que este painel existe para mostrar;
- **âmbar** = provisório / por calibrar / 200 vazio. Não é erro, é "não
  sei ainda";
- **vermelho** = erro a sério; **verde** = correu bem.

Não dês cor própria a mais nada — sete famílias de cor lado a lado e
nenhuma quer dizer nada (a lição do cartão do vinho na Garrafeira).

## Armadilhas já mordidas
- **`min-width:max-content` nas tabelas.** Sem isso o browser encolhe a
  primeira coluna até `gemini-flash-lite-latest` se partir em quatro
  linhas, e a coluna do euro fica cortada. A tabela leva a largura que
  precisa e rola dentro do `.tw` — nunca faz a PÁGINA rolar de lado.
- **O EURO É A PRIMEIRA COLUNA de números.** É um painel de custos: o
  número que se veio ver não pode estar atrás de um scroll lateral.
- **`useGrouping:'always'`.** O defeito (`'auto'`) não agrupa números de
  quatro dígitos em pt-PT: a coluna ficava com `14 938` por cima de
  `4524`, com os milhares a mudar de sítio de linha para linha.
- **`toFixed()` devolve sempre PONTO.** Ao lado de `0,19 €` lê-se como
  outro número. Usa o `decFmt()`.
- **Nunca escrever `0,00 €` para um valor que existe** — isso lê-se como
  "não custou nada". O `eurFmt` devolve `< 0,01 €`.
- **Duas precisões para o euro, e não se misturam na mesma coluna.** Um
  TOTAL lê-se ao cêntimo; uma CHAMADA custa milésimos e ao cêntimo
  aparecia toda a zero. Com casas diferentes por linha, a coluna deixa de
  alinhar.
- **Não há regra global de `button` nesta folha**, de propósito: um
  `button:hover` global ganha em especificidade a qualquer classe e no
  telemóvel o `:hover` fica colado depois do toque. Cada classe pinta-se a
  si própria, e o desativado leva `pointer-events:none`.
- **`appearance:none` apaga o desenho nativo das checkboxes.** Não há
  nenhuma aqui; se acrescentares uma, dá-lhe `appearance:checkbox` e
  desfaz o padding/borda herdados.

## Regras técnicas (não partir a app)
- `app.js` carrega como `<script src>` **normal, NÃO module** — há
  `onclick="…"` no HTML e no HTML gerado, as funções têm de ser globais.
- **PWA/cache:** se mexeres em `app.js`, `style.css` ou `index.html`,
  **sobe `CACHE_NAME` no `sw.js`** (`aic-cache-v1` → `v2`). Os três são
  network-first — sem isso, num deploy o browser apanha o `index.html`
  novo com o `app.js` VELHO da cache: botões novos a chamar funções que
  ainda não existem, sem erro visível. Aconteceu no Goals.
- **Supabase:** schema `ia_uso`, `Accept-Profile`/`Content-Profile` em
  todos os pedidos (`sbHeaders`) — é isso que aponta para o schema, nunca
  vai no URL. A chave no topo do `app.js` é a **`anon`** (pública, por
  design), protegida por RLS + login. **Não é bug nem risco — não a
  "corrijas" nem a escondas.**
- **Não há um único SELECT em cru.** As tabelas do `ia_uso` têm RLS
  admin-only e tudo passa por funções SECURITY DEFINER com o portão
  `ia_uso.sou_admin()` lá dentro. A UI só decide o que mostrar.
- **Uma função nova nasce ABERTA** (`EXECUTE` para `PUBLIC`, mais o
  `ALTER DEFAULT PRIVILEGES` que dá `authenticated`). Um `REVOKE`
  esquecido não dá erro — dá uma porta aberta calada. Já aconteceu neste
  schema; ver o `db/README.md` para a consulta que o confere.
- **Alterar o schema:** edita primeiro `db/*.sql` (fonte de verdade) e só
  depois corre no SQL Editor — nunca ao contrário.
- **`m.*::ia_uso.registos` sobre um CTE com colunas a mais** é um `record`
  com colunas a mais, o Postgres recusa-o, e **só o diz quando a função
  CORRE**: a migração passa e o painel morre. A linha tem de ser pesada
  ANTES de entrar no CTE. É a mesma pedra da `winecatalog.listar`.
- Faz **edições cirúrgicas** (diffs pequenos). Nunca reescrevas o ficheiro
  inteiro.

## Sem `allowed_users`
Ao contrário das apps irmãs, o `ia_uso` tem **um dono só**
(`ia_uso.config.admin_email`) e não tem `allowed_users` nem
`access_requests`. Passa-se por `ia_uso.definir_admin()` no SQL Editor —
não há a quem pedir acesso de dentro da app, e por isso o ecrã de
sem-acesso **não tem botão nenhum a prometê-lo**.

## Ícones
Gerados por um script Python descartável (codificador PNG à mão, com
`zlib` — não há PIL neste ambiente). Barras brancas sobre grafite, com a
última a âmbar; fundo a sangrar porque são `maskable`, com o desenho nos
80% centrais. Para os mudar, escreve outro script assim.

## Deploy
GitHub Pages a partir de `main`. Um push para `main` publica
(`/AI-API-Control/`).
