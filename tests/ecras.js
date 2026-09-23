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
  {id:7,criado_em:'2026-09-20T14:32:19.117Z',app:'garrafeira',funcao:'vinho-info',estado:'ok',
   modelo:'gemini-flash-lite-latest',pesquisa_web:true,tokens_entrada:993,tokens_saida:485,
   tokens_pensamento:null,custo_estimado_eur:0.001,duracao_ms:8210,quem:'a@b.c',erro:null,
   detalhe:{modo:'barato',pesquisa:'grounding:google_search',campos:5},
   peso:0.030321,fator:1.0502,custo_eur:0.031843,provisorio:false},
  {id:6,criado_em:'2026-09-20T14:18:02.069Z',app:'winecatalog',funcao:'catalogo-info',estado:'ok',
   modelo:'gemini-flash-lite-latest',pesquisa_web:null,tokens_entrada:1137,tokens_saida:505,
   tokens_pensamento:null,custo_estimado_eur:0.01,duracao_ms:6100,quem:'a@b.c',erro:null,
   detalhe:{campos:1,manual:false,vinho_id:162,propostos:1,fontes:0},
   peso:0.030316,fator:1.0502,custo_eur:0.031838,provisorio:false},
  {id:5,criado_em:'2026-09-20T14:05:47.019Z',app:'winecatalog',funcao:'catalogo-info',estado:'ok',
   modelo:'gemini-flash-latest',pesquisa_web:null,tokens_entrada:5989,tokens_saida:0,
   tokens_pensamento:null,custo_estimado_eur:0.01,duracao_ms:21400,quem:'a@b.c',erro:null,
   detalhe:{passo:'sem_campos',campos:0,modelo:'gemini-flash-latest',finishReason:'MAX_TOKENS',
            usageMetadata:{promptTokenCount:5989,candidatesTokenCount:0,totalTokenCount:10966}},
   peso:0.031797,fator:1.0502,custo_eur:0.033394,provisorio:false},
  {id:4,criado_em:'2026-09-20T13:56:07.711Z',app:'winecatalog',funcao:'catalogo-info',estado:'erro',
   modelo:'gemini-flash-latest',pesquisa_web:null,tokens_entrada:3292,tokens_saida:0,
   tokens_pensamento:null,custo_estimado_eur:0.01,duracao_ms:18000,quem:'a@b.c',
   erro:'o modelo não devolveu resposta (MAX_TOKENS)',
   detalhe:{passo:'gemini_vazio',finishReason:'MAX_TOKENS'},
   peso:0.030988,fator:1.0502,custo_eur:0.032544,provisorio:false}
  ,{id:3,criado_em:'2026-09-20T13:40:00.000Z',app:'wineselection',funcao:'sugerir-vinho',estado:'erro',
   modelo:'gemini-flash-latest',pesquisa_web:true,tokens_entrada:0,tokens_saida:0,
   tokens_pensamento:null,custo_estimado_eur:0,duracao_ms:2100,quem:'a@b.c',
   erro:'gemini 503 (gemini-flash-latest): The model is overloaded.',
   detalhe:{passo:'gemini',status:503,pesquisa:true},
   peso:0.030,fator:1.0502,custo_eur:0.03151,provisorio:true}
];
const PRECOS = [
  {modelo:'*',eur_entrada_1m:0.10,eur_saida_1m:0.40,eur_pensamento_1m:null,eur_pesquisa:0.030,nota:'linha de recurso'},
  {modelo:'gemini-flash-latest',eur_entrada_1m:0.30,eur_saida_1m:2.50,eur_pensamento_1m:null,eur_pesquisa:0.030,nota:'o ponteiro do flash'},
  {modelo:'gemini-flash-lite-latest',eur_entrada_1m:0.10,eur_saida_1m:0.40,eur_pensamento_1m:null,eur_pesquisa:0.030,nota:'o ponteiro do lite'}
];
function resumo(calibrado){
  return {janelaDias:30,calibrado,semRegra:[],
    porApp:[
      {app:'winecatalog',pedidos:4,ok:3,erro:1,tokensEntrada:14433,tokensSaida:505,
       tokensPensamento:0,pesquisas:4,custoEur:calibrado?0.0968:null,estimadoEur:0.04,
       provisorio:false,ultimaChamada:'2026-09-20T14:18:02.069Z'},
      {app:'garrafeira',pedidos:3,ok:3,erro:0,tokensEntrada:2983,tokensSaida:1541,
       tokensPensamento:0,pesquisas:3,custoEur:calibrado?0.0955:null,estimadoEur:0.003,
       provisorio:false,ultimaChamada:'2026-09-20T14:32:19.117Z'}],
    porModelo:[
      {modelo:'gemini-flash-lite-latest',pedidos:4,tokensEntrada:4120,tokensSaida:2046,
       tokensPensamento:0,pesquisas:4,custoEur:calibrado?0.1213:null,estimadoEur:0.013},
      {modelo:'gemini-flash-latest',pedidos:3,tokensEntrada:13296,tokensSaida:0,
       tokensPensamento:0,pesquisas:3,custoEur:calibrado?0.0710:null,estimadoEur:0.03}],
    janela:{pedidos:7,custoEur:calibrado?0.1923:null,estimadoEur:0.043},
    total:{pedidos:7,custoEur:calibrado?0.1923:null,estimadoEur:0.043}};
}
const JANELAS = [
  {leitura_id:2,de:'2026-09-20T13:00:00Z',ate:'2026-09-22T09:00:00Z',tipo:'saldo',
   real_eur:0.1923,chamadas:7,peso_total:0.18311,estimado_eur:0.043,fator:1.0502,
   nota:'primeira leitura a sério',desvio:3.4721},
  {leitura_id:3,de:'2026-09-22T09:00:00Z',ate:'2026-09-22T11:00:00Z',tipo:'gasto',
   real_eur:null,chamadas:0,peso_total:0,estimado_eur:0,fator:null,nota:'troquei de feitio',desvio:null}
];
const LEITURAS = [
  {id:3,lido_em:'2026-09-22T11:00:00Z',tipo:'gasto',valor_eur:1.2,carregado_eur:0,nota:'troquei de feitio'},
  {id:2,lido_em:'2026-09-22T09:00:00Z',tipo:'saldo',valor_eur:49.81,carregado_eur:0,nota:null},
  {id:1,lido_em:'2026-09-20T13:00:00Z',tipo:'saldo',valor_eur:50.0,carregado_eur:0,nota:'primeira leitura a sério'}
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
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  const erros = [];
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) erros.push('console: ' + m.text()); });
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  // O /favicon.ico é pedido pelo browser e não existe — não é avaria da app.
  page.on('response', r => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico'))
      erros.push('HTTP ' + r.status() + ' em ' + r.url());
  });

  let CALIBRADO = false;
  await page.route('**/auth/v1/user', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 'u1', email: 'diogo.andre.f.silva@gmail.com' }) }));
  await page.route('**/rest/v1/rpc/*', r => {
    const fn = r.request().url().split('/rpc/')[1].split('?')[0];
    const mapa = { sou_admin: true, resumo_medido: resumo(CALIBRADO), custos: REGISTOS,
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
  ok('medido a "—" sem calibração', (await page.locator('#rs-topo .tbox .tv').first().innerText()).trim() === '—');
  ok('estimativa visível', (await page.locator('#rs-topo .tbox.alt .tv').innerText()).includes('0,04'));
  ok('tabela por app com 2 linhas', await page.locator('#rs-apps tbody tr').count() === 2);
  ok('marca "vazio" no modelo sem saída', await page.locator('#rs-modelos .tag.wn').count() >= 1);
  ok('catálogo: 3 ações, cada uma na sua unidade', await page.locator('#rs-catalogo tbody tr').count() === 3
     && (await page.locator('#rs-catalogo tbody').innerText()).includes('notas'));
  ok('catálogo: poupança dita como estimativa', (await page.locator('#rs-catalogo').innerText()).includes('estimativa em cima de uma estimativa'));
  await page.screenshot({ path: '/tmp/aic-1-resumo-porcalibrar.png', fullPage: true });

  // Resumo calibrado
  CALIBRADO = true;
  await page.evaluate(() => rsCarregar());
  await page.waitForTimeout(300);
  ok('medido aparece com calibração', (await page.locator('#rs-topo .tbox .tv').first().innerText()).includes('0,19'));
  ok('aviso desaparece', !(await page.locator('#rs-aviso').innerText()).includes('leitura de saldo'));
  ok('desvio dito', (await page.locator('#rs-topo .tbox.alt .ts').innerText()).toLowerCase().includes('curta'));
  await page.screenshot({ path: '/tmp/aic-2-resumo.png', fullPage: true });

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
  ok('ficha traz o detalhe em bruto', (await page.locator('#mr-corpo pre.raw').innerText()).includes('usageMetadata'));
  await page.screenshot({ path: '/tmp/aic-4-ficha.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Escape fecha a ficha', !(await page.locator('#modal-registo').isVisible()));

  // Saldo
  await page.click('.it[data-tab="saldo"]');
  await page.waitForTimeout(400);
  ok('janelas desenhadas', await page.locator('#lt-janelas tbody tr').count() === 2);
  ok('janela sem número marcada', await page.locator('#lt-janelas .tag.er').count() === 1);
  ok('aviso das janelas más', (await page.locator('#lt-janelas .aviso').innerText()).includes('feitios diferentes'));
  ok('3 leituras', await page.locator('#lt-lista tbody tr').count() === 3);
  ok('carregado visível em modo saldo', await page.locator('#lt-carr-box').isVisible());
  await page.selectOption('#lt-tipo', 'gasto');
  await page.waitForTimeout(150);
  ok('carregado esconde-se em modo gasto', !(await page.locator('#lt-carr-box').isVisible()));
  await page.selectOption('#lt-tipo', 'saldo');
  await page.screenshot({ path: '/tmp/aic-5-saldo.png', fullPage: true });

  // Definições
  await page.click('.it[data-tab="defs"]');
  await page.waitForTimeout(400);
  ok('3 rácios', await page.locator('#pr-lista tbody tr').count() === 3);
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
