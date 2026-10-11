/* ═══════════════════════════════════════════════════════════════════
   AI API Control — toda a lógica
   ═══════════════════════════════════════════════════════════════════
   Carrega como <script src> NORMAL, não module: há onclick="…" no HTML e
   no HTML gerado, logo as funções têm de ser GLOBAIS. Não converter.

   Secções (grep pelo título, não leias o ficheiro todo):
     SESSÃO SUPABASE · RPC · ESCAPES · TOAST · MODAIS · TABS ·
     FORMATAÇÃO · O 200 VAZIO · RESUMO · REGISTOS · SALDO ·
     RÁCIOS · AUTH · INIT
   ═══════════════════════════════════════════════════════════════════ */

/* ── SESSÃO SUPABASE ──────────────────────────────────────────────
   Mesmo projeto das apps irmãs; schema `ia_uso`. O `Accept-Profile` /
   `Content-Profile` é o que aponta para o schema — NUNCA vai no URL.

   A chave aqui em baixo é a `anon`, PÚBLICA POR DESIGN (protegida por
   RLS + login). Não é bug nem risco — não a "corrijas" nem a escondas.

   Este schema tem uma particularidade que o resto da app herda: a
   `registos` tem RLS admin-only e TUDO o que a app lê passa por funções
   SECURITY DEFINER com o portão `ia_uso.sou_admin()` lá dentro. A UI só
   decide o que mostrar; quem recusa é sempre o servidor. */
const SB_URL='https://gjweqwfbnkgnibhajldc.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdqd2Vxd2ZibmtnbmliaGFqbGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk4NzUsImV4cCI6MjA5NjY4NTg3NX0.h6st-RayGhQdsqH7E2Ko-rPWk2QZUpTevO6cbjvlSnk';
const SESSION_KEY='aic_sb_session';
let _sbSession=null;
/* Quem manda vem da BD (`ia_uso.sou_admin`), nunca de uma constante aqui. */
let _souAdmin=false;

function sbHeaders(extra){
  return Object.assign({
    'Content-Type':'application/json',
    'apikey':SB_KEY,
    'Authorization':'Bearer '+(_sbSession&&_sbSession.access_token||SB_KEY),
    'Accept-Profile':'ia_uso',
    'Content-Profile':'ia_uso'
  },extra||{});
}
function sbSaveSession(s){_sbSession=s;try{localStorage.setItem(SESSION_KEY,JSON.stringify(s));}catch(e){}}
let _refreshing=null;
async function sbRefresh(){
  if(!_sbSession||!_sbSession.refresh_token)return false;
  if(_refreshing)return _refreshing;
  _refreshing=(async()=>{
    try{
      const r=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:_sbSession.refresh_token})
      });
      if(!r.ok)return false;
      const d=await r.json();
      sbSaveSession({
        access_token:d.access_token,
        refresh_token:d.refresh_token||_sbSession.refresh_token,
        expires_at:d.expires_at||Math.floor(Date.now()/1000)+(d.expires_in||3600),
        user:d.user||_sbSession.user
      });
      return true;
    }catch(e){return false;}
  })();
  const ok=await _refreshing;_refreshing=null;return ok;
}
function tokenQuaseExpirado(){
  if(!_sbSession)return false;
  if(!_sbSession.expires_at)return true;
  return (_sbSession.expires_at-Date.now()/1000)<120;
}
async function sbFetch(url,opt){
  if(_sbSession&&_sbSession.refresh_token&&tokenQuaseExpirado())await sbRefresh();
  opt=opt||{};
  opt.headers=Object.assign({},opt.headers,{'Authorization':'Bearer '+(_sbSession&&_sbSession.access_token||SB_KEY)});
  let r=await fetch(url,opt);
  if(r.status===401&&_sbSession&&_sbSession.refresh_token){
    if(await sbRefresh()){
      opt.headers=Object.assign({},opt.headers,{'Authorization':'Bearer '+_sbSession.access_token});
      r=await fetch(url,opt);
    }
  }
  return r;
}

/* ── RPC ──────────────────────────────────────────────────────────
   Tudo o que esta app lê ou escreve passa por aqui. Não há um único
   SELECT em cru: as tabelas do `ia_uso` têm RLS admin-only e as funções
   são o caminho. */
async function iaRpc(fn,args){
  const r=await sbFetch(SB_URL+'/rest/v1/rpc/'+fn,{
    method:'POST',headers:sbHeaders(),body:JSON.stringify(args||{})
  });
  const tx=await r.text();
  if(!r.ok){
    let m='HTTP '+r.status;
    try{m=JSON.parse(tx).message||m;}catch(_){}
    /* A migração por correr é o erro mais provável no primeiro dia, e o
       "404 schema cache" não o diz a ninguém. */
    if(/does not exist|schema cache|PGRST202|PGRST106/i.test(m))
      m='Falta correr db/ia_uso.sql, db/calibracao.sql, db/poupanca.sql e db/funcionalidades.sql no Supabase, ou expor o schema ia_uso na API (ver db/README.md).';
    throw new Error(m);
  }
  return tx?JSON.parse(tx):null;
}
function isAdmin(){return !!_souAdmin;}

/* ── ESCAPES ──────────────────────────────────────────────────────
   `esc` para conteúdo. Não há `escJs` porque não há um único onclick
   gerado com um valor lá dentro — os handlers vão todos por índice ou
   por id numérico. Se acrescentares um com texto, escreve-o primeiro. */
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

/* ── TOAST ────────────────────────────────────────────────────── */
let _toastTimer=null;
function toast(msg,erro){
  const t=document.getElementById('toast');if(!t)return;
  t.textContent=msg;t.classList.toggle('erro',!!erro);t.classList.add('on');
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(function(){t.classList.remove('on');},3400);
}

/* ── MODAIS ───────────────────────────────────────────────────── */
function abrirModal(id){const m=document.getElementById(id);if(m)m.classList.add('on');}
function fecharModal(id){const m=document.getElementById(id);if(m)m.classList.remove('on');}
/* Fechar pelo fundo só quando se carrega MESMO no fundo, nunca num filho
   que por acaso deixou passar o clique. */
function fecharFundo(ev,id){if(ev&&ev.target&&ev.target.id===id)fecharModal(id);}

/* ── TABS ─────────────────────────────────────────────────────── */
function itab(tab){
  const bs=document.querySelectorAll('#app-sec > .itabs > .it');
  for(let i=0;i<bs.length;i++)bs[i].classList.toggle('on',bs[i].dataset.tab===tab);
  const ps=document.querySelectorAll('#app-sec > .tp');
  for(let i=0;i<ps.length;i++)ps[i].classList.remove('on');
  const el=document.getElementById('t-'+tab);
  if(el)el.classList.add('on');
  try{localStorage.setItem('aic_tab',tab);}catch(e){}
  if(tab==='resumo')rsCarregar();
  if(tab==='registos')rgCarregar();
  if(tab==='saldo')ltCarregar();
  if(tab==='defs')prCarregar();
}
function restaurarTab(){
  let tab=null;
  try{tab=localStorage.getItem('aic_tab');}catch(e){}
  if(!tab||!document.getElementById('t-'+tab))tab='resumo';
  itab(tab);
}
function recarregar(){
  const t=(document.querySelector('#app-sec > .itabs > .it.on')||{}).dataset;
  itab(t&&t.tab||'resumo');
  toast('Atualizado');
}

/* ── FORMATAÇÃO ───────────────────────────────────────────────── */
/* `useGrouping:'always'` porque o defeito ('auto') NÃO agrupa números de
   quatro dígitos em pt-PT: numa coluna alinhada ficava "14 938" por cima
   de "4524", com os milhares a mudar de sítio de linha para linha. */
function nFmt(n){
  if(n==null||n==='')return '—';
  const x=Number(n);
  if(!isFinite(x))return '—';
  try{return x.toLocaleString('pt-PT',{useGrouping:'always'});}
  catch(e){return x.toLocaleString('pt-PT');}
}
/* DUAS precisões, de propósito. Um TOTAL lê-se ao cêntimo; uma CHAMADA
   custa milésimos, e ao cêntimo aparecia toda a 0,00 € — que é dizer que
   não custou nada. Nunca as mistures na mesma coluna: com casas
   diferentes por linha, a coluna deixa de alinhar e de se ler. */
function eurFmt(n,casas){
  if(n==null||n==='')return '—';
  const x=Number(n);
  if(!isFinite(x))return '—';
  const c=casas==null?2:casas;
  /* Um valor que EXISTE mas arredonda a zero não se escreve "0,00 €" —
     isso lê-se como "não custou nada", e há sempre parcelas pequenas numa
     coluna de totais. Diz-se que é menor do que a menor casa que se está
     a mostrar, que é a verdade. */
  const menor=Math.pow(10,-c);
  if(x>0&&x<menor/2)return '< '+menor.toLocaleString('pt-PT',{minimumFractionDigits:c,maximumFractionDigits:c})+' €';
  return x.toLocaleString('pt-PT',{minimumFractionDigits:c,maximumFractionDigits:c})+' €';
}
/* Vírgula, como tudo o resto. O `toFixed()` devolve SEMPRE ponto e numa
   coluna ao lado de "0,19 €" isso lê-se como outro número. */
function decFmt(x,casas){
  if(x==null)return '—';
  const n=Number(x);
  if(!isFinite(n))return '—';
  return n.toLocaleString('pt-PT',{minimumFractionDigits:casas,maximumFractionDigits:casas});
}
function pctFmt(x){
  if(x==null)return '—';
  const n=Number(x);
  if(!isFinite(n))return '—';
  return (n>0?'+':'')+(n*100).toLocaleString('pt-PT',{maximumFractionDigits:0})+'%';
}
function dtFmt(s){
  if(!s)return '—';
  const d=new Date(s);
  if(isNaN(d))return '—';
  return d.toLocaleString('pt-PT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
function dataFmt(s){
  if(!s)return '—';
  const d=new Date(s);
  if(isNaN(d))return '—';
  return d.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'2-digit'});
}
/* "30/09 14:02". As leituras fazem-se várias vezes ao dia, e só com a
   data duas janelas do mesmo dia liam-se iguais ("30/09 → 30/09"). */
function diaHoraFmt(s){
  if(!s)return '—';
  const d=new Date(s);
  if(isNaN(d))return '—';
  return d.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'})+' '
    + d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});
}
/* Uma janela: o dia só se repete do outro lado quando muda. */
function janFmt(de,ate){
  const a=new Date(de),b=new Date(ate);
  if(isNaN(a)||isNaN(b))return diaHoraFmt(de)+' → '+diaHoraFmt(ate);
  const mesmoDia=a.toDateString()===b.toDateString();
  return diaHoraFmt(de)+' → '+(mesmoDia
    ? b.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})
    : diaHoraFmt(ate));
}
/* "há 3 dias" — é isto que faz o sinal de vida ler-se de relance. */
function desdeFmt(s){
  if(!s)return 'nunca';
  const d=new Date(s);
  if(isNaN(d))return 'nunca';
  const h=Math.floor((Date.now()-d.getTime())/3600000);
  if(h<1)return 'agora mesmo';
  if(h<24)return 'há '+h+'h';
  const dias=Math.round(h/24);
  return 'há '+dias+(dias===1?' dia':' dias');
}
function diasDesde(s){
  if(!s)return 1e9;
  const d=new Date(s);
  return isNaN(d)?1e9:(Date.now()-d.getTime())/86400000;
}

/* ── O 200 VAZIO ──────────────────────────────────────────────────
   HTTP 200, o modelo gastou o orçamento a PENSAR e não escreveu uma
   letra. É a avaria mais cara que este registo apanha — paga-se a
   entrada e a pesquisa e não vem nada — e durante meses passava por
   sucesso em quatro das nove functions (ver o CLAUDE.md da WineCatalog).

   Reconhece-se de duas maneiras, e são precisas as duas: as functions já
   corrigidas fecham em `erro` com `passo: gemini_vazio`; o HISTÓRICO
   anterior a 20/09/2026 ficou gravado como `ok` com zero tokens de saída
   e milhares de entrada, e esse não há deploy que o volte a escrever. */
function ehVazio(r){
  if(!r)return false;
  const d=r.detalhe||{};
  if(String(d.passo||'')==='gemini_vazio')return true;
  return r.estado==='ok'&&Number(r.tokens_saida||0)===0&&Number(r.tokens_entrada||0)>0;
}

/* ══════════════════════════════════════════════════════════════════
   RESUMO
   ══════════════════════════════════════════════════════════════════ */
let RS_DIAS=30;
let RS_DADOS=null;

function rsJanela(d){
  RS_DIAS=d;
  const bs=document.querySelectorAll('#rs-janela .seg');
  for(let i=0;i<bs.length;i++)bs[i].classList.toggle('on',Number(bs[i].dataset.d)===d);
  rsCarregar();
}

async function rsCarregar(){
  const topo=document.getElementById('rs-topo');
  topo.innerHTML='<div class="vazio-msg">a carregar…</div>';
  try{
    RS_DADOS=await iaRpc('resumo_medido',{p_dias:RS_DIAS});
  }catch(e){
    document.getElementById('rs-aviso').innerHTML=
      '<div class="aviso erro">'+esc(e.message)+'</div>';
    topo.innerHTML='';
    document.getElementById('rs-apps').innerHTML='';
    document.getElementById('rs-funcs').innerHTML='';
    document.getElementById('rs-modelos').innerHTML='';
    return;
  }
  rsDesenhar();
  rsCarregarApps();
  rsCarregarCatalogo();
}

/* ── O que o catálogo de vinhos poupou ──
   À parte do resto, e de propósito: é a única coisa deste painel que não
   sai da `registos` (um pedido servido pelo catálogo não chamou o Gemini,
   não deixou linha aqui — ver `db/poupanca.sql`). Se a vista da
   WineCatalog falhar, falha este cartão e mais nenhum. */
async function rsCarregarCatalogo(){
  const box=document.getElementById('rs-catalogo');
  let d;
  try{
    d=await iaRpc('poupanca_catalogo',{p_dias:RS_DIAS});
  }catch(e){
    box.innerHTML='<div class="card"><h2>Catálogo de vinhos</h2>'
      + '<div class="aviso erro">'+esc(e.message)+'</div></div>';
    return;
  }
  const t=(d&&d.total)||{};
  const pedidos=Number(t.pedidos||0),doCat=Number(t.pedidosCatalogo||0);
  const pa=Array.isArray(d&&d.porAcao)?d.porAcao:[];
  /* As unidades não se somam: campos, notas e vinhos são coisas
     diferentes. Cada linha leva a sua; o que se soma é o PEDIDO. */
  let h='<div class="card"><h2>Catálogo de vinhos</h2>'
    + '<p class="nota">O que as apps de vinhos <b>não</b> foram perguntar ao Gemini '
    + 'porque o catálogo partilhado já sabia. Nos últimos '+RS_DIAS+' dias: '
    + '<b>'+nFmt(doCat)+'</b> de '+nFmt(pedidos)+' pedidos'
    + (pedidos?' ('+Math.round(doCat*100/pedidos)+'%)':'')+' servidos sem IA nenhuma, '
    + '≈ <span class="eur-est">'+esc(eurFmt(t.poupadoEstimado,2))+'</span> poupados.</p>'
    + '<div class="tw"><table><thead><tr><th>Ação</th>'
    + '<th class="n">Poupado</th><th class="n">Pedidos</th><th class="n">Só catálogo</th>'
    + '<th class="n">Do catálogo</th><th class="n">Da IA</th></tr></thead><tbody>';
  if(!pa.length)h+='<tr><td colspan="6" class="t-sub">Sem pedidos nesta janela.</td></tr>';
  for(let i=0;i<pa.length;i++){
    const a=pa[i];
    h+='<tr><td class="t-app">'+esc(a.acao)+'<span class="t-sub">'+esc(a.app)+'</span></td>'
      + '<td class="n eur-est">'+esc(eurFmt(a.poupadoEstimado,2))+'</td>'
      + '<td class="n">'+nFmt(a.pedidos)+'</td>'
      + '<td class="n">'+nFmt(a.pedidosCatalogo)+'</td>'
      + '<td class="n">'+nFmt(a.itensCatalogo)+' <span class="t-sub" style="display:inline">'+esc(a.unidade)+'</span></td>'
      + '<td class="n">'+nFmt(a.itensIA)+' <span class="t-sub" style="display:inline">'+esc(a.unidade)+'</span></td></tr>';
  }
  h+='</tbody></table></div>'
    + '<p class="nota" style="padding:0 4px">A <b>contagem de pedidos é facto</b>. '
    + 'O euro poupado é uma <b>estimativa em cima de uma estimativa</b>: um pedido '
    + 'que não foi à IA não deixou registo do que teria custado, e conta-se ao '
    + 'custo <em>estimado</em> médio dos que foram — não ao euro medido. '
    + '"Do catálogo" e "Da IA" contam na unidade de cada ação (campos, notas, '
    + 'vinhos) e não se somam entre linhas.</p></div>';
  box.innerHTML=h;
}

function rsDesenhar(){
  const d=RS_DADOS||{};
  const cal=!!d.calibrado;
  const tot=d.total||{},jan=d.janela||{};

  /* ── O aviso: o que o painel NÃO sabe ── */
  let av='';
  if(!cal){
    av+='<div class="aviso"><b>Ainda não há leitura de saldo nenhuma.</b> '
      + 'Sem ela o euro não se consegue medir, e o que se mostra aqui é a '
      + '<b>estimativa</b> que cada Edge Function grava — constantes escritas '
      + 'à mão, sem a pesquisa Google lá dentro. '
      + '<button class="mini" onclick="itab(\'saldo\')">Registar o saldo da conta Google</button></div>';
  }
  const sr=Array.isArray(d.semRegra)?d.semRegra:[];
  if(sr.length){
    av+='<div class="aviso"><b>Funções sem regra de pesquisa:</b> '+esc(sr.join(', '))+'. '
      + 'Se alguma delas usa pesquisa Google, o custo dela está a ser contado a menos — '
      + 'acrescenta-a à <code>ia_uso.funcoes</code>.</div>';
  }
  document.getElementById('rs-aviso').innerHTML=av;

  /* ── Os dois números grandes ──
     O MEDIDO à esquerda, em tinta firme; o ESTIMADO à direita, em
     cinzento e mais pequeno. Não é hierarquia por gosto: é a diferença
     entre um número que se pode defender e um palpite, e este painel
     existe para não os confundir.
     São da JANELA escolhida — o seletor por cima deles tem de lhes mexer.
     O "desde sempre" fica por baixo, em letra pequena. */
  const medido=cal?eurFmt(jan.custoEur,2):null;
  document.getElementById('rs-topo').innerHTML=
    '<div class="topo">'
    + '<div class="tbox"><div class="tl">Gasto medido · '+RS_DIAS+' dias</div>'
    +   '<div class="tv">'+(medido!=null?esc(medido):'<span class="eur-nd">—</span>')+'</div>'
    +   '<div class="ts">'+nFmt(jan.pedidos)+' chamadas'
    +     (cal?' · desde sempre '+esc(eurFmt(tot.custoEur,2)):' · por calibrar')+'</div></div>'
    + '<div class="tbox alt"><div class="tl">Estimativa das functions</div>'
    +   '<div class="tv">'+esc(eurFmt(jan.estimadoEur,2))+'</div>'
    +   '<div class="ts">'+rsDesvioTxt(jan)+'</div></div>'
    + '</div>';

  /* ── Por modelo ── */
  const ms=Array.isArray(d.porModelo)?d.porModelo:[];
  let hm='<div class="card"><h2>Por modelo</h2>'
    + '<p class="nota">A pergunta a que isto responde é se o modelo barato '
    + 'chega. A coluna da <b>saída</b> a zero com a entrada aos milhares é o '
    + '200 vazio: pagou-se e não veio nada.</p>'
    + '<div class="tw"><table><thead><tr><th>Modelo</th><th class="n">Medido</th>'
    + '<th class="n">Chamadas</th><th class="n">Entrada</th><th class="n">Saída</th>'
    + '<th class="n">Pensam.</th></tr></thead><tbody>';
  if(!ms.length)hm+='<tr><td colspan="6" class="t-sub">Sem dados.</td></tr>';
  for(let i=0;i<ms.length;i++){
    const m=ms[i];
    const semSaida=Number(m.tokensSaida||0)===0&&Number(m.tokensEntrada||0)>0;
    hm+='<tr><td class="t-app">'+esc(m.modelo)+'</td>'
      + '<td class="n eur-med">'+(m.custoEur==null?'—':esc(eurFmt(m.custoEur,2)))+'</td>'
      + '<td class="n">'+nFmt(m.pedidos)+'</td>'
      + '<td class="n">'+nFmt(m.tokensEntrada)+'</td>'
      + '<td class="n">'+nFmt(m.tokensSaida)+(semSaida?'<span class="tag wn">vazio</span>':'')+'</td>'
      + '<td class="n">'+nFmt(m.tokensPensamento)+'</td></tr>';
  }
  hm+='</tbody></table></div>'
    + '<p class="nota" style="padding:0 4px">Os <b>tokens são facto</b> — vêm do '
    + '<code>usageMetadata</code> da API. O euro medido é a repartição de um saldo '
    + 'real pelos tokens, e a repartição dentro de cada janela depende dos rácios '
    + 'em Definições. O total de uma janela está certo; a chamada individual está '
    + 'tão certa quanto os rácios estiverem.</p>';
  document.getElementById('rs-modelos').innerHTML=hm;
}

function rsDesvioTxt(tot){
  if(!RS_DADOS||!RS_DADOS.calibrado)return 'sem medição para comparar';
  const e=Number(tot.estimadoEur||0),m=Number(tot.custoEur||0);
  if(!(e>0))return 'a estimativa não diz nada';
  const dv=(m-e)/e;
  if(Math.abs(dv)<0.05)return 'a estimativa estava certa';
  return 'a estimativa estava '+(dv>0?'CURTA':'LONGA')+' '+pctFmt(Math.abs(dv));
}

/* ══════════════════════════════════════════════════════════════════
   POR APP E POR FUNCIONALIDADE
   ══════════════════════════════════════════════════════════════════
   As duas perguntas que este ecrã existe para responder (11/10/2026, o
   dono): quanto custa cada APP, e dentro de cada uma quais são as
   FUNCIONALIDADES mais caras — é aí que se decide o que fica premium.

   A funcionalidade não é a Edge Function: a `vinho-info` faz seis coisas
   diferentes e a média delas não diz nada de nenhuma. Quem decide qual é
   cada chamada é a BD (`ia_uso.funcionalidade()`, `db/funcionalidades.sql`)
   — o que a chamada gravou, ou a regra do histórico.

   O custo MÉDIO é por uso CONSEGUIDO: o total (os erros que se pagaram
   incluídos) a dividir pelos que correram bem. É o custo real de conseguir
   uma resposta, e uma média que ignorasse os erros escondia precisamente
   as avarias que mais custam. */
let RS_APPS=null;

async function rsCarregarApps(){
  const a=document.getElementById('rs-apps'),f=document.getElementById('rs-funcs');
  a.innerHTML='<div class="vazio-msg">a carregar…</div>';f.innerHTML='';
  try{
    RS_APPS=await iaRpc('resumo_apps',{p_dias:RS_DIAS});
  }catch(e){
    a.innerHTML='<div class="card"><h2>Por app</h2><div class="aviso erro">'+esc(e.message)+'</div></div>';
    return;
  }
  rsDesenharApps();
}

/* O euro de uma linha: o MEDIDO quando há calibração, a ESTIMATIVA quando
   não há — e diz-se qual é pela cor, nunca às escondidas. */
function rsEur(x,campoMed,campoEst){
  const cal=!!(RS_APPS&&RS_APPS.calibrado);
  const v=cal?x[campoMed]:x[campoEst];
  return {v:v==null?null:Number(v),cls:cal?'eur-med':'eur-est'};
}

/* As recusas à entrada vêm uma por Edge Function (a Garrafeira tem três):
   juntam-se numa linha só por app — são todas a mesma coisa, o pedido que
   nem chegou a ser uma funcionalidade. */
function rsJuntarEntradas(fs){
  const out=[],fn=[];let e=null;
  for(let i=0;i<fs.length;i++){
    const f=fs[i];
    if(f.chave!=='entrada'){out.push(f);continue;}
    fn.push(f.funcao);
    if(!e){e=Object.assign({},f);continue;}
    ['usos','ok','erro','vazios','pesquisas'].forEach(function(k){e[k]=Number(e[k]||0)+Number(f[k]||0);});
    ['custoEur','estimadoEur'].forEach(function(k){
      e[k]=e[k]==null&&f[k]==null?null:Number(e[k]||0)+Number(f[k]||0);});
    e.provisorio=!!(e.provisorio||f.provisorio);
  }
  if(e){e.funcao=fn.join(', ');out.push(e);}
  return out;
}

function rsDesenharApps(){
  const d=RS_APPS||{};
  const cal=!!d.calibrado;
  const apps=Array.isArray(d.apps)?d.apps:[];
  const ativas=apps.filter(function(x){return Number(x.usos)>0;});
  const caladas=apps.filter(function(x){return !(Number(x.usos)>0);});
  let total=0;
  for(let i=0;i<ativas.length;i++){const e=rsEur(ativas[i],'custoEur','estimadoEur');total+=e.v||0;}

  /* ── Custo por app ── */
  let h='<div class="card"><h2>Custo por app</h2>'
    + '<p class="nota">Nos últimos '+RS_DIAS+' dias'+(cal?'':', <b>pela estimativa</b> (ainda sem saldo lido)')
    + '. A barra é a parte de cada app no total; a última chamada é o <b>sinal de vida</b>.</p>';
  if(!ativas.length)h+='<div class="vazio-msg">Nenhuma chamada nesta janela.</div>';
  for(let i=0;i<ativas.length;i++){
    const x=ativas[i],e=rsEur(x,'custoEur','estimadoEur');
    const quota=total>0&&e.v!=null?e.v/total:0;
    const medio=Number(x.ok)>0&&e.v!=null?e.v/Number(x.ok):null;
    h+='<div class="ap">'
      + '<div class="ap-l"><div class="ap-t">'+esc(x.app)
      +   (x.provisorio&&cal?'<span class="tag wn">prov.</span>':'')+'</div>'
      +   '<div class="ap-s">'+nFmt(x.usos)+' usos'
      +     (Number(x.erro)>0?' · <span class="t-er">'+nFmt(x.erro)+' erro'+(Number(x.erro)===1?'':'s')+'</span>':'')
      +     (medio!=null?' · '+esc(eurFmt(medio,4))+' por uso':'')
      +     (Number(x.serper)>0?' · '+nFmt(x.serper)+' Serper':'')
      +     ' · '+esc(desdeFmt(x.ultimaChamada))+'</div>'
      +   '<div class="bar"><i style="width:'+(quota*100).toFixed(1)+'%"></i></div></div>'
      + '<div class="ap-v"><div class="ap-e '+e.cls+'">'+esc(eurFmt(e.v,2))+'</div>'
      +   '<div class="ap-p">'+(total>0?Math.round(quota*100)+'%':'')+'</div></div>'
      + '</div>';
  }
  /* O Serper paga-se a outro fornecedor e não está no saldo Google que se
     mede aqui: não há euro honesto para lhe dar. O que há é a CONTAGEM —
     cada consulta é uma linha na fatura de lá. */
  let serper=0;
  for(let i=0;i<ativas.length;i++)serper+=Number(ativas[i].serper||0);
  if(serper>0){
    h+='<p class="nota ap-cal"><b>'+nFmt(serper)+'</b> consulta'+(serper===1?'':'s')
      + ' ao <b>Serper</b> nestes '+RS_DIAS+' dias — pagas à parte, fora do saldo Google '
      + '(por isso sem euro aqui).</p>';
  }
  if(caladas.length){
    h+='<p class="nota ap-cal">Sem uso nestes '+RS_DIAS+' dias: '
      + caladas.map(function(x){return '<b>'+esc(x.app)+'</b> ('+esc(desdeFmt(x.ultimaChamada))+')';}).join(', ')
      + '.</p>';
  }
  const sr=Array.isArray(d.semRegisto)?d.semRegisto:[];
  if(sr.length){
    h+='<div class="aviso"><b>Nunca registaram uma chamada:</b> '
      + sr.map(function(x){return esc(x.funcao)+(x.app?' <span class="t-mu">('+esc(x.app)+')</span>':'');}).join(', ')
      + '. Pode ser só falta de uso — ou o deploy dessa Edge Function ainda sem a '
      + '<code>registarIaUso()</code>. Sem esta lista, as duas coisas eram o mesmo silêncio.</div>';
  }
  h+='</div>';
  document.getElementById('rs-apps').innerHTML=h;

  /* ── Por funcionalidade, um cartão por app ──
     Ordenadas pelo custo MÉDIO por uso — é a pergunta "isto devia ser
     premium?". O total e o peso na app vêm logo a seguir, porque uma
     funcionalidade cara que ninguém usa pesa menos do que uma barata que
     corre cem vezes por dia. O "Recusado à entrada" vai sempre para o fim:
     não é uma funcionalidade, é o pedido que nem chegou a ser uma. */
  let hf='';
  for(let i=0;i<ativas.length;i++){
    const x=ativas[i],fs=rsJuntarEntradas(Array.isArray(x.funcionalidades)?x.funcionalidades:[]);
    const tApp=rsEur(x,'custoEur','estimadoEur').v||0;
    fs.sort(function(a,b){
      const ea=a.chave==='entrada',eb=b.chave==='entrada';
      if(ea!==eb)return ea?1:-1;
      const ma=rsEur(a,'medioEur','medioEstEur').v,mb=rsEur(b,'medioEur','medioEstEur').v;
      if((mb||0)!==(ma||0))return (mb||0)-(ma||0);
      return Number(b.usos)-Number(a.usos);
    });
    let maxM=0;
    for(let k=0;k<fs.length;k++){const m=rsEur(fs[k],'medioEur','medioEstEur').v;if(m>maxM)maxM=m;}
    hf+='<div class="card"><h2>'+esc(x.app)+' <span class="h2-s">· por funcionalidade</span></h2>';
    for(let k=0;k<fs.length;k++){
      const f=fs[k],m=rsEur(f,'medioEur','medioEstEur'),t=rsEur(f,'custoEur','estimadoEur');
      const entrada=f.chave==='entrada';
      const peso=tApp>0&&t.v!=null?t.v/tApp:null;
      hf+='<div class="fn'+(entrada?' fn-ent':'')+'">'
        + '<div class="fn-l"><div class="fn-t">'+esc(f.nome)+'</div>'
        +   '<div class="fn-s">'+esc(f.funcao)+' · '+nFmt(f.usos)+' uso'+(Number(f.usos)===1?'':'s')
        +     (Number(f.erro)>0?' · <span class="t-er">'+nFmt(f.erro)+' erro'+(Number(f.erro)===1?'':'s')+'</span>':'')
        +     (Number(f.vazios)>0?' · <span class="t-wn">'+nFmt(f.vazios)+' vazio'+(Number(f.vazios)===1?'':'s')+'</span>':'')
        +     (Number(f.pesquisas)>0?' · '+nFmt(f.pesquisas)+' c/ pesquisa':'')
        +     (Number(f.serper)>0?' · '+nFmt(f.serper)+' consulta'+(Number(f.serper)===1?'':'s')+' Serper':'')
        +     (f.tokensMedios!=null?' · ~'+nFmt(f.tokensMedios)+' tokens':'')
        +   '</div>'
        +   (entrada?'':'<div class="bar"><i style="width:'+(maxM>0&&m.v!=null?(m.v/maxM*100).toFixed(1):0)+'%"></i></div>')
        + '</div>'
        + '<div class="fn-v">'
        +   (entrada||m.v==null
              ?'<div class="fn-e eur-nd">—</div><div class="fn-d">sem usos conseguidos</div>'
              :'<div class="fn-e '+m.cls+'">'+esc(eurFmt(m.v,4))+'</div><div class="fn-d">por uso</div>')
        +   '<div class="fn-d">total '+esc(eurFmt(t.v,2))+(peso!=null&&!entrada?' · '+Math.round(peso*100)+'%':'')
        +     (f.provisorio&&cal?' <span class="tag wn">prov.</span>':'')+'</div>'
        + '</div></div>';
    }
    hf+='</div>';
  }
  if(ativas.length){
    hf+='<p class="nota" style="padding:0 4px">O <b>custo médio</b> é por uso '
      + '<b>conseguido</b>: o total da funcionalidade — os erros que se pagaram incluídos, '
      + 'como o 200 vazio — a dividir pelas chamadas que correram bem. É o que custa, '
      + 'de facto, conseguir uma resposta. A barra compara-a com a mais cara da mesma app. '
      + 'Com poucos usos, a média é só um indício: conta os usos antes de decidir.</p>';
  }
  document.getElementById('rs-funcs').innerHTML=hf;
}

/* ══════════════════════════════════════════════════════════════════
   REGISTOS
   ══════════════════════════════════════════════════════════════════ */
let RG_LINHAS=[];

async function rgCarregar(){
  const el=document.getElementById('rg-lista');
  el.innerHTML='<div class="vazio-msg">a carregar…</div>';
  const app=document.getElementById('rg-app').value||null;
  const lim=parseInt(document.getElementById('rg-limite').value,10)||200;
  try{
    RG_LINHAS=(await iaRpc('custos',{p_limite:lim,p_app:app,p_desde:null}))||[];
  }catch(e){
    el.innerHTML='<div class="aviso erro">'+esc(e.message)+'</div>';return;
  }
  rgEncherApps();
  rgDesenhar();
}

/* O seletor de apps enche-se do que EXISTE, não de uma lista fixa: uma
   app nova aparece aqui sozinha no dia em que fizer a primeira chamada. */
function rgEncherApps(){
  const sel=document.getElementById('rg-app');
  if(sel.dataset.cheio==='1')return;
  const vistas={};
  for(let i=0;i<RG_LINHAS.length;i++)vistas[RG_LINHAS[i].app]=1;
  const nomes=Object.keys(vistas).sort();
  for(let i=0;i<nomes.length;i++){
    const o=document.createElement('option');
    o.value=nomes[i];o.textContent=nomes[i];
    sel.appendChild(o);
  }
  if(nomes.length)sel.dataset.cheio='1';
}

function rgDesenhar(){
  const filtro=document.getElementById('rg-estado').value;
  const el=document.getElementById('rg-lista');
  let h='',n=0;
  for(let i=0;i<RG_LINHAS.length;i++){
    const r=RG_LINHAS[i];
    const vazio=ehVazio(r);
    if(filtro==='vazio'&&!vazio)continue;
    if(filtro&&filtro!=='vazio'&&r.estado!==filtro)continue;
    n++;
    const cls=vazio?'vazio':(r.estado==='erro'?'erro':(r.estado==='ok'?'ok':'pedido'));
    const toks=Number(r.tokens_entrada||0)+Number(r.tokens_saida||0)+Number(r.tokens_pensamento||0);
    h+='<button class="rlin '+cls+'" onclick="rgAbrir('+i+')">'
      + '<div class="rlin-m">'
      +   '<div class="rlin-t">'+esc(r.app)+' · '+esc(r.funcao)
      +     (vazio?'<span class="tag wn">200 vazio</span>':'')
      +     (r.estado==='erro'?'<span class="tag er">erro</span>':'')+'</div>'
      +   '<div class="rlin-s">'+esc(r.modelo||'(sem modelo)')+' · '+nFmt(toks)+' tokens'
      +     (r.provisorio&&r.custo_eur!=null?' · provisório':'')+'</div>'
      + '</div>'
      + '<div class="rlin-v">'
      +   '<div class="rlin-e">'+(r.custo_eur==null
            ?'<span class="eur-nd">—</span>':esc(eurFmt(r.custo_eur,4)))+'</div>'
      +   '<div class="rlin-d">'+esc(dtFmt(r.criado_em))+'</div>'
      + '</div></button>';
  }
  el.innerHTML=n?h:'<div class="vazio-msg">Nada a mostrar com este filtro.</div>';
}

function rgAbrir(i){
  const r=RG_LINHAS[i];if(!r)return;
  document.getElementById('mr-titulo').textContent=r.app+' · '+r.funcao;
  const vazio=ehVazio(r);
  const fr=(r.detalhe||{}).finishReason;
  let h='<dl class="kv">'
    + '<dt>Quando</dt><dd>'+esc(new Date(r.criado_em).toLocaleString('pt-PT'))+'</dd>'
    + '<dt>Estado</dt><dd>'+esc(r.estado)+(vazio?' — 200 vazio':'')+'</dd>'
    + '<dt>Modelo</dt><dd>'+esc(r.modelo||'—')+'</dd>'
    + (fr?'<dt>finishReason</dt><dd>'+esc(fr)+'</dd>':'')
    + '<dt>Entrada</dt><dd>'+nFmt(r.tokens_entrada)+'</dd>'
    + '<dt>Saída</dt><dd>'+nFmt(r.tokens_saida)+'</dd>'
    + '<dt>Pensamento</dt><dd>'+nFmt(r.tokens_pensamento)+'</dd>'
    + '<dt>Duração</dt><dd>'+(r.duracao_ms==null?'—':nFmt(r.duracao_ms)+' ms')+'</dd>'
    + '<dt>Peso</dt><dd>'+decFmt(r.peso,6)+'</dd>'
    + '<dt>Custo medido</dt><dd>'+(r.custo_eur==null?'— (sem calibração)':esc(eurFmt(r.custo_eur,4))
        +(r.provisorio?' · provisório':''))+'</dd>'
    + '<dt>Estimado</dt><dd>'+esc(eurFmt(r.custo_estimado_eur,4))+'</dd>'
    + '<dt>Quem</dt><dd>'+esc(r.quem||'—')+'</dd>'
    + '</dl>';
  if(vazio){
    h+='<div class="aviso">O modelo respondeu <b>200 com o corpo vazio</b>: gastou '
     + 'o orçamento a pensar e não escreveu uma letra. Pagou-se a entrada e a '
     + 'pesquisa e não veio nada. Se isto se repetir em todos os modelos, o passo '
     + 'seguinte é o orçamento — <code>maxOutputTokens</code>, ou um '
     + '<code>thinkingConfig</code> com um teto POSITIVO (nunca '
     + '<code>thinkingBudget: 0</code>, que com <code>google_search</code> ligado dá 400).</div>';
  }
  if(r.erro)h+='<div class="aviso erro">'+esc(r.erro)+'</div>';
  /* O `detalhe` em bruto é a razão de esta ficha existir: é lá que está o
     que cada app entendeu por bem registar, e é o que permite investigar
     um caso sem acrescentar uma coluna por cada coisa nova. */
  h+='<p class="nota">Detalhe em bruto, como a Edge Function o gravou:</p>'
   + '<pre class="raw">'+esc(JSON.stringify(r.detalhe||{},null,2))+'</pre>';
  document.getElementById('mr-corpo').innerHTML=h;
  abrirModal('modal-registo');
}

/* ══════════════════════════════════════════════════════════════════
   SALDO — as leituras e a calibração
   ══════════════════════════════════════════════════════════════════ */
function ltTipo(t){
  document.getElementById('lt-tipo').value=t;
  const bs=document.querySelectorAll('#lt-tipo-segs .seg');
  for(let i=0;i<bs.length;i++)bs[i].classList.toggle('on',bs[i].dataset.v===t);
  ltSync();
}

function ltSync(){
  const tipo=document.getElementById('lt-tipo').value;
  /* Um carregamento só faz sentido num SALDO que desce. Num gasto
     acumulado não há nada a somar: pôr dinheiro na conta não muda o que
     já se gastou. */
  document.getElementById('lt-carr-box').style.display=(tipo==='saldo')?'':'none';
  document.getElementById('lt-dica').innerHTML=(tipo==='saldo')
    ? 'Quanto <b>resta</b> na conta agora. Se carregaste a conta desde a última leitura, '
      + 'diz quanto — sem isso o saldo sobe e a janela dá negativa.'
    : 'Quanto já se <b>gastou</b> no período que a Google mostra. Se o contador virou o '
      + 'mês e voltou a zero, o valor de agora é lido como o gasto desde a viragem.';
}

function ltAgora(){
  const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000);
  return d.toISOString().slice(0,16);
}

async function ltCarregar(){
  const q=document.getElementById('lt-quando');
  if(q&&!q.value)q.value=ltAgora();
  ltSync();
  const jb=document.getElementById('lt-janelas'),lb=document.getElementById('lt-lista');
  jb.innerHTML='<div class="vazio-msg">a carregar…</div>';lb.innerHTML='';
  let js=[],ls=[];
  try{
    js=(await iaRpc('janelas',{}))||[];
    ls=(await iaRpc('listar_leituras',{}))||[];
  }catch(e){
    jb.innerHTML='<div class="aviso erro">'+esc(e.message)+'</div>';return;
  }

  /* ── A última leitura, para se saber com o que se está a comparar ── */
  const ult=ls[0];
  document.getElementById('lt-ultima').innerHTML=ult
    ? '<div class="lt-ult">Última leitura: <b>'+esc(diaHoraFmt(ult.lido_em))+'</b> · '
      + (ult.tipo==='saldo'?'saldo ':'gasto ')+'<b class="num">'+esc(eurFmt(ult.valor_eur,2))+'</b>'
      + ' <span class="t-mu">('+esc(desdeFmt(ult.lido_em))+')</span></div>'
    : '';

  /* ── As janelas ──
     Uma LISTA e não uma tabela: com a hora nas duas pontas a tabela já não
     cabia no telemóvel, e o euro — o número que se veio ver — ia parar
     atrás de um scroll lateral. Aqui fica à direita, sempre à vista.
     O `desvio` é a única coisa que este painel pode dizer sobre a
     qualidade da própria conta: quanto é que a estimativa das functions
     andava longe do que se pagou mesmo. */
  let h='<div class="card"><h2>Janelas</h2>'
    + '<p class="nota">Cada par de leituras seguidas é uma janela. O <b>fator</b> é '
    + 'o euro observado a dividir pela soma dos pesos das chamadas que lá caíram — '
    + 'e a soma dessas chamadas dá exactamente o euro da janela, por construção.</p>'
    + '<p class="nota">A Google só mostra uma chamada no saldo algum tempo depois. Por isso '
    + 'uma janela <b>sem chamadas</b> junta-se à anterior (o euro que lá apareceu é das '
    + 'chamadas de trás), e chamadas que ainda estavam a 0,00 € juntam-se à janela seguinte.</p>';
  if(!js.length){
    h+='<div class="vazio-msg">Ainda não há duas leituras — é preciso um par para haver janela.</div>';
  }
  h+='<div class="lst">';
  for(let i=0;i<js.length;i++){
    const j=js[i];
    const mau=(j.real_eur==null)||(Number(j.real_eur)<0);
    const pend=!!j.pendente;
    const nj=Number(j.leituras||1);
    let tags='';
    if(nj>1)tags+='<span class="tag">'+nj+' leituras juntas</span>';
    if(pend)tags+='<span class="tag wn">à espera da Google</span>';
    if(mau)tags+='<span class="tag er">sem número</span>';
    const sub=[nFmt(j.chamadas)+(Number(j.chamadas)===1?' chamada':' chamadas')];
    if(j.fator!=null)sub.push('fator '+decFmt(j.fator,3));
    sub.push('estimado <span class="eur-est">'+esc(eurFmt(j.estimado_eur,2))+'</span>');
    /* Numa janela à espera da Google o desvio dava sempre -100%, que é
       o atraso a falar e não a estimativa. */
    if(j.desvio!=null&&!pend)sub.push('desvio '+pctFmt(j.desvio));
    h+='<div class="li'+(mau?' li-er':pend?' li-wn':'')+'">'
      + '<div class="li-m"><div class="li-t">'+esc(janFmt(j.de,j.ate))+tags+'</div>'
      +   '<div class="li-s">'+sub.join(' · ')+'</div>'
      +   (j.nota?'<div class="li-s">'+esc(j.nota)+'</div>':'')+'</div>'
      + '<div class="li-v eur-med">'+(j.real_eur==null?'—':esc(eurFmt(j.real_eur,2)))+'</div>'
      + '</div>';
  }
  h+='</div>';
  const maus=js.filter(function(j){return j.real_eur==null||Number(j.real_eur)<0;});
  if(maus.length){
    h+='<div class="aviso">'
     + (maus.length===1?'Há uma janela sem número a sério':'Há '+maus.length+' janelas sem número a sério')
     + ': ou as duas leituras são de <b>feitios diferentes</b> (um saldo e um gasto não se '
     + 'subtraem), ou o saldo <b>subiu</b> sem carregamento declarado. '
     + (maus.length===1?'Essa não reparte':'Essas não repartem')+' custo nenhum.</div>';
  }
  if(js.some(function(j){return j.pendente;})){
    h+='<div class="aviso">Há chamadas que a Google <b>ainda não cobrou</b>: a janela delas '
     + 'deu 0,00 €. Não quer dizer que não custaram nada — levam o fator mais próximo, '
     + 'como <b>provisórias</b>, até uma leitura seguinte mostrar o euro.</div>';
  }
  h+='</div>';
  jb.innerHTML=h;

  /* ── As leituras ── */
  let hl='<div class="card"><h2>Leituras</h2><div class="lst">';
  if(!ls.length)hl+='<div class="vazio-msg">Sem leituras.</div>';
  for(let i=0;i<ls.length;i++){
    const l=ls[i];
    const carr=Number(l.carregado_eur||0)>0;
    hl+='<div class="li">'
      + '<div class="li-m"><div class="li-t">'+esc(diaHoraFmt(l.lido_em))+'</div>'
      +   '<div class="li-s">'+(l.tipo==='saldo'?'saldo':'gasto')
      +     (carr?' · carregados '+esc(eurFmt(l.carregado_eur,2)):'')
      +     (l.nota?' · '+esc(l.nota):'')+'</div></div>'
      + '<div class="li-v">'+esc(eurFmt(l.valor_eur,2))+'</div>'
      + '<button class="mini" onclick="ltApagar('+Number(l.id)+')">Apagar</button>'
      + '</div>';
  }
  hl+='</div></div>';
  lb.innerHTML=hl;
}

async function ltGuardar(){
  const valor=parseFloat(String(document.getElementById('lt-valor').value).replace(',','.'));
  if(!isFinite(valor)||valor<0){toast('Escreve o valor que está na conta.',true);return;}
  const tipo=document.getElementById('lt-tipo').value;
  const carr=parseFloat(String(document.getElementById('lt-carregado').value||'0').replace(',','.'));
  const quando=document.getElementById('lt-quando').value;
  try{
    await iaRpc('registar_leitura',{
      p_valor_eur:valor,
      p_tipo:tipo,
      p_carregado_eur:(tipo==='saldo'&&isFinite(carr))?carr:0,
      p_lido_em:quando?new Date(quando).toISOString():null,
      p_nota:document.getElementById('lt-nota').value||null
    });
  }catch(e){toast(e.message,true);return;}
  document.getElementById('lt-valor').value='';
  document.getElementById('lt-carregado').value='';
  document.getElementById('lt-nota').value='';
  document.getElementById('lt-quando').value=ltAgora();
  toast('Leitura registada');
  await ltCarregar();
  /* O resumo passou a poder responder em euros medidos — se ficar com o
     que tinha, mostra "por calibrar" com a calibração já feita. */
  RS_DADOS=null;
}

async function ltApagar(id){
  if(!confirm('Apagar esta leitura? As janelas à volta dela são recalculadas.'))return;
  try{await iaRpc('apagar_leitura',{p_id:id});}
  catch(e){toast(e.message,true);return;}
  toast('Leitura apagada');
  RS_DADOS=null;
  await ltCarregar();
}

/* ══════════════════════════════════════════════════════════════════
   RÁCIOS
   ══════════════════════════════════════════════════════════════════ */
let PR_LINHAS=[];

async function prCarregar(){
  const el=document.getElementById('pr-lista');
  el.innerHTML='<div class="vazio-msg">a carregar…</div>';
  try{PR_LINHAS=(await iaRpc('listar_precos',{}))||[];}
  catch(e){el.innerHTML='<div class="aviso erro">'+esc(e.message)+'</div>';return;}
  let h='<div class="tw"><table><thead><tr><th>Modelo</th>'
    + '<th class="n">Entrada /1M</th><th class="n">Saída /1M</th>'
    + '<th class="n">Pesquisa /pedido</th><th></th></tr></thead><tbody>';
  for(let i=0;i<PR_LINHAS.length;i++){
    const p=PR_LINHAS[i];
    h+='<tr><td class="t-app">'+esc(p.modelo)
      + (p.nota?'<span class="t-sub">'+esc(p.nota)+'</span>':'')+'</td>'
      + '<td class="n"><input id="pr-e'+i+'" type="number" step="0.01" min="0" value="'+esc(p.eur_entrada_1m)+'"></td>'
      + '<td class="n"><input id="pr-s'+i+'" type="number" step="0.01" min="0" value="'+esc(p.eur_saida_1m)+'"></td>'
      + '<td class="n"><input id="pr-q'+i+'" type="number" step="0.001" min="0" value="'+esc(p.eur_pesquisa)+'"></td>'
      + '<td class="n"><button class="mini" onclick="prGuardar('+i+')">Guardar</button></td></tr>';
  }
  h+='</tbody></table></div>';
  el.innerHTML=h;
}

async function prGuardar(i){
  const p=PR_LINHAS[i];if(!p)return;
  const num=function(id){return parseFloat(String(document.getElementById(id).value).replace(',','.'));};
  const e=num('pr-e'+i),s=num('pr-s'+i),q=num('pr-q'+i);
  if(![e,s,q].every(function(x){return isFinite(x)&&x>=0;})){toast('Valores inválidos.',true);return;}
  try{
    await iaRpc('definir_preco',{
      p_modelo:p.modelo,p_entrada:e,p_saida:s,
      p_pensamento:p.eur_pensamento_1m,p_pesquisa:q,p_nota:p.nota
    });
  }catch(err){toast(err.message,true);return;}
  toast('Rácios guardados — o custo de cada chamada foi refeito');
  RS_DADOS=null;
  await prCarregar();
}

/* ══════════════════════════════════════════════════════════════════
   AUTH (Supabase) — mesmo padrão das apps irmãs
   ══════════════════════════════════════════════════════════════════
   Com uma diferença que vale a pena saber: aqui NÃO há `allowed_users`
   nem `access_requests`. O `ia_uso` tem um dono só
   (`ia_uso.config.admin_email`) e passa-se por `ia_uso.definir_admin()`
   no SQL Editor — não há a quem pedir acesso de dentro da app, e por
   isso o ecrã de sem-acesso não tem botão nenhum a prometê-lo. */
function sbRedirectUrl(){return window.location.href.split('#')[0].split('?')[0];}
function sbLimparHash(){window.history.replaceState({},document.title,window.location.pathname);}
function sbAuthStatus(id,txt,cor){
  const s=document.getElementById(id);if(!s)return;
  s.style.display='block';s.textContent=txt;s.style.color=cor||'var(--mu)';
}
function sbMostrarCaixaCodigo(){
  const c=document.getElementById('login-codigo');if(c)c.style.display='block';
}
function sbLinkFalhou(motivo){
  sbLimparHash();sbMostrarLogin();
  sbAuthStatus('login-status','O link já expirou ou já tinha sido aberto'
    +(motivo?' ('+motivo+')':'')+'. Escreve antes o código de 6 dígitos que vem no mesmo email.','var(--er)');
  sbMostrarCaixaCodigo();
}
function sbGuardarSessaoDeVerify(d){
  sbSaveSession({
    access_token:d.access_token,refresh_token:d.refresh_token,
    expires_at:d.expires_at||Math.floor(Date.now()/1000)+(d.expires_in||3600),
    user:d.user
  });
}
/* Trata TRÊS formas: `?token_hash=` (o link novo), `#access_token=` (o
   Google e os links à moda antiga) e `#error=`/`?error=` (link gasto).
   Lê a query E o hash — o link novo traz tudo na query. E corre ANTES da
   sessão guardada: quem clica no link costuma já ter sessão neste
   dispositivo, e o token de recuperação era ignorado. */
async function sbTratarHashAuth(){
  const hs=new URLSearchParams((window.location.hash||'').substring(1));
  const qs=new URLSearchParams(window.location.search||'');
  const g=function(k){return hs.get(k)||qs.get(k);};
  const recovery=g('type')==='recovery';

  if(g('error')||g('error_code')){
    const cod=(g('error_code')||'')+' '+(g('error_description')||'');
    if(/expired|invalid|used/i.test(cod)){sbLinkFalhou(g('error_code')||'');return true;}
    sbLimparHash();sbMostrarLogin();
    sbAuthStatus('login-status',g('error_description')||'Não foi possível concluir a autenticação.','var(--er)');
    return true;
  }

  const token_hash=g('token_hash');
  if(token_hash){
    const r=await fetch(SB_URL+'/auth/v1/verify',{
      method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({type:g('type')||'recovery',token_hash:token_hash})
    });
    if(!r.ok){let d={};try{d=await r.json();}catch(_){}
      sbLinkFalhou(d.error_code||d.msg||('HTTP '+r.status));return true;}
    sbGuardarSessaoDeVerify(await r.json());
    sbLimparHash();
    if(recovery){sbMostrarNovaPass();return true;}
    await sbAposLogin();return true;
  }

  const access_token=g('access_token');
  if(!access_token)return false;
  const refresh_token=g('refresh_token');
  const expires_at=parseInt(g('expires_at'),10)||Math.floor(Date.now()/1000)+(parseInt(g('expires_in'),10)||3600);
  const r=await fetch(SB_URL+'/auth/v1/user',{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+access_token}});
  if(!r.ok){sbLinkFalhou('HTTP '+r.status);return true;}
  sbSaveSession({access_token:access_token,refresh_token:refresh_token,expires_at:expires_at,user:await r.json()});
  sbLimparHash();
  if(recovery){sbMostrarNovaPass();return true;}
  await sbAposLogin();return true;
}

function esconderSplash(){
  const s=document.getElementById('splash');
  if(!s)return;
  s.classList.add('off');
  setTimeout(function(){s.style.display='none';},260);
}
function sbMostrarLogin(){
  document.getElementById('page-login').style.display='flex';
  document.getElementById('page-sem-acesso').style.display='none';
  document.getElementById('page-nova-pass').style.display='none';
  document.getElementById('app-sec').style.display='none';
  esconderSplash();
}
function sbMostrarNovaPass(){
  document.getElementById('page-login').style.display='none';
  document.getElementById('page-sem-acesso').style.display='none';
  document.getElementById('page-nova-pass').style.display='flex';
  esconderSplash();
}

async function sbAposLogin(){
  document.getElementById('page-login').style.display='none';
  document.getElementById('page-nova-pass').style.display='none';
  const email=(_sbSession&&_sbSession.user&&_sbSession.user.email)||'';

  _souAdmin=false;
  try{_souAdmin=!!(await iaRpc('sou_admin',{}));}catch(e){}

  if(!_souAdmin){
    document.getElementById('app-sec').style.display='none';
    document.getElementById('page-sem-acesso').style.display='flex';
    document.getElementById('sem-acesso-email').textContent=
      'Sessão iniciada como '+email+'. Este painel tem outro dono.';
    esconderSplash();return;
  }
  document.getElementById('page-sem-acesso').style.display='none';
  document.getElementById('app-sec').style.display='';

  const ce=document.getElementById('conta-email');
  if(ce)ce.textContent='Sessão iniciada como '+email;
  const cp=document.getElementById('conta-papel');
  if(cp)cp.textContent='És o dono deste painel. Passa-se por ia_uso.definir_admin() no SQL Editor do Supabase.';

  restaurarTab();
  esconderSplash();
}

async function sbLoginGoogle(){
  window.location.href=SB_URL+'/auth/v1/authorize?provider=google&redirect_to='
    +encodeURIComponent(sbRedirectUrl());
}
async function sbLoginEmail(){
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-pass').value;
  if(!email||!password){sbAuthStatus('login-status','Falta o email ou a password.','var(--er)');return;}
  sbAuthStatus('login-status','A entrar…');
  try{
    const r=await fetch(SB_URL+'/auth/v1/token?grant_type=password',{
      method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email:email,password:password})
    });
    const d=await r.json();
    if(!r.ok){sbAuthStatus('login-status',d.error_description||d.msg||'Não foi possível entrar.','var(--er)');return;}
    sbGuardarSessaoDeVerify(d);
    await sbAposLogin();
  }catch(e){sbAuthStatus('login-status','Sem ligação. Tenta outra vez.','var(--er)');}
}
async function sbRegistarEmail(){
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-pass').value;
  if(!email||!password){sbAuthStatus('login-status','Escreve o email e a password que queres usar.','var(--er)');return;}
  if(password.length<8){sbAuthStatus('login-status','A password tem de ter pelo menos 8 caracteres.','var(--er)');return;}
  sbAuthStatus('login-status','A criar conta…');
  try{
    const r=await fetch(SB_URL+'/auth/v1/signup',{
      method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email:email,password:password})
    });
    const d=await r.json();
    if(!r.ok){sbAuthStatus('login-status',d.msg||d.error_description||'Não foi possível criar a conta.','var(--er)');return;}
    if(d.access_token){sbGuardarSessaoDeVerify(d);await sbAposLogin();return;}
    sbAuthStatus('login-status','Conta criada. Confirma o email e volta a entrar.');
  }catch(e){sbAuthStatus('login-status','Sem ligação. Tenta outra vez.','var(--er)');}
}
/* O código de 6 dígitos é a saída garantida: ao contrário do link, ler um
   email não o gasta — e os scanners de segurança do Gmail & c.ª abrem os
   links antes do dono, o que fazia o link falhar SEMPRE, logo à primeira. */
async function sbRecuperarPassword(){
  const email=document.getElementById('login-email').value.trim();
  if(!email||email.indexOf('@')<0){
    sbAuthStatus('login-status','Escreve primeiro o teu email aqui em cima e volta a tocar.','var(--er)');
    document.getElementById('login-email').focus();return;
  }
  sbAuthStatus('login-status','A enviar email…');
  try{
    const r=await fetch(SB_URL+'/auth/v1/recover?redirect_to='+encodeURIComponent(sbRedirectUrl()),{
      method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email:email})
    });
    if(r.status===429){
      sbAuthStatus('login-status','Já foi pedido um email há pouco. Espera uns minutos.','var(--er)');return;
    }
    /* Não se diz se o email existe — a resposta é sempre a mesma. */
    sbAuthStatus('login-status','Se essa conta existir, vai receber um email com um link e um código.');
    sbMostrarCaixaCodigo();
  }catch(e){sbAuthStatus('login-status','Sem ligação. Tenta outra vez.','var(--er)');}
}
async function sbVerificarCodigo(){
  const email=document.getElementById('login-email').value.trim();
  const token=document.getElementById('login-cod').value.trim();
  if(!email||!token){sbAuthStatus('login-status','Falta o email ou o código.','var(--er)');return;}
  sbAuthStatus('login-status','A confirmar…');
  try{
    const r=await fetch(SB_URL+'/auth/v1/verify',{
      method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({type:'recovery',email:email,token:token})
    });
    const d=await r.json();
    if(!r.ok){sbAuthStatus('login-status',d.msg||d.error_description||'Código inválido ou já usado.','var(--er)');return;}
    sbGuardarSessaoDeVerify(d);
    sbMostrarNovaPass();
  }catch(e){sbAuthStatus('login-status','Sem ligação. Tenta outra vez.','var(--er)');}
}
function sbValidarPass(p1,p2){
  if(!p1||p1.length<8)return 'A password tem de ter pelo menos 8 caracteres.';
  if(p1!==p2)return 'As duas passwords não são iguais.';
  return '';
}
/* O token de recuperação dá SESSÃO mas não troca a password — sem este
   passo, quem recuperou ficava de fora no arranque seguinte. */
async function sbTrocarPassword(password){
  const r=await sbFetch(SB_URL+'/auth/v1/user',{
    method:'PUT',headers:sbHeaders(),body:JSON.stringify({password:password})
  });
  if(!r.ok){let d={};try{d=await r.json();}catch(_){}
    throw new Error(d.msg||d.error_description||('HTTP '+r.status));}
  return true;
}
async function sbDefinirNovaPassword(){
  const p1=document.getElementById('np1').value,p2=document.getElementById('np2').value;
  const erro=sbValidarPass(p1,p2);
  if(erro){sbAuthStatus('np-status',erro,'var(--er)');return;}
  sbAuthStatus('np-status','A guardar…');
  try{
    await sbTrocarPassword(p1);
    sbAuthStatus('np-status','Password trocada.');
    await sbAposLogin();
  }catch(e){sbAuthStatus('np-status',e.message,'var(--er)');}
}
async function sbAlterarPassword(){
  const p1=prompt('Password nova (mínimo 8 caracteres):');
  if(p1==null)return;
  const erro=sbValidarPass(p1,p1);
  if(erro){toast(erro,true);return;}
  try{await sbTrocarPassword(p1);toast('Password trocada.');}
  catch(e){toast(e.message,true);}
}
function sbSair(){
  _sbSession=null;_souAdmin=false;
  try{localStorage.removeItem(SESSION_KEY);}catch(e){}
  window.location.reload();
}

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
async function sbInit(){
  try{
    if(await sbTratarHashAuth())return;
  }catch(e){
    /* Uma falha de rede a tratar o hash não pode pendurar o arranque no
       splash: cai no login com aviso. */
    if(window.location.hash.length>1||window.location.search.length>1){
      sbLimparHash();sbMostrarLogin();
      sbAuthStatus('login-status','Não foi possível validar o link — sem ligação. Tenta outra vez.','var(--er)');
      return;
    }
  }
  let stored=null;
  try{stored=localStorage.getItem(SESSION_KEY);}catch(e){}
  if(stored){
    try{
      _sbSession=JSON.parse(stored);
      if(tokenQuaseExpirado())await sbRefresh();
      let r=await fetch(SB_URL+'/auth/v1/user',{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+_sbSession.access_token}});
      if(!r.ok&&_sbSession.refresh_token&&await sbRefresh()){
        r=await fetch(SB_URL+'/auth/v1/user',{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+_sbSession.access_token}});
      }
      if(r.ok){
        const u=await r.json();
        sbSaveSession(Object.assign({},_sbSession,{user:u}));
        await sbAposLogin();return;
      }
    }catch(e){}
    _sbSession=null;
    try{localStorage.removeItem(SESSION_KEY);}catch(e){}
  }
  sbMostrarLogin();
}

document.addEventListener('keydown',function(e){
  if(e.key==='Escape')fecharModal('modal-registo');
});

/* Sem zoom. O `user-scalable=no` do viewport chega no Android, mas o
   Safari do iOS ignora-o desde o iOS 10, e por isso o pinch trava-se
   aqui no `gesturestart`. O duplo toque trava-o o `touch-action` do
   `style.css` — NÃO com um `preventDefault` no `touchend`, que comia o
   segundo toque rápido num botão. O scroll não passa por aqui. */
document.addEventListener('gesturestart',function(e){e.preventDefault();},{passive:false});

if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  });
}
sbInit();
