const STORAGE_KEY = 'fluxozynxtv_v2';

const defaultDemo = [
  { id:'demo1', name:'Big Buck Bunny', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/440px-Big_buck_bunny_poster_big.jpg', url:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', group:'Destaques', type:'movie' },
  { id:'demo2', name:'Sintel', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Sintel_poster.jpg/440px-Sintel_poster.jpg', url:'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', group:'Destaques', type:'movie' },
  { id:'demo3', name:'Tears of Steel', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Tears_of_Steel_poster.jpg/440px-Tears_of_Steel_poster.jpg', url:'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8', group:'Destaques', type:'movie' },
  { id:'demo4', name:'Apple Test Stream', logo:'', url:'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8', group:'Demo Live', type:'live' }
];

function loadData(){
  try{ const r=localStorage.getItem(STORAGE_KEY); if(r) return JSON.parse(r); }catch(e){}
  return { channels:[...defaultDemo], progress:{}, watchLater:[], lastPlayed:null };
}
function saveData(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

let data = loadData();
let currentTab = 'home';
let currentItem = null;
let hls = null;
let searchOpen = false;

const $ = id => document.getElementById(id);
const nav = $('nav');
const hero = $('hero');
const heroBg = $('heroBg');
const heroTitle = $('heroTitle');
const heroDesc = $('heroDesc');
const heroBadge = $('heroBadge');
const heroPlay = $('heroPlay');
const heroLater = $('heroLater');
const rowsContainer = $('rowsContainer');
const playerModal = $('playerModal');
const video = $('video');
const playerTitle = $('playerTitle');
const playerMeta = $('playerMeta');
const btnWatchLater = $('btnWatchLater');
const searchInput = $('searchInput');
const searchWrap = document.querySelector('.search-wrap');

/* Nav scroll effect */
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

/* Tab navigation */
document.querySelectorAll('.nav-link').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
    window.scrollTo({ top:0, behavior:'smooth' });
  });
});

$('logoHome').addEventListener('click', e => {
  e.preventDefault();
  currentTab = 'home';
  document.querySelectorAll('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.tab==='home'));
  render();
  window.scrollTo({ top:0, behavior:'smooth' });
});

/* Search */
$('btnSearchToggle').addEventListener('click', () => {
  searchOpen = !searchOpen;
  searchWrap.classList.toggle('open', searchOpen);
  if(searchOpen) searchInput.focus();
  else { searchInput.value=''; render(); }
});
searchInput.addEventListener('input', () => render());

/* Playlist */
$('btnPlaylist').addEventListener('click', () => $('m3uFile').click());
$('m3uFile').addEventListener('change', handleM3U);

/* Hero buttons */
heroPlay.addEventListener('click', () => {
  if(currentItem) playItem(currentItem);
  else $('btnPlaylist').click();
});
heroLater.addEventListener('click', () => {
  if(currentItem) toggleWatchLater(currentItem.id);
});

/* Player */
$('playerClose').addEventListener('click', closePlayer);
playerModal.addEventListener('click', e => { if(e.target===playerModal) closePlayer(); });
btnWatchLater.addEventListener('click', () => {
  if(currentItem) toggleWatchLater(currentItem.id);
});

video.addEventListener('timeupdate', () => {
  if(currentItem && video.duration && !isNaN(video.duration))
    saveProgress(currentItem.id, video.currentTime, video.duration);
});
video.addEventListener('pause', () => {
  if(currentItem) saveProgress(currentItem.id, video.currentTime, video.duration);
});
window.addEventListener('beforeunload', () => {
  if(currentItem) saveProgress(currentItem.id, video.currentTime, video.duration);
});

document.addEventListener('keydown', e => {
  if(e.key==='Escape' && playerModal.classList.contains('open')) closePlayer();
});

render();

/* ========== RENDER ========== */
function render(){
  const q = searchInput.value.toLowerCase().trim();
  let items = filterByTab(data.channels, currentTab);
  if(q) items = items.filter(c => c.name.toLowerCase().includes(q));

  // Hero
  const featured = items.find(c => data.progress[c.id]) || items[0] || data.channels[0];
  setHero(featured);

  // Rows
  if(items.length === 0){
    rowsContainer.innerHTML = `
      <div class="empty-state">
        <h3>${emptyMsg()}</h3>
        <p>Carregue uma playlist M3U para começar</p>
        <button class="btn-play" onclick="document.getElementById('btnPlaylist').click()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          Carregar M3U
        </button>
      </div>`;
    return;
  }

  if(currentTab === 'home'){
    renderHomeRows(items);
  } else {
    renderSingleGrid(items);
  }
}

function filterByTab(list, tab){
  if(tab==='home') return list;
  if(tab==='live') return list.filter(c => c.type==='live' || (!c.type && !isVod(c.group)));
  if(tab==='movies') return list.filter(c => c.type==='movie' || isMovie(c.group));
  if(tab==='series') return list.filter(c => c.type==='series' || isSeries(c.group));
  if(tab==='continue') return list.filter(c => data.progress[c.id]?.time>10)
    .sort((a,b)=>(data.progress[b.id]?.updated||0)-(data.progress[a.id]?.updated||0));
  if(tab==='watchlater') return list.filter(c => data.watchLater.includes(c.id));
  return list;
}

function setHero(item){
  currentItem = item || null;
  if(!item){
    heroTitle.textContent = 'Carregue sua playlist';
    heroDesc.textContent = 'Importe um arquivo M3U e comece a assistir.';
    heroBadge.textContent = 'Bem-vindo';
    heroBg.style.backgroundImage = 'none';
    return;
  }
  heroTitle.textContent = item.name;
  heroDesc.textContent = item.group ? `${typeLabel(item)} • ${item.group}` : typeLabel(item);
  heroBadge.textContent = currentTab==='continue' ? 'Continuar assistindo' : (item.type==='live'?'Ao Vivo':'Destaque');
  const img = item.logo || fallbackImg(item.name);
  heroBg.style.backgroundImage = `url('${img}')`;
  heroBg.classList.add('loaded');
  heroLater.classList.toggle('active', data.watchLater.includes(item.id));
}

function renderHomeRows(items){
  const continueItems = items.filter(c => data.progress[c.id]?.time>10)
    .sort((a,b)=>(data.progress[b.id]?.updated||0)-(data.progress[a.id]?.updated||0));
  const laterItems = items.filter(c => data.watchLater.includes(c.id));
  const live = items.filter(c => c.type==='live' || (!c.type && !isVod(c.group)));
  const movies = items.filter(c => c.type==='movie' || isMovie(c.group));
  const series = items.filter(c => c.type==='series' || isSeries(c.group));

  // group by group-title
  const groups = {};
  items.forEach(c => {
    const g = c.group || 'Outros';
    if(!groups[g]) groups[g]=[];
    groups[g].push(c);
  });

  let html = '';
  if(continueItems.length) html += rowHTML('Continuar Assistindo', continueItems, false);
  if(laterItems.length) html += rowHTML('Minha Lista', laterItems, false);
  if(live.length) html += rowHTML('TV ao Vivo', live.slice(0,30), true);
  if(movies.length) html += rowHTML('Filmes', movies.slice(0,30), false);
  if(series.length) html += rowHTML('Séries', series.slice(0,30), false);

  // extra groups
  Object.keys(groups).forEach(g => {
    if(['Destaques','Demo','Demo Live'].includes(g)) return;
    if(groups[g].length >= 3) html += rowHTML(g, groups[g].slice(0,24), groups[g][0].type==='live');
  });

  if(!html) html = rowHTML('Todos', items.slice(0,40), false);
  rowsContainer.innerHTML = html;
  bindCards();
  bindArrows();
}

function renderSingleGrid(items){
  const isLive = currentTab==='live';
  rowsContainer.innerHTML = rowHTML(
    currentTab==='continue'?'Continuar Assistindo':
    currentTab==='watchlater'?'Minha Lista':
    currentTab==='movies'?'Filmes':
    currentTab==='series'?'Séries':'TV ao Vivo',
    items, isLive
  );
  bindCards();
  bindArrows();
}

function rowHTML(title, items, isLive){
  const cards = items.map(item => cardHTML(item, isLive)).join('');
  return `
    <div class="row">
      <div class="row-header"><h2 class="row-title">${escapeHtml(title)}</h2></div>
      <div class="row-track-wrap">
        <button class="row-arrow left" data-dir="-1" aria-label="Anterior">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="row-track">${cards}</div>
        <button class="row-arrow right" data-dir="1" aria-label="Próximo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>`;
}

function cardHTML(item, isLive){
  const prog = data.progress[item.id];
  const pct = prog?.duration ? Math.min(100,(prog.time/prog.duration)*100) : 0;
  const inLater = data.watchLater.includes(item.id);
  const img = item.logo || fallbackImg(item.name);
  return `
    <div class="card ${isLive?'card-live':''}" data-id="${escapeAttr(item.id)}">
      <img class="card-poster" src="${escapeAttr(img)}" alt="" loading="lazy"
           onerror="this.src='${fallbackImg(item.name)}'">
      <div class="card-overlay">
        <div class="card-title">${escapeHtml(item.name)}</div>
        <div class="card-meta">${escapeHtml(typeLabel(item))}${prog?.time>10?' • '+formatTime(prog.time):''}</div>
        ${pct>2?`<div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>`:''}
        <div class="card-actions">
          <button class="card-btn" data-action="play" title="Assistir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button class="card-btn ${inLater?'active':''}" data-action="later" title="Minha Lista">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${inLater?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button>
        </div>
      </div>
    </div>`;
}

function bindCards(){
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
      const id = card.dataset.id;
      const item = data.channels.find(c => c.id===id);
      if(!item) return;
      if(e.target.closest('[data-action="later"]')){
        e.stopPropagation();
        toggleWatchLater(id);
        return;
      }
      playItem(item);
    });
  });
}

function bindArrows(){
  document.querySelectorAll('.row-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      const track = btn.parentElement.querySelector('.row-track');
      const dir = parseInt(btn.dataset.dir);
      track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior:'smooth' });
    });
  });
}

/* ========== PLAYBACK ========== */
function playItem(item){
  currentItem = item;
  data.lastPlayed = item.id;
  saveData();
  playerTitle.textContent = item.name;
  playerMeta.textContent = `${typeLabel(item)}${item.group?' • '+item.group:''}`;
  updateLaterBtn();
  playerModal.classList.add('open');
  document.body.style.overflow = 'hidden';

  if(hls){ hls.destroy(); hls=null; }
  const start = data.progress[item.id]?.time || 0;

  if(Hls.isSupported()){
    hls = new Hls({ enableWorker:true, lowLatencyMode:true });
    hls.loadSource(item.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if(start>10 && start < (video.duration||Infinity)-15) video.currentTime = start;
      video.play().catch(()=>{});
    });
    hls.on(Hls.Events.ERROR, (_,d) => {
      if(d.fatal) playerTitle.textContent = item.name + ' (erro)';
    });
  } else if(video.canPlayType('application/vnd.apple.mpegurl')){
    video.src = item.url;
    video.addEventListener('loadedmetadata', function h(){
      video.removeEventListener('loadedmetadata', h);
      if(start>10) video.currentTime = start;
      video.play().catch(()=>{});
    });
  } else alert('Navegador sem suporte a HLS');
}

function closePlayer(){
  if(currentItem) saveProgress(currentItem.id, video.currentTime, video.duration);
  playerModal.classList.remove('open');
  document.body.style.overflow = '';
  video.pause();
  if(hls){ hls.destroy(); hls=null; }
  video.removeAttribute('src');
  video.load();
  render();
}

function saveProgress(id, time, duration){
  if(!id || !duration || isNaN(duration)) return;
  data.progress[id] = { time:Math.floor(time), duration:Math.floor(duration), updated:Date.now() };
  if(time/duration > 0.95) delete data.progress[id];
  saveData();
}

function toggleWatchLater(id){
  const i = data.watchLater.indexOf(id);
  if(i>=0) data.watchLater.splice(i,1);
  else data.watchLater.push(id);
  saveData();
  updateLaterBtn();
  heroLater.classList.toggle('active', data.watchLater.includes(currentItem?.id));
  render();
}

function updateLaterBtn(){
  if(!currentItem) return;
  btnWatchLater.classList.toggle('active', data.watchLater.includes(currentItem.id));
}

/* ========== M3U ========== */
function handleM3U(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const parsed = parseM3U(ev.target.result);
    if(!parsed.length){ alert('Nenhum item válido'); return; }
    data.channels = parsed;
    saveData();
    currentTab = 'home';
    document.querySelectorAll('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.tab==='home'));
    render();
    alert(`${parsed.length} itens carregados!`);
  };
  reader.readAsText(file);
  e.target.value = '';
}

function parseM3U(content){
  const lines = content.split(/\r?\n/);
  const result = [];
  let cur = null;
  for(let i=0;i<lines.length;i++){
    const line = lines[i].trim();
    if(line.startsWith('#EXTINF:')){
      const name = (line.match(/,(.+)$/)||[])[1]?.trim() || 'Canal';
      const logo = (line.match(/tvg-logo="([^"]*)"/i)||[])[1] || '';
      const group = (line.match(/group-title="([^"]*)"/i)||[])[1] || 'Outros';
      cur = { id:'ch_'+hash(name+logo+i), name, logo, group, type:detectType(group,name), url:'' };
    } else if(line && !line.startsWith('#') && cur){
      cur.url = line;
      result.push(cur);
      cur = null;
    }
  }
  return result;
}

function detectType(g,n){
  const t=(g+' '+n).toLowerCase();
  if(/s[eé]rie|series|temporada|episode|episodio|tv show/.test(t)) return 'series';
  if(/filme|movie|cinema|vod|filmes/.test(t)) return 'movie';
  return 'live';
}
function isMovie(g){ return /filme|movie|cinema|vod|filmes/i.test(g||''); }
function isSeries(g){ return /s[eé]rie|series|temporada|tv show/i.test(g||''); }
function isVod(g){ return isMovie(g)||isSeries(g); }
function typeLabel(i){ return i.type==='movie'?'Filme':i.type==='series'?'Série':'Ao Vivo'; }
function formatTime(s){ return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function hash(s){ let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i)|0; return Math.abs(h).toString(36); }
function fallbackImg(n){ return `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=1a1a1a&color=e50914&size=400&font-size=0.33&bold=true`; }
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
function escapeAttr(s){ return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function emptyMsg(){
  if(currentTab==='continue') return 'Nada para continuar';
  if(currentTab==='watchlater') return 'Sua lista está vazia';
  return 'Nenhum conteúdo';
}
