const KEY = 'fluxozynxtv_v4';

const demos = [
  { id:'d1', name:'Big Buck Bunny', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/440px-Big_buck_bunny_poster_big.jpg', url:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', group:'Destaques', type:'movie' },
  { id:'d2', name:'Sintel', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Sintel_poster.jpg/440px-Sintel_poster.jpg', url:'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', group:'Destaques', type:'movie' },
  { id:'d3', name:'Tears of Steel', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Tears_of_Steel_poster.jpg/440px-Tears_of_Steel_poster.jpg', url:'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8', group:'Destaques', type:'movie' },
  { id:'d4', name:'Apple HLS Test', logo:'', url:'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8', group:'Demo Live', type:'live' }
];

function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) return JSON.parse(r);
  } catch (e) {}
  return { channels: [...demos], progress: {}, later: [], last: null, xtream: null };
}
function save() { localStorage.setItem(KEY, JSON.stringify(store)); }

let store = load();
let tab = 'home';
let current = null;
let hls = null;

const $ = (id) => document.getElementById(id);

const navbar = $('navbar');
const heroImage = $('heroImage');
const heroTag = $('heroTag');
const heroTitle = $('heroTitle');
const heroText = $('heroText');
const heroPlay = $('heroPlay');
const heroLater = $('heroLater');
const rows = $('rows');
const playerOverlay = $('playerOverlay');
const video = $('video');
const playerTitle = $('playerTitle');
const playerMeta = $('playerMeta');
const btnLaterPlayer = $('btnLaterPlayer');
const searchBox = $('searchBox');
const searchInput = $('searchInput');
const loadModal = $('loadModal');
const loadStatus = $('loadStatus');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('solid', window.scrollY > 50);
});

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

$('logoHome').addEventListener('click', (e) => {
  e.preventDefault();
  tab = 'home';
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'home'));
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('btnSearch').addEventListener('click', () => {
  searchBox.classList.toggle('open');
  if (searchBox.classList.contains('open')) searchInput.focus();
  else { searchInput.value = ''; render(); }
});
searchInput.addEventListener('input', () => render());

/* ===== LOAD MODAL ===== */
function openLoad() {
  loadModal.hidden = false;
  setStatus('');
  // restore xtream fields if saved
  if (store.xtream) {
    $('xtHost').value = store.xtream.host || '';
    $('xtUser').value = store.xtream.user || '';
    $('xtPass').value = store.xtream.pass || '';
  }
}
function closeLoad() { loadModal.hidden = true; }

$('btnOpenLoad').addEventListener('click', openLoad);
$('heroLoad').addEventListener('click', openLoad);
$('loadClose').addEventListener('click', closeLoad);
loadModal.addEventListener('click', (e) => { if (e.target === loadModal) closeLoad(); });

document.querySelectorAll('.load-tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.load-tab').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.load-panel').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    const panel = t.dataset.load === 'file' ? 'panelFile' : t.dataset.load === 'url' ? 'panelUrl' : 'panelXtream';
    $(panel).classList.add('active');
    setStatus('');
  });
});

function setStatus(msg, type) {
  if (!msg) { loadStatus.hidden = true; loadStatus.textContent = ''; return; }
  loadStatus.hidden = false;
  loadStatus.textContent = msg;
  loadStatus.className = 'load-status ' + (type || 'info');
}

/* File */
const fileDrop = $('fileDrop');
const m3uFile = $('m3uFile');
fileDrop.addEventListener('click', () => m3uFile.click());
m3uFile.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) readFile(f);
  e.target.value = '';
});
fileDrop.addEventListener('dragover', (e) => { e.preventDefault(); fileDrop.classList.add('drag'); });
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag'));
fileDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDrop.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) readFile(f);
});

function readFile(file) {
  setStatus('Lendo arquivo...', 'info');
  const reader = new FileReader();
  reader.onload = (ev) => {
    const parsed = parseM3U(ev.target.result);
    applyPlaylist(parsed, 'arquivo');
  };
  reader.onerror = () => setStatus('Erro ao ler o arquivo', 'err');
  reader.readAsText(file);
}

/* URL */
$('btnLoadUrl').addEventListener('click', loadFromUrl);
$('urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadFromUrl(); });

async function loadFromUrl() {
  let url = $('urlInput').value.trim();
  if (!url) { setStatus('Cole um link válido', 'err'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  setStatus('Baixando playlist...', 'info');
  $('btnLoadUrl').disabled = true;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const parsed = parseM3U(text);
    applyPlaylist(parsed, 'link');
  } catch (err) {
    setStatus('Falha ao baixar. O servidor pode bloquear (CORS). Tente baixar o arquivo e usar a aba Arquivo.', 'err');
  }
  $('btnLoadUrl').disabled = false;
}

/* Xtream */
$('btnLoadXtream').addEventListener('click', loadXtream);

async function loadXtream() {
  let host = $('xtHost').value.trim().replace(/\/$/, '');
  const user = $('xtUser').value.trim();
  const pass = $('xtPass').value.trim();
  if (!host || !user || !pass) {
    setStatus('Preencha servidor, usuário e senha', 'err');
    return;
  }
  if (!/^https?:\/\//i.test(host)) host = 'http://' + host;

  const getLive = $('xtLive').checked;
  const getVod = $('xtVod').checked;
  const getSeries = $('xtSeries').checked;

  setStatus('Conectando ao servidor...', 'info');
  $('btnLoadXtream').disabled = true;

  try {
    // Player API auth
    const authUrl = host + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass);
    const authRes = await fetch(authUrl);
    if (!authRes.ok) throw new Error('Servidor inacessível');
    const auth = await authRes.json();
    if (!auth.user_info || auth.user_info.auth === 0) throw new Error('Login inválido');

    const all = [];

    if (getLive) {
      setStatus('Carregando canais ao vivo...', 'info');
      const liveCats = await fetchJson(host + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass) + '&action=get_live_categories');
      const liveStreams = await fetchJson(host + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass) + '&action=get_live_streams');
      const catMap = mapCats(liveCats);
      (liveStreams || []).forEach((s) => {
        all.push({
          id: 'live_' + s.stream_id,
          name: s.name || 'Canal',
          logo: s.stream_icon || '',
          group: catMap[s.category_id] || 'Ao Vivo',
          type: 'live',
          url: host + '/live/' + user + '/' + pass + '/' + s.stream_id + '.m3u8'
        });
      });
    }

    if (getVod) {
      setStatus('Carregando filmes...', 'info');
      const vodCats = await fetchJson(host + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass) + '&action=get_vod_categories');
      const vodStreams = await fetchJson(host + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass) + '&action=get_vod_streams');
      const catMap = mapCats(vodCats);
      (vodStreams || []).forEach((s) => {
        const ext = (s.container_extension || 'mp4');
        all.push({
          id: 'vod_' + s.stream_id,
          name: s.name || 'Filme',
          logo: s.stream_icon || '',
          group: catMap[s.category_id] || 'Filmes',
          type: 'movie',
          url: host + '/movie/' + user + '/' + pass + '/' + s.stream_id + '.' + ext
        });
      });
    }

    if (getSeries) {
      setStatus('Carregando séries...', 'info');
      const serCats = await fetchJson(host + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass) + '&action=get_series_categories');
      const seriesList = await fetchJson(host + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass) + '&action=get_series');
      const catMap = mapCats(serCats);
      // series need extra call per show for episodes — load first episode link pattern or skip deep
      // For performance, store series as entries pointing to series info; play fetches episodes
      for (const s of (seriesList || []).slice(0, 500)) {
        all.push({
          id: 'ser_' + s.series_id,
          name: s.name || 'Série',
          logo: s.cover || '',
          group: catMap[s.category_id] || 'Séries',
          type: 'series',
          url: '', // filled on play
          seriesId: s.series_id,
          xtHost: host,
          xtUser: user,
          xtPass: pass
        });
      }
    }

    store.xtream = { host, user, pass };
    applyPlaylist(all, 'Xtream');
  } catch (err) {
    console.error(err);
    setStatus('Erro: ' + (err.message || 'falha na conexão. Verifique DNS/usuário/senha ou CORS.'), 'err');
  }
  $('btnLoadXtream').disabled = false;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function mapCats(arr) {
  const m = {};
  (arr || []).forEach((c) => { m[c.category_id] = c.category_name; });
  return m;
}

function applyPlaylist(parsed, source) {
  if (!parsed || !parsed.length) {
    setStatus('Nenhum item encontrado na lista', 'err');
    return;
  }
  store.channels = parsed;
  save();
  setStatus(parsed.length + ' itens carregados via ' + source + '!', 'ok');
  tab = 'home';
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'home'));
  setTimeout(() => { closeLoad(); render(); }, 800);
}

/* hero / player */
heroPlay.addEventListener('click', () => {
  if (current) play(current);
  else openLoad();
});
heroLater.addEventListener('click', () => { if (current) toggleLater(current.id); });

$('playerClose').addEventListener('click', closePlayer);
playerOverlay.addEventListener('click', (e) => { if (e.target === playerOverlay) closePlayer(); });
btnLaterPlayer.addEventListener('click', () => { if (current) toggleLater(current.id); });

video.addEventListener('timeupdate', () => {
  if (current && video.duration && !isNaN(video.duration))
    saveProgress(current.id, video.currentTime, video.duration);
});
video.addEventListener('pause', () => {
  if (current) saveProgress(current.id, video.currentTime, video.duration);
});
window.addEventListener('beforeunload', () => {
  if (current) saveProgress(current.id, video.currentTime, video.duration);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!playerOverlay.hidden) closePlayer();
    else if (!loadModal.hidden) closeLoad();
  }
});

render();

/* ========== RENDER ========== */
function render() {
  const q = searchInput.value.toLowerCase().trim();
  let list = byTab(store.channels, tab);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));

  const featured = list.find((c) => store.progress[c.id]) || list[0] || store.channels[0];
  setHero(featured);

  if (!list.length) {
    rows.innerHTML = '<div class="empty"><h3>' + emptyTitle() + '</h3><p>Carregue uma lista para começar</p><button class="btn-white" type="button" id="emptyLoad">Carregar lista</button></div>';
    const btn = $('emptyLoad');
    if (btn) btn.addEventListener('click', openLoad);
    return;
  }

  if (tab === 'home') renderHome(list);
  else renderGrid(list);
}

function byTab(list, t) {
  if (t === 'home') return list;
  if (t === 'live') return list.filter((c) => c.type === 'live' || (!c.type && !isVod(c.group)));
  if (t === 'movies') return list.filter((c) => c.type === 'movie' || isMovie(c.group));
  if (t === 'series') return list.filter((c) => c.type === 'series' || isSeries(c.group));
  if (t === 'continue') {
    return list.filter((c) => store.progress[c.id] && store.progress[c.id].time > 10)
      .sort((a, b) => (store.progress[b.id]?.updated || 0) - (store.progress[a.id]?.updated || 0));
  }
  if (t === 'watchlater') return list.filter((c) => store.later.includes(c.id));
  return list;
}

function setHero(item) {
  current = item || null;
  if (!item) {
    heroTitle.textContent = 'Carregue sua playlist';
    heroText.textContent = 'Arquivo, link ou login Xtream.';
    heroTag.textContent = 'Bem-vindo';
    heroImage.style.backgroundImage = 'none';
    return;
  }
  heroTitle.textContent = item.name;
  heroText.textContent = item.group ? typeLabel(item) + ' · ' + item.group : typeLabel(item);
  heroTag.textContent = tab === 'continue' ? 'Continuar' : item.type === 'live' ? 'Ao Vivo' : 'Destaque';
  heroImage.style.backgroundImage = 'url("' + (item.logo || avatar(item.name)) + '")';
  heroLater.classList.toggle('on', store.later.includes(item.id));
}

function renderHome(list) {
  const cont = list.filter((c) => store.progress[c.id] && store.progress[c.id].time > 10)
    .sort((a, b) => (store.progress[b.id]?.updated || 0) - (store.progress[a.id]?.updated || 0));
  const later = list.filter((c) => store.later.includes(c.id));
  const live = list.filter((c) => c.type === 'live' || (!c.type && !isVod(c.group)));
  const movies = list.filter((c) => c.type === 'movie' || isMovie(c.group));
  const series = list.filter((c) => c.type === 'series' || isSeries(c.group));

  const groups = {};
  list.forEach((c) => {
    const g = c.group || 'Outros';
    if (!groups[g]) groups[g] = [];
    groups[g].push(c);
  });

  let html = '';
  if (cont.length) html += makeRow('Continuar Assistindo', cont, false);
  if (later.length) html += makeRow('Minha Lista', later, false);
  if (live.length) html += makeRow('TV ao Vivo', live.slice(0, 40), true);
  if (movies.length) html += makeRow('Filmes', movies.slice(0, 40), false);
  if (series.length) html += makeRow('Séries', series.slice(0, 40), false);

  Object.keys(groups).forEach((g) => {
    if (['Destaques', 'Demo', 'Demo Live'].includes(g)) return;
    if (groups[g].length >= 4) html += makeRow(g, groups[g].slice(0, 30), groups[g][0].type === 'live');
  });

  if (!html) html = makeRow('Todos', list.slice(0, 40), false);
  rows.innerHTML = html;
  bindUI();
}

function renderGrid(list) {
  const titles = { live:'TV ao Vivo', movies:'Filmes', series:'Séries', continue:'Continuar Assistindo', watchlater:'Minha Lista' };
  rows.innerHTML = makeRow(titles[tab] || 'Conteúdo', list, tab === 'live');
  bindUI();
}

function makeRow(title, items, isLive) {
  const cards = items.map((item) => makeCard(item, isLive)).join('');
  return '<div class="row"><h2 class="row-title">' + esc(title) + '</h2><div class="row-wrap">' +
    '<button class="arrow prev" type="button" data-dir="-1">&#10094;</button>' +
    '<div class="row-scroll">' + cards + '</div>' +
    '<button class="arrow next" type="button" data-dir="1">&#10095;</button></div></div>';
}

function makeCard(item, isLive) {
  const prog = store.progress[item.id];
  const pct = prog && prog.duration ? Math.min(100, (prog.time / prog.duration) * 100) : 0;
  const on = store.later.includes(item.id);
  const img = item.logo || avatar(item.name);
  return '<div class="card' + (isLive ? ' is-live' : '') + '" data-id="' + attr(item.id) + '">' +
    '<img class="card-img" src="' + attr(img) + '" alt="" loading="lazy" onerror="this.src=\'' + avatar(item.name) + '\'">' +
    '<div class="card-hover"><div class="card-name">' + esc(item.name) + '</div>' +
    '<div class="card-sub">' + esc(typeLabel(item)) + (prog && prog.time > 10 ? ' · ' + fmt(prog.time) : '') + '</div>' +
    (pct > 2 ? '<div class="card-bar"><i style="width:' + pct + '%"></i></div>' : '') +
    '<div class="card-acts">' +
    '<button class="card-act" data-act="play" type="button">&#9654;</button>' +
    '<button class="card-act' + (on ? ' on' : '') + '" data-act="later" type="button">&#9733;</button>' +
    '</div></div></div>';
}

function bindUI() {
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', (e) => {
      const id = card.dataset.id;
      const item = store.channels.find((c) => c.id === id);
      if (!item) return;
      if (e.target.closest('[data-act="later"]')) { e.stopPropagation(); toggleLater(id); return; }
      play(item);
    });
  });
  document.querySelectorAll('.arrow').forEach((btn) => {
    btn.addEventListener('click', () => {
      const track = btn.parentElement.querySelector('.row-scroll');
      track.scrollBy({ left: parseInt(btn.dataset.dir, 10) * track.clientWidth * 0.75, behavior: 'smooth' });
    });
  });
}

/* PLAY */
async function play(item) {
  current = item;
  store.last = item.id;
  save();
  playerTitle.textContent = item.name;
  playerMeta.textContent = typeLabel(item) + (item.group ? ' · ' + item.group : '');
  btnLaterPlayer.classList.toggle('on', store.later.includes(item.id));
  playerOverlay.hidden = false;
  document.body.style.overflow = 'hidden';

  let url = item.url;

  // Series: fetch first episode if needed
  if (item.type === 'series' && item.seriesId && !url) {
    try {
      playerTitle.textContent = item.name + ' (carregando...)';
      const info = await fetchJson(
        item.xtHost + '/player_api.php?username=' + encodeURIComponent(item.xtUser) +
        '&password=' + encodeURIComponent(item.xtPass) + '&action=get_series_info&series_id=' + item.seriesId
      );
      const episodes = info.episodes || {};
      const firstSeason = Object.keys(episodes).sort((a, b) => Number(a) - Number(b))[0];
      const ep = firstSeason && episodes[firstSeason] && episodes[firstSeason][0];
      if (ep) {
        const ext = ep.container_extension || 'mp4';
        url = item.xtHost + '/series/' + item.xtUser + '/' + item.xtPass + '/' + ep.id + '.' + ext;
        playerMeta.textContent = 'S' + firstSeason + 'E' + (ep.episode_num || '1') + ' · ' + (item.group || 'Séries');
      } else {
        playerTitle.textContent = item.name + ' (sem episódios)';
        return;
      }
    } catch (e) {
      playerTitle.textContent = item.name + ' (erro ao carregar série)';
      return;
    }
  }

  if (!url) {
    playerTitle.textContent = item.name + ' (sem URL)';
    return;
  }

  if (hls) { hls.destroy(); hls = null; }
  const start = store.progress[item.id]?.time || 0;

  const isHls = /\.m3u8($|\?)/i.test(url) || item.type === 'live';

  if (isHls && window.Hls && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (start > 10 && start < (video.duration || Infinity) - 15) video.currentTime = start;
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (d.fatal) playerTitle.textContent = item.name + ' (erro no stream)';
    });
  } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.addEventListener('loadedmetadata', function onMeta() {
      video.removeEventListener('loadedmetadata', onMeta);
      if (start > 10) video.currentTime = start;
      video.play().catch(() => {});
    });
  } else {
    // mp4 / direct
    video.src = url;
    video.addEventListener('loadedmetadata', function onMeta() {
      video.removeEventListener('loadedmetadata', onMeta);
      if (start > 10) video.currentTime = start;
      video.play().catch(() => {});
    });
  }

  playerTitle.textContent = item.name;
}

function closePlayer() {
  if (current) saveProgress(current.id, video.currentTime, video.duration);
  playerOverlay.hidden = true;
  document.body.style.overflow = '';
  video.pause();
  if (hls) { hls.destroy(); hls = null; }
  video.removeAttribute('src');
  video.load();
  render();
}

function saveProgress(id, time, duration) {
  if (!id || !duration || isNaN(duration)) return;
  store.progress[id] = { time: Math.floor(time), duration: Math.floor(duration), updated: Date.now() };
  if (time / duration > 0.95) delete store.progress[id];
  save();
}

function toggleLater(id) {
  const i = store.later.indexOf(id);
  if (i >= 0) store.later.splice(i, 1);
  else store.later.push(id);
  save();
  heroLater.classList.toggle('on', store.later.includes(current?.id));
  btnLaterPlayer.classList.toggle('on', store.later.includes(current?.id));
  render();
}

/* M3U parse */
function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const name = (line.match(/,(.+)$/) || [])[1]?.trim() || 'Canal';
      const logo = (line.match(/tvg-logo="([^"]*)"/i) || [])[1] || '';
      const group = (line.match(/group-title="([^"]*)"/i) || [])[1] || 'Outros';
      cur = { id: 'c_' + hash(name + logo + i), name, logo, group, type: detect(group, name), url: '' };
    } else if (line && !line.startsWith('#') && cur) {
      cur.url = line;
      out.push(cur);
      cur = null;
    }
  }
  return out;
}

function detect(g, n) {
  const t = (g + ' ' + n).toLowerCase();
  if (/s[eé]rie|series|temporada|episode|episodio|tv show/.test(t)) return 'series';
  if (/filme|movie|cinema|vod|filmes/.test(t)) return 'movie';
  return 'live';
}
function isMovie(g) { return /filme|movie|cinema|vod|filmes/i.test(g || ''); }
function isSeries(g) { return /s[eé]rie|series|temporada|tv show/i.test(g || ''); }
function isVod(g) { return isMovie(g) || isSeries(g); }
function typeLabel(i) { return i.type === 'movie' ? 'Filme' : i.type === 'series' ? 'Série' : 'Ao Vivo'; }
function fmt(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0; return Math.abs(h).toString(36); }
function avatar(n) { return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) + '&background=1a1a1a&color=e50914&size=400&font-size=0.33&bold=true'; }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function attr(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function emptyTitle() {
  if (tab === 'continue') return 'Nada para continuar';
  if (tab === 'watchlater') return 'Sua lista está vazia';
  return 'Nenhum conteúdo';
}
