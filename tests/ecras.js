const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const RAIZ = process.env.AIC_RAIZ || require('path').resolve(__dirname, '..');
const TIPOS = {'.html':'text/html','.js':'text/javascript','.css':'text/css',
               '.json':'application/json','.png':'image/png'};
const srv = http.createServer((req,res)=>{
  let p = req.url.split('?')[0];
  if (p === '/' ) p = '/index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, {'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream'});
  res.end(fs.readFileSync(f));
});

// ── Dados reais da base (7 chamadas de 20/09) ──
const REGISTOS = [
  {id:7,funcionalidade:'procurar',criado_em:'2026-09-20T14:32:19.117Z',app:'garrafeira',funcao:'vinho-info',estado:'ok',
   modelo:'gemini-flash-lite-latest',pesquisa_web:true,tokens_entrada:993,tokens_saida:485,
   tokens_pensamento:null,custo_estimado_eur:0.001,duracao_ms:8210,quem:'a@b.c',erro:null,
   detalhe:{modo:'barato',pesquisa:'grounding:google_search',campos:5},
   conta:'google',peso:0.030321,fator:1.0502,custo_eur:0.031843,provisorio:false},
  {id:6,funcionalidade:'procurar',criado_em:'2026-09-20T14:18:02.069Z',app:'winecatalog',funcao:'catalogo-info',estado:'ok',
   modelo:'gemini-flash-lite-latest',pesquisa_web:null,tokens_entrada:1137,tokens_saida:505,
   tokens_pensamento:null,custo_estimado_eur:0.01,duracao_ms:6100,quem:'a@b.c',erro:null,
   detalhe:{campos:1,manual:false,vinho_id:162,propostos:1,fontes:0},
   conta:'google',peso:0.030316,fator:1.0502,custo_eur:0.031838,provisorio:false},
  {id:5,funcionalidade:'procurar',criado_em:'2026-09-20T14:05:47.019Z',app:'winecatalog',funcao:'catalogo-info',estado:'ok',
   modelo:'gemini-flash-latest',pesquisa_web:null,tokens_entrada:5989,tokens_saida:0,
   tokens_pensamento:null,custo_estimado_eur:0.01,duracao_ms:21400,quem:'a@b.c',erro:null,
   detalhe:{passo:'sem_campos',campos:0,modelo:'gemini-flash-latest',finishReason:'MAX_TOKENS',
            usageMetadata:{promptTokenCount:5989,candidatesTokenCount:0,totalTokenCount:10966}},
   conta:'google',peso:0.031797,fator:1.0502,custo_eur:0.033394,provisorio:false},
  {id:4,funcionalidade:'procurar',criado_em:'2026-09-20T13:56:07.711Z',app:'winecatalog',funcao:'catalogo-info',estado:'erro',
   modelo:'gemini-flash-latest',pesquisa_web:null,tokens_entrada:3292,tokens_saida:0,
   tokens_pensamento:null,custo_estimado_eur:0.01,duracao_ms:18000,quem:'a@b.c',
   erro:'o modelo não devolveu resposta (MAX_TOKENS)',
   detalhe:{passo:'gemini_vazio',finishReason:'MAX_TOKENS'},
   conta:'google',peso:0.030988,fator:1.0502,custo_eur:0.032544,provisorio:false}
  ,{id:3,funcionalidade:'sugerir',criado_em:'2026-09-20T13:40:00.000Z',app:'wineselection',funcao:'sugerir-vinho',estado:'erro',
   modelo:'gemini-flash-latest',pesquisa_web:true,tokens_entrada:0,tokens_saida:0,
   tokens_pensamento:null,custo_estimado_eur:0,duracao_ms:2100,quem:'a@b.c',
   erro:'gemini 503 (gemini-flash-latest): The model is overloaded.',
   detalhe:{passo:'gemini',status:503,pesquisa:true},
   conta:'google',peso:0.030,fator:1.0502,custo_eur:0.03151,provisorio:true}
];
const PRECOS = [
  {modelo:'*',conta:'google',eur_entrada_1m:0.10,eur_saida_1m:0.40,eur_pensamento_1m:null,eur_pesquisa:0.030,nota:'linha de recurso'},
  {modelo:'gemini-flash-latest',conta:'google',eur_entrada_1m:0.30,eur_saida_1m:2.50,eur_pensamento_1m:null,eur_pesquisa:0.030,nota:'o ponteiro do flash'},
  {modelo:'gemini-flash-lite-latest',conta:'google',eur_entrada_1m:0.10,eur_saida_1m:0.40,eur_pensamento_1m:null,eur_pesquisa:0.030,nota:'o ponteiro do lite'},
  {modelo:'claude-*',conta:'anthropic',eur_entrada_1m:2,eur_saida_1m:10,eur_pensamento_1m:null,eur_pesquisa:0.010,nota:'um Claude que ainda não está aqui'},
  {modelo:'claude-haiku-5-5',conta:'anthropic',eur_entrada_1m:0.10,eur_saida_1m:0.50,eur_pensamento_1m:null,eur_pesquisa:0.010,nota:'tabela da Anthropic em dólares'}
];
// As duas contas (db/calibracao.sql): o Gemini em euros, o Claude em dólares.
const CONTAS = [
  {conta:'google',nome:'Gemini',moeda:'EUR',eur_por_unidade:1,nota:null},
  {conta:'anthropic',nome:'Claude',moeda:'USD',eur_por_unidade:0.86,nota:null}
];
// `claude` diz se a conta da Anthropic tem leituras: com a Google calibrada
// e a Anthropic não, as chamadas do Claude ficam fora do medido — e dito.
function resumo(calibrado, claude){
  const cc = calibrado && claude !== false;
  return {janelaDias:30,calibrado,semRegra:[],mistas:0,
    contas:[
      {conta:'google',nome:'Gemini',moeda:'EUR',eurPorUnidade:1,calibrado,pedidos:7,
       custoEur:calibrado?0.1700:null,estimadoEur:0.04,semMedida:calibrado?0:7,semMedidaEstEur:calibrado?0:0.04,
       ultimaLeitura:'2026-09-22T09:00:00Z'},
      {conta:'anthropic',nome:'Claude',moeda:'USD',eurPorUnidade:0.86,calibrado:cc,pedidos:2,
       custoEur:cc?0.0223:null,estimadoEur:0.003,semMedida:cc?0:2,semMedidaEstEur:cc?0:0.003,
       ultimaLeitura:cc?'2026-10-23T18:44:00Z':null}],
    porApp:[
      {app:'winecatalog',pedidos:4,ok:3,erro:1,tokensEntrada:14433,tokensSaida:505,
       tokensPensamento:0,pesquisas:4,custoEur:calibrado?0.0968:null,estimadoEur:0.04,
       provisorio:false,ultimaChamada:'2026-09-20T14:18:02.069Z'},
      {app:'garrafeira',pedidos:3,ok:3,erro:0,tokensEntrada:2983,tokensSaida:1541,
       tokensPensamento:0,pesquisas:3,custoEur:calibrado?0.0955:null,estimadoEur:0.003,
       provisorio:false,ultimaChamada:'2026-09-20T14:32:19.117Z'}],
    porModelo:[
      {modelo:'gemini-flash-latest',conta:'google',pedidos:3,tokensEntrada:13296,tokensSaida:0,
       tokensPensamento:0,pesquisas:3,custoEur:calibrado?0.0710:null,estimadoEur:0.03},
      {modelo:'claude-haiku-5-5',conta:'anthropic',pedidos:2,tokensEntrada:9200,tokensSaida:1800,
       tokensPensamento:0,pesquisas:3,custoEur:cc?0.0223:null,estimadoEur:0.003},
      {modelo:'gemini-flash-lite-latest',conta:'google',pedidos:4,tokensEntrada:4120,tokensSaida:2046,
       tokensPensamento:0,pesquisas:4,custoEur:calibrado?0.0990:null,estimadoEur:0.013}],
    janela:{pedidos:9,custoEur:calibrado?(cc?0.1923:0.1700):null,estimadoEur:0.046,estimadoMedidoEur:cc?0.046:0.043},
    total:{pedidos:9,custoEur:calibrado?(cc?0.1923:0.1700):null,estimadoEur:0.046,estimadoMedidoEur:cc?0.046:0.043}};
}
// Por app e por funcionalidade (db/funcionalidades.sql). A splitwisely
// não chamou nada na janela: tem de aparecer como calada, e sem cartão.
function resumoApps(calibrado){
  const f = (o) => Object.assign({erro:0,vazios:0,pesquisas:0,provisorio:false,
    ultimaChamada:'2026-09-20T14:32:19.117Z',tokensMedios:1500}, o);
  return {janelaDias:30,calibrado,
    apps:[
      {app:'garrafeira',usos:3,ok:2,erro:1,vazios:0,serper:3,custoEur:calibrado?0.0955:null,estimadoEur:0.003,
       provisorio:false,ultimaChamada:'2026-09-20T14:32:19.117Z',funcionalidades:[
        f({funcao:'vinho-info',chave:'procurar',nome:'Procurar informação · perguntar à IA',usos:1,ok:1,
           custoEur:calibrado?0.0318:null,estimadoEur:0.001,medioEur:calibrado?0.0318:null,medioEstEur:0.001,pesquisas:1}),
        f({funcao:'vinho-info',chave:'sites',nome:'Procurar informação · em sites concretos',usos:1,ok:1,
           custoEur:calibrado?0.0637:null,estimadoEur:0.002,medioEur:calibrado?0.0637:null,medioEstEur:0.002,serper:3}),
        f({funcao:'vinho-info',chave:'entrada',nome:'Recusado à entrada',usos:1,ok:0,erro:1,
           custoEur:calibrado?0:null,estimadoEur:0,medioEur:null,medioEstEur:null,tokensMedios:null})]},
      {app:'winecatalog',usos:4,ok:3,erro:1,vazios:2,custoEur:calibrado?0.0968:null,estimadoEur:0.04,
       provisorio:false,ultimaChamada:'2026-09-20T14:18:02.069Z',funcionalidades:[
        f({funcao:'catalogo-info',chave:'procurar',nome:'Procurar ficha do vinho',usos:4,ok:3,erro:1,vazios:2,
           custoEur:calibrado?0.0968:null,estimadoEur:0.04,medioEur:calibrado?0.0323:null,medioEstEur:0.0133,pesquisas:4})]},
      {app:'splitwisely',usos:0,ok:0,erro:0,vazios:0,custoEur:null,estimadoEur:0,provisorio:false,
       ultimaChamada:'2026-08-01T10:00:00Z',funcionalidades:[]}],
    semRegisto:[{funcao:'fatura-ocr',app:'festasbv'}]};
}
// O cubo do custo por utilizador (db/utilizadores.sql): dia × app × quem.
// As datas são as de hoje e de ontem — o filtro da janela é da base.
const DIA = (n) => { const d = new Date(Date.now() - n * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const CUBO = (calibrado) => ({janelaDias:30,calibrado,linhas:[
  {dia:DIA(0),app:'garrafeira',quem:'a@b.c',usos:3,ok:3,erro:0,custoEur:calibrado?0.30:null,estimadoEur:0.01,provisorio:false},
  {dia:DIA(0),app:'garrafeira',quem:null,usos:1,ok:1,erro:0,custoEur:calibrado?0.05:null,estimadoEur:0.002,provisorio:false},
  {dia:DIA(1),app:'garrafeira',quem:'pedro@x.pt',usos:2,ok:1,erro:1,custoEur:calibrado?0.12:null,estimadoEur:0.004,provisorio:true},
  {dia:DIA(1),app:'winecatalog',quem:'a@b.c',usos:4,ok:4,erro:0,custoEur:calibrado?0.20:null,estimadoEur:0.04,provisorio:false}]});
const JANELAS = [
  // A Google atrasou-se: a janela das chamadas deu 0,00 € e a seguinte
  // apareceu com o euro e sem chamadas — o `fatores()` juntou-as.
  {leitura_id:5,conta:'google',moeda:'EUR',de:'2026-09-30T08:00:00Z',ate:'2026-09-30T16:00:00Z',tipo:'saldo',
   real_moeda:0.09,real_eur:0.09,chamadas:21,peso_total:0.0196,estimado_eur:0.02,fator:4.589,
   nota:null,desvio:3.5,leituras:2,pendente:false},
  {leitura_id:6,conta:'google',moeda:'EUR',de:'2026-09-30T16:00:00Z',ate:'2026-09-30T17:00:00Z',tipo:'saldo',
   real_moeda:0,real_eur:0,chamadas:1,peso_total:0.001,estimado_eur:0.001,fator:null,
   nota:null,desvio:-1,leituras:1,pendente:true},
  {leitura_id:2,conta:'google',moeda:'EUR',de:'2026-09-20T13:00:00Z',ate:'2026-09-22T09:00:00Z',tipo:'saldo',
   real_moeda:0.1923,real_eur:0.1923,chamadas:7,peso_total:0.18311,estimado_eur:0.043,fator:1.0502,
   nota:'primeira leitura a sério',desvio:3.4721},
  {leitura_id:3,conta:'google',moeda:'EUR',de:'2026-09-22T09:00:00Z',ate:'2026-09-22T11:00:00Z',tipo:'gasto',
   real_moeda:null,real_eur:null,chamadas:0,peso_total:0,estimado_eur:0,fator:null,nota:'troquei de feitio',desvio:null},
  // A primeira janela do Claude (23/10/2026): 5,00 $ → 4,36 $, a 0,86 € por dólar.
  {leitura_id:91,conta:'anthropic',moeda:'USD',de:'2026-10-23T17:50:00Z',ate:'2026-10-23T18:44:00Z',tipo:'saldo',
   real_moeda:0.64,real_eur:0.5504,chamadas:22,peso_total:0.6441,estimado_eur:0.5539,fator:0.8545,
   nota:null,desvio:-0.0064,leituras:1,pendente:false}
];
const LEITURAS = [
  {id:91,conta:'anthropic',moeda:'USD',lido_em:'2026-10-23T18:44:00Z',tipo:'saldo',valor:4.36,carregado:0,nota:null},
  {id:90,conta:'anthropic',moeda:'USD',lido_em:'2026-10-23T17:50:00Z',tipo:'saldo',valor:5.00,carregado:0,nota:'4,36 + 0,64 de hoje'},
  {id:3,conta:'google',moeda:'EUR',lido_em:'2026-09-22T11:00:00Z',tipo:'gasto',valor:1.2,carregado:0,nota:'troquei de feitio'},
  {id:2,conta:'google',moeda:'EUR',lido_em:'2026-09-22T09:00:00Z',tipo:'saldo',valor:49.81,carregado:0,nota:null},
  {id:1,conta:'google',moeda:'EUR',lido_em:'2026-09-20T13:00:00Z',tipo:'saldo',valor:50.0,carregado:0,nota:'primeira leitura a sério'}
];
// O que o catálogo de vinhos poupou (db/poupanca.sql) — cada ação na sua
// unidade, porque campos, notas e vinhos não se somam.
const POUPANCA = {
  desde: '2026-08-24T00:00:00Z',
  total: { pedidos: 260, pedidosCatalogo: 3, poupadoEstimado: 0.0123 },
  porAcao: [
    {app:'garrafeira',acao:'vinho-info',unidade:'campos',pedidos:240,pedidosCatalogo:3,
     itensCatalogo:412,itensIA:1880,poupadoEstimado:0.0123},
    {app:'wineselection',acao:'sugerir_vinho',unidade:'notas',pedidos:18,pedidosCatalogo:0,
     itensCatalogo:9,itensIA:61,poupadoEstimado:0},
    {app:'wineselection',acao:'verificar_vinhos',unidade:'vinhos',pedidos:2,pedidosCatalogo:0,
     itensCatalogo:1,itensIA:7,poupadoEstimado:0}
  ]
};

(async () => {
  await new Promise(r => srv.listen(8099, r));
  const browser = await chromium.launch({ executablePath: process.env.AIC_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  const erros = [];
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) erros.push('console: ' + m.text()); });
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  // O /favicon.ico é pedido pelo browser e não existe — não é avaria da app.
  page.on('response', r => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico'))
      erros.push('HTTP ' + r.status() + ' em ' + r.url());
  });

  let CALIBRADO = false, CLAUDE = true;
  await page.route('**/auth/v1/user', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 'u1', email: 'diogo.andre.f.silva@gmail.com' }) }));
  await page.route('**/rest/v1/rpc/*', r => {
    const fn = r.request().url().split('/rpc/')[1].split('?')[0];
    const args = JSON.parse(r.request().postData() || '{}');
    const custos = REGISTOS.filter(x => !args.p_app || x.app === args.p_app);
    const mapa = { sou_admin: true, resumo_medido: resumo(CALIBRADO, CLAUDE), listar_contas: CONTAS, resumo_apps: resumoApps(CALIBRADO), custos, custo_utilizadores: CUBO(CALIBRADO),
                   janelas: JANELAS, listar_leituras: LEITURAS, listar_precos: PRECOS,
                   poupanca_catalogo: POUPANCA };
    if (!(fn in mapa)) return r.fulfill({ status: 404, body: '{"message":"fn desconhecida: ' + fn + '"}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mapa[fn]) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('aic_sb_session', JSON.stringify({
      access_token: 'fake', refresh_token: 'fake',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { email: 'diogo.andre.f.silva@gmail.com' } }));
    localStorage.setItem('aic_tab', 'resumo');
  });

  const passos = [];
  const ok = (n, c) => passos.push((c ? '  ok  ' : 'FALHA ') + n);

  await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  ok('splash escondido', await page.locator('#splash').evaluate(e => e.style.display === 'none'));
  ok('app visível', await page.locator('#app-sec').isVisible());
  ok('login escondido', !(await page.locator('#page-login').isVisible()));

  // Resumo por calibrar
  ok('aviso "sem leitura"', (await page.locator('#rs-aviso').innerText()).includes('leitura de saldo'));
  ok('medido a "—" sem calibração', (await page.locator('#rs-topo .hero-v').innerText()).trim() === '—');
  ok('estimativa visível', (await page.locator('#rs-topo .hero-ev').innerText()).includes('0,05'));
  ok('custo por app: um cartão por app com uso', await page.locator('#rs-apps .cd').count() === 2);
  ok('app sem uso dita como calada', (await page.locator('#rs-apps .ap-cal').last().innerText()).includes('splitwisely'));
  ok('função que nunca registou à vista', (await page.locator('#rs-apps .aviso').innerText()).includes('fatura-ocr'));
  // A entrada não é uma funcionalidade: fica fora da grelha (está na ficha da app).
  ok('um cartão por funcionalidade, sem a entrada', await page.locator('#rs-funcs .cd').count() === 3
     && !(await page.locator('#rs-funcs').innerText()).includes('Recusado'));
  ok('sem calibração, o euro da app vem a cinzento', await page.locator('#rs-apps .cd-e.eur-est').count() === 2);
  ok('sem calibração, a barra também', await page.locator('#rs-apps .bar.est').count() === 2);
  ok('marca "vazio" no modelo sem saída', await page.locator('#rs-modelos .tag.wn').count() >= 1);
  ok('catálogo: 3 ações, cada uma na sua unidade', await page.locator('#rs-catalogo tbody tr').count() === 3
     && (await page.locator('#rs-catalogo tbody').innerText()).includes('notas'));
  ok('catálogo: poupança dita como estimativa', (await page.locator('#rs-catalogo').innerText()).includes('estimativa em cima de uma estimativa'));
  await page.screenshot({ path: '/tmp/aic-1-resumo-porcalibrar.png', fullPage: true });

  // Resumo calibrado
  CALIBRADO = true;
  await page.evaluate(() => rsCarregar());
  await page.waitForTimeout(300);
  ok('medido aparece com calibração', (await page.locator('#rs-topo .hero-v').innerText()).includes('0,19'));
  ok('aviso desaparece', !(await page.locator('#rs-aviso').innerText()).includes('leitura de saldo'));
  ok('desvio dito', (await page.locator('#rs-topo .hero-dv').innerText()).toLowerCase().includes('curta'));
  ok('app mais cara primeiro', (await page.locator('#rs-apps .cd-n >> nth=0').innerText()).includes('garrafeira'));
  ok('euro medido da app a tinta', await page.locator('#rs-apps .cd-e.eur-med').count() === 2);
  // A mais cara POR USO primeiro, de todas as apps: sites (0,0637), depois
  // a do catálogo (0,0323), depois perguntar à IA (0,0318).
  const fns = await page.locator('#rs-funcs .cd-t').allInnerTexts();
  ok('funcionalidades pelo custo médio, a mais cara primeiro', fns[0].includes('sites concretos')
     && fns[1].includes('ficha do vinho') && fns[2].includes('perguntar à IA'));
  ok('o cartão diz de que app é', (await page.locator('#rs-funcs .cd >> nth=1').locator('.cd-a').innerText()).toLowerCase().includes('winecatalog'));
  ok('médio por uso a 4 casas', (await page.locator('#rs-funcs .cd-fe >> nth=0').innerText()).includes('0,0637'));
  ok('Serper contado (sem euro)', (await page.locator('#rs-apps').innerText()).includes('3 consultas ao Serper')
     && (await page.locator('#rs-funcs .cd >> nth=0').innerText()).includes('3 Serper'));
  ok('vazios ditos na funcionalidade', (await page.locator('#rs-funcs').innerText()).includes('2 vazios'));
  ok('"poucos usos" num médio de 1 uso', await page.locator('#rs-funcs .cd >> nth=0').locator('.tag', { hasText: 'poucos usos' }).count() === 1);
  ok('modelos em cartões, com o vazio marcado', await page.locator('#rs-modelos .cd').count() === 3);
  // O Claude ao lado do Gemini: cada modelo diz de que conta é, o mais caro
  // vem primeiro, e o pensamento do Claude não se lê como zero.
  ok('cada modelo diz de que conta é', (await page.locator('#rs-modelos .cd-a').allInnerTexts())
     .map(t => t.toLowerCase()).join('|') === 'gemini|gemini|claude');
  ok('o modelo mais caro primeiro', (await page.locator('#rs-modelos .cd-n >> nth=0').innerText()) === 'gemini-flash-lite-latest');
  ok('no Claude o pensamento vem na saída', (await page.locator('#rs-modelos .cd >> nth=2').innerText()).includes('na saída'));
  ok('as pesquisas do modelo contadas', (await page.locator('#rs-modelos .cd >> nth=2').innerText()).includes('3 pesquisas'));
  ok('o medido dividido pelas duas contas', (await page.locator('#rs-topo').innerText()).includes('Claude 0,02'));
  await page.screenshot({ path: '/tmp/aic-2-resumo.png', fullPage: true });

  // A Google calibrada e a Anthropic não: o Claude fica fora do medido, e
  // diz-se — com o botão que leva ao saldo dele.
  CLAUDE = false;
  await page.evaluate(() => rsCarregar());
  await page.waitForTimeout(300);
  ok('Claude sem leitura: dito em cima', (await page.locator('#rs-aviso').innerText()).includes('O Claude ainda não tem leitura de saldo'));
  ok('Claude sem leitura: "por medir", não zero', (await page.locator('#rs-topo').innerText()).includes('Claude por medir'));
  ok('Claude sem leitura: o desvio só das medidas', (await page.locator('#rs-topo .hero-dv').innerText()).toLowerCase().includes('curta'));
  await page.screenshot({ path: '/tmp/aic-2a-resumo-claude-por-medir.png', fullPage: true });
  await page.click('#rs-aviso button:has-text("Claude")');
  await page.waitForTimeout(400);
  ok('o botão abre o saldo do Claude', await page.locator('#t-saldo').isVisible()
     && (await page.locator('#lt-conta-segs .seg.on').innerText()) === 'Claude');
  CLAUDE = true;
  await page.click('.it[data-tab="resumo"]');
  await page.waitForTimeout(400);

  // A ficha de uma app: os números, o gráfico e as funcionalidades dela.
  await page.click('#rs-apps .cd >> nth=0');
  await page.waitForTimeout(300);
  ok('ficha da app abre', await page.locator('#modal-rs').isVisible()
     && (await page.locator('#rs-sh-titulo').innerText()) === 'garrafeira');
  ok('ficha da app: gasto e parte do total', (await page.locator('#rs-sh-corpo .kpi >> nth=0').innerText()).includes('0,10')
     && (await page.locator('#rs-sh-corpo .kpi >> nth=0').innerText()).includes('% do total'));
  ok('ficha da app: ok e erros na barra', await page.locator('#rs-sh-corpo .est-b i').count() === 2);
  ok('ficha da app: o gráfico tem um dia por coluna', await page.locator('#rs-sh-graf .gr-c').count() === 31);
  ok('ficha da app: as funcionalidades dela, e a entrada à parte', await page.locator('#rs-sh-corpo .cd').count() === 2
     && await page.locator('#rs-sh-corpo .ent').count() === 1);
  await page.screenshot({ path: '/tmp/aic-2b-ficha-app.png' });

  // Da app para uma funcionalidade, e o "‹" volta.
  await page.click('#rs-sh-corpo .cd >> nth=1');
  await page.waitForTimeout(300);
  ok('funcionalidade abre dentro da ficha', (await page.locator('#rs-sh-titulo').innerText()).includes('perguntar à IA')
     && await page.locator('#rs-sh-volta').isVisible());
  ok('funcionalidade: a pesquisa Google contada', (await page.locator('#rs-sh-corpo .kv').innerText()).includes('1 de 1'));
  ok('funcionalidade: só as chamadas DELA', await page.locator('#rs-sh-lista .rlin').count() === 1);
  ok('o gráfico lê-se ao tocar', await (async () => {
    await page.locator('#rs-sh-graf .gr-c >> nth=-1').dispatchEvent('pointerdown');
    return (await page.locator('#rs-sh-graf .gr-r').innerText()).includes('chamada');
  })());
  await page.click('#rs-sh-volta');
  await page.waitForTimeout(200);
  ok('"‹" volta à app', (await page.locator('#rs-sh-titulo').innerText()) === 'garrafeira'
     && !(await page.locator('#rs-sh-volta').isVisible()));

  // Do cartão de uma funcionalidade do ecrã, direto à ficha dela; de uma
  // chamada, a ficha do registo POR CIMA, e o Escape fecha uma de cada vez.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Escape fecha a ficha da app', !(await page.locator('#modal-rs').isVisible()));
  await page.click('#rs-funcs .cd >> nth=1');
  await page.waitForTimeout(300);
  ok('funcionalidade abre do ecrã, sem "‹"', (await page.locator('#rs-sh-titulo').innerText()).includes('ficha do vinho')
     && !(await page.locator('#rs-sh-volta').isVisible()));
  ok('funcionalidade: as 3 chamadas da catalogo-info', await page.locator('#rs-sh-lista .rlin').count() === 3
     && await page.locator('#rs-sh-lista .rlin.vazio').count() === 2);
  await page.screenshot({ path: '/tmp/aic-2c-ficha-func.png' });
  await page.click('#rs-sh-lista .rlin.vazio >> nth=0');
  await page.waitForTimeout(300);
  ok('a chamada abre a ficha do registo por cima', await page.locator('#modal-registo').isVisible()
     && (await page.locator('#mr-corpo').innerText()).includes('200 com o corpo vazio'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Escape fecha só a de cima', !(await page.locator('#modal-registo').isVisible())
     && await page.locator('#modal-rs').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Pessoas: utilizador × app × data, e os filtros a mexer na hora.
  await page.click('.it[data-tab="pessoas"]');
  await page.waitForTimeout(400);
  const utLin = () => page.locator('#ut-tabela tbody tr');
  ok('pessoas: uma linha por utilizador', await utLin().count() === 3);
  ok('pessoas: o que mais gasta primeiro', (await utLin().nth(0).locator('td').nth(0).innerText()).includes('a@b.c')
     && (await utLin().nth(0).locator('td').nth(1).innerText()).includes('0,50'));
  ok('pessoas: o total é a primeira coluna, e as apps a seguir', (await page.locator('#ut-tabela thead th').allInnerTexts())
     .map(t => t.toLowerCase()).join('|') === 'utilizador|total|garrafeira|winecatalog');
  ok('pessoas: o total de tudo em baixo', (await page.locator('#ut-tabela tfoot td').nth(1).innerText()).includes('0,67'));
  ok('pessoas: sem uso é um ponto, não 0,00 €', await page.locator('#ut-tabela td.ut-0').count() === 2);
  ok('pessoas: o quem a NULL dito como "sem utilizador"', (await page.locator('#ut-tabela').innerText()).includes('sem utilizador'));
  ok('pessoas: o provisório a âmbar', await utLin().nth(1).locator('td').nth(1).locator('.t-wn').count() === 1);
  ok('pessoas: medido a grafite', await page.locator('#ut-tabela td .eur-med').count() > 0);
  ok('pessoas: as colunas não repetem as linhas', await page.locator('#ut-colunas option[value="quem"]').evaluate(o => o.disabled));
  await page.screenshot({ path: '/tmp/aic-3b-pessoas.png', fullPage: true });
  await page.selectOption('#ut-app', 'winecatalog');
  await page.waitForTimeout(100);
  ok('pessoas: o filtro da app redesenha na hora', await utLin().count() === 1
     && (await page.locator('#ut-topo').innerText()).includes('0,20'));
  await page.selectOption('#ut-app', '');
  await page.selectOption('#ut-linhas', 'dia');
  await page.selectOption('#ut-colunas', 'quem');
  await page.waitForTimeout(100);
  ok('pessoas: data × utilizador, a mais recente primeiro', await utLin().count() === 2
     && (await page.locator('#ut-tabela thead th').nth(2).innerText()).toLowerCase() === 'a');
  await page.selectOption('#ut-medida', 'usos');
  await page.waitForTimeout(100);
  ok('pessoas: em usos', (await page.locator('#ut-tabela tfoot td').nth(1).innerText()).trim() === '10');
  await page.screenshot({ path: '/tmp/aic-3c-pessoas-dias.png', fullPage: true });
  await page.selectOption('#ut-medida', 'eur');
  await page.selectOption('#ut-linhas', 'quem');
  await page.selectOption('#ut-colunas', 'app');

  // Registos
  await page.click('.it[data-tab="registos"]');
  await page.waitForTimeout(400);
  ok('5 registos', await page.locator('#rg-lista .rlin').count() === 5);
  ok('200 vazio marcado', await page.locator('#rg-lista .tag.wn').count() >= 2);
  // Um erro que TAMBÉM é 200 vazio fica âmbar, não vermelho: o âmbar diz
  // porquê, e "gastou e não veio nada" é outra coisa de "o modelo
  // rebentou". O vermelho fica para o erro sem explicação melhor.
  ok('erro normal a vermelho', await page.locator('#rg-lista .rlin.erro').count() === 1);
  ok('200 vazio a âmbar mesmo sendo erro', await page.locator('#rg-lista .rlin.vazio').count() === 2);
  ok('o 200 vazio que é erro leva as duas pastilhas',
     await page.locator('#rg-lista .rlin.vazio .tag.er').count() === 1);
  ok('provisório dito na linha',
     (await page.locator('#rg-lista .rlin >> nth=4').innerText()).includes('provisório'));
  await page.selectOption('#rg-estado', 'vazio');
  await page.waitForTimeout(200);
  ok('filtro "200 vazio" corta para 2', await page.locator('#rg-lista .rlin').count() === 2);
  await page.selectOption('#rg-estado', 'erro');
  await page.waitForTimeout(200);
  ok('filtro "erro" corta para 2', await page.locator('#rg-lista .rlin').count() === 2);
  await page.selectOption('#rg-estado', '');
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/aic-3-registos.png', fullPage: true });

  // Ficha
  await page.click('#rg-lista .rlin >> nth=2');
  await page.waitForTimeout(300);
  ok('ficha abre', await page.locator('#modal-registo').isVisible());
  const ficha = await page.locator('#mr-corpo').innerText();
  ok('ficha explica o 200 vazio', ficha.includes('200 com o corpo vazio'));
  ok('ficha mostra finishReason', ficha.includes('MAX_TOKENS'));
  ok('ficha diz a conta', /conta\s*gemini/i.test(ficha));
  ok('ficha traz o detalhe em bruto', (await page.locator('#mr-corpo pre.raw').innerText()).includes('usageMetadata'));
  await page.screenshot({ path: '/tmp/aic-4-ficha.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Escape fecha a ficha', !(await page.locator('#modal-registo').isVisible()));

  // Saldo
  await page.click('.it[data-tab="saldo"]');
  await page.waitForTimeout(400);
  // Ficou no Claude (o botão do Resumo): volta-se ao Gemini.
  ok('uma escolha por conta', await page.locator('#lt-conta-segs .seg').count() === 2);
  await page.click('#lt-conta-segs .seg[data-v="google"]');
  await page.waitForTimeout(400);
  ok('janelas desenhadas', await page.locator('#lt-janelas .li').count() === 4);
  ok('janela sem número marcada', await page.locator('#lt-janelas .tag.er').count() === 1);
  // Várias leituras no mesmo dia: sem a hora, "30/09 → 30/09" duas vezes.
  ok('janela traz a hora', (await page.locator('#lt-janelas .li-t >> nth=0').innerText()).includes(':'));
  ok('janela juntada dita', (await page.locator('#lt-janelas .li >> nth=0').innerText()).includes('2 leituras juntas'));
  ok('janela pendente a âmbar', await page.locator('#lt-janelas .li-wn .tag.wn').count() === 1
     && (await page.locator('#lt-janelas').innerText()).includes('ainda não cobrou'));
  ok('última leitura à vista', (await page.locator('#lt-ultima').innerText()).includes('Última leitura'));
  ok('aviso das janelas más', (await page.locator('#lt-janelas .aviso').first().innerText()).includes('feitios diferentes'));
  ok('3 leituras (só as da Google)', await page.locator('#lt-lista .li').count() === 3);
  ok('no Gemini em euros', (await page.locator('#t-saldo .lt-moeda >> nth=0').innerText()) === '€');
  ok('carregado visível em modo saldo', await page.locator('#lt-carr-box').isVisible());
  await page.click('#lt-tipo-segs .seg[data-v="gasto"]');
  await page.waitForTimeout(150);
  ok('carregado esconde-se em modo gasto', !(await page.locator('#lt-carr-box').isVisible())
     && await page.locator('#lt-tipo').inputValue() === 'gasto');
  await page.click('#lt-tipo-segs .seg[data-v="saldo"]');
  ok('sem zoom no viewport', (await page.locator('meta[name=viewport]').getAttribute('content')).includes('user-scalable=no'));
  ok('campos a 16px (o iOS não dá zoom)', await page.locator('#lt-nota').evaluate(e => getComputedStyle(e).fontSize) === '16px');
  await page.screenshot({ path: '/tmp/aic-5-saldo.png', fullPage: true });
  // O Claude: em dólares, como a consola da Anthropic os mostra, e a janela
  // em euros ao câmbio — com o dólar lido ao lado, para se conferir.
  await page.click('#lt-conta-segs .seg[data-v="anthropic"]');
  await page.waitForTimeout(400);
  ok('Claude: só as janelas dele', await page.locator('#lt-janelas .li').count() === 1);
  ok('Claude: a janela em euros, com os dólares lidos', (await page.locator('#lt-janelas .li-v').innerText()).includes('0,55 €')
     && (await page.locator('#lt-janelas .li-s >> nth=0').innerText()).includes('lidos 0,64 $'));
  ok('Claude: os valores em dólares', (await page.locator('#t-saldo .lt-moeda >> nth=0').innerText()) === '$'
     && (await page.locator('#lt-lista .li-v >> nth=0').innerText()) === '4,36 $');
  ok('Claude: só as leituras dele', await page.locator('#lt-lista .li').count() === 2);
  ok('Claude: diz o câmbio', (await page.locator('#lt-intro').innerText()).includes('0,86 € por dólar'));
  ok('Claude: última leitura em dólares', (await page.locator('#lt-ultima').innerText()).includes('4,36 $'));
  await page.screenshot({ path: '/tmp/aic-5b-saldo-claude.png', fullPage: true });
  await page.click('#lt-conta-segs .seg[data-v="google"]');
  await page.waitForTimeout(300);

  // Definições
  await page.click('.it[data-tab="defs"]');
  await page.waitForTimeout(400);
  ok('5 rácios, em duas contas', await page.locator('#pr-lista tbody tr:not(.pr-g)').count() === 5
     && await page.locator('#pr-lista tbody tr.pr-g').count() === 2);
  ok('os rácios do Claude ditos em dólares', (await page.locator('#pr-lista tr.pr-g >> nth=1').innerText()).toLowerCase().includes('dólares'));
  ok('o câmbio do Claude à vista', await page.locator('#cb-lista input').count() === 1
     && await page.locator('#cb-lista input').inputValue() === '0.86');
  ok('conta identificada', (await page.locator('#conta-email').innerText()).includes('diogo'));
  await page.screenshot({ path: '/tmp/aic-6-defs.png', fullPage: true });

  // Não-admin
  await page.route('**/rest/v1/rpc/sou_admin', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: 'false' }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  ok('sem-acesso a quem não é dono', await page.locator('#page-sem-acesso').isVisible());
  ok('app escondida a quem não é dono', !(await page.locator('#app-sec').isVisible()));

  console.log(passos.join('\n'));
  console.log('\nerros de consola: ' + (erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum'));
  const falhas = passos.filter(p => p.startsWith('FALHA')).length;
  console.log('\n' + (passos.length - falhas) + '/' + passos.length + ' passaram');
  await browser.close(); srv.close();
  process.exit(falhas || erros.length ? 1 : 0);
})();
