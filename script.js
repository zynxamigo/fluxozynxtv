/* FluxoZynxTV - sem demos; carrega só a sua lista */
const KEY = 'fluxozynxtv_v5';

function loadStore() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) {
      const d = JSON.parse(r);
      if (!Array.isArray(d.channels)) d.channels = [];
      return d;
    }
  } catch (e) {}
  return { channels: [], progress: {}, later: [], last: null, xtream: null };
}
function saveStore() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
}

let store = loadStore();
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
const heroLoad = $('heroLoad');
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

/* ===== MODAL ===== */
function openLoad() {
  loadModal.hidden = false;
  setStatus('');
  if (store.xtream) {
    $('xtHost').value = store.xtream.host || '';
    $('xtUser').value = store.xtream.user || '';
    $('xtPass').value = store.xtream.pass || '';
  }
}
function closeLoad() { loadModal.hidden = true; }

$('btnOpenLoad').addEventListener('click', openLoad);
heroLoad.addEventListener('click', openLoad);
$('loadClose').addEventListener('click', closeLoad);
loadModal.addEventListener('click', (e) => { if (e.target === loadModal) closeLoad(); });

document.querySelectorAll('.load-tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.load-tab').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.load-panel').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    const map = { file: 'panelFile', paste: 'panelPaste', url: 'panelUrl', xtream: 'panelXtream' };
    $(map[t.dataset.load]).classList.add('active');
    setStatus('');
  });
});

function setStatus(msg, type) {
  if (!msg) { loadStatus.hidden = true; loadStatus.textContent = ''; return; }
  loadStatus.hidden = false;
  loadStatus.textContent = msg;
  loadStatus.className = 'load-status ' + (type || 'info');
}

/* Arquivo */
const fileDrop = $('fileDrop');
const m3uFile = $('m3uFile');
fileDrop.addEventListener('click', () => m3uFile.click());
m3uFile.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) readFile(f);
  e.target.value = '';
});
['dragover', 'dragenter'].forEach((ev) => {
  fileDrop.addEventListener(ev, (e) => { e.preventDefault(); fileDrop.classList.add('drag'); });
});
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag'));
fileDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDrop.classList.remove('drag');
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) readFile(f);
});

function readFile(file) {
  setStatus('Lendo arquivo...', 'info');
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = parseM3U(String(ev.target.result || ''));
      applyPlaylist(parsed, 'arquivo');
    } catch (err) {
      setStatus('Erro ao processar o arquivo', 'err');
    }
  };
  reader.onerror = () => setStatus('Não foi possível ler o arquivo', 'err');
  reader.readAsText(file);
}

/* Colar */
$('btnLoadPaste').addEventListener('click', () => {
  const text = $('pasteInput').value.trim();
  if (!text) { setStatus('Cole o texto da playlist', 'err'); return; }
  const parsed = parseM3U(text);
  applyPlaylist(parsed, 'texto');
});

/* URL com proxies */
$('btnLoadUrl').addEventListener('click', loadFromUrl);
$('urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadFromUrl(); });

async function fetchText(url) {
  const attempts = [
    url,
    'https://corsproxy.io/?' + encodeURIComponent(url),
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
  ];
  let lastErr = null;
  for (const u of attempts) {
    try {
      const res = await fetch(u, { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text && text.length > 10) return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Falha no download');
}

async function loadFromUrl() {
  let url = $('urlInput').value.trim();
  if (!url) { setStatus('Cole um link', 'err'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;

  setStatus('Baixando playlist...', 'info');
  $('btnLoadUrl').disabled = true;
  try {
    const text = await fetchText(url);
    const parsed = parseM3U(text);
    applyPlaylist(parsed, 'link');
  } catch (err) {
    setStatus('Não deu para baixar o link (bloqueio do servidor). Baixe o .m3u e use Arquivo ou Colar.', 'err');
  }
  $('btnLoadUrl').disabled = false;
}

/* Xtream */
$('btnLoadXtream').addEventListener('click', loadXtream);
$('btnXtreamM3U').addEventListener('click', () => {
  const creds = readXtreamFields();
  if (!creds) return;
  const m3u = creds.host + '/get.php?username=' + encodeURIComponent(creds.user) +
    '&password=' + encodeURIComponent(creds.pass) + '&type=m3u_plus&output=ts';
  setStatus('Link gerado. Abrindo em nova aba — salve o arquivo e use a aba Arquivo.', 'info');
  window.open(m3u, '_blank');
});

function readXtreamFields() {
  let host = $('xtHost').value.trim().replace(/\/$/, '');
  const user = $('xtUser').value.trim();
  const pass = $('xtPass').value.trim();
  if (!host || !user || !pass) {
    setStatus('Preencha servidor, usuário e senha', 'err');
    return null;
  }
  if (!/^https?:\/\//i.test(host)) host = 'http://' + host;
  return { host, user, pass };
}

async function fetchJsonAny(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

async function loadXtream() {
  const creds = readXtreamFields();
  if (!creds) return;
  const { host, user, pass } = creds;
  const getLive = $('xtLive').checked;
  const getVod = $('xtVod').checked;
  const getSeries = $('xtSeries').checked;

  setStatus('Conectando...', 'info');
  $('btnLoadXtream').disabled = true;

  try {
    // 1) Tenta playlist M3U completa (mais compatível)
    setStatus('Tentando baixar M3U do painel...', 'info');
    const m3uUrl = host + '/get.php?username=' + encodeURIComponent(user) +
      '&password=' + encodeURIComponent(pass) + '&type=m3u_plus&output=ts';
    try {
      const text = await fetchText(m3uUrl);
      const parsed = parseM3U(text);
      if (parsed.length) {
        store.xtream = { host, user, pass };
        applyPlaylist(parsed, 'Xtream M3U');
        $('btnLoadXtream').disabled = false;
        return;
      }
    } catch (e) { /* tenta API */ }

    // 2) Player API
    setStatus('Conectando via API...', 'info');
    const authUrl = host + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass);
    const auth = await fetchJsonAny(authUrl);
    if (!auth.user_info || Number(auth.user_info.auth) === 0) {
      throw new Error('Usuário ou senha inválidos');
    }

    const all = [];
    const q = 'username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass);

    if (getLive) {
      setStatus('Carregando canais...', 'info');
      const liveCats = await fetchJsonAny(host + '/player_api.php?' + q + '&action=get_live_categories').catch(() => []);
      const liveStreams = await fetchJsonAny(host + '/player_api.php?' + q + '&action=get_live_streams');
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
      const vodCats = await fetchJsonAny(host + '/player_api.php?' + q + '&action=get_vod_categories').catch(() => []);
      const vodStreams = await fetchJsonAny(host + '/player_api.php?' + q + '&action=get_vod_streams');
      const catMap = mapCats(vodCats);
      (vodStreams || []).forEach((s) => {
        const ext = s.container_extension || 'mp4';
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
      const serCats = await fetchJsonAny(host + '/player_api.php?' + q + '&action=get_series_categories').catch(() => []);
      const seriesList = await fetchJsonAny(host + '/player_api.php?' + q + '&action=get_series');
      const catMap = mapCats(serCats);
      (seriesList || []).slice(0, 800).forEach((s) => {
        all.push({
          id: 'ser_' + s.series_id,
          name: s.name || 'Série',
          logo: s.cover || '',
          group: catMap[s.category_id] || 'Séries',
          type: 'series',
          url: '',
          seriesId: s.series_id,
          xtHost: host,
          xtUser: user,
          xtPass: pass
        });
      });
    }

    store.xtream = { host, user, pass };
    applyPlaylist(all, 'Xtream API');
  } catch (err) {
    console.error(err);
    setStatus(
      (err && err.message ? err.message + '. ' : '') +
      'Se continuar falhando: use "Gerar link M3U", baixe o arquivo e carregue na aba Arquivo.',
      'err'
    );
  }
  $('btnLoadXtream').disabled = false;
}

function mapCats(arr) {
  const m = {};
  (arr || []).forEach((c) => { m[c.category_id] = c.category_name; });
  return m;
}

function applyPlaylist(parsed, source) {
  if (!parsed || !parsed.length) {
    setStatus('Nenhum canal/filme encontrado nessa lista', 'err');
    return;
  }
  store.channels = parsed;
  saveStore();
  setStatus(parsed.length + ' itens carregados (' + source + ')!', 'ok');
  tab = 'home';
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'home'));
  setTimeout(() => { closeLoad(); render(); }, 600);
}

/* player */
heroPlay.addEventListener('click', () => { if (current) play(current); else openLoad(); });
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

/* RENDER */
function render() {
  const q = searchInput.value.toLowerCase().trim();
  let list = byTab(store.channels, tab);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));

  const featured = list.find((c) => store.progress[c.id]) || list[0] || null;
  setHero(featured);

  if (!store.channels.length) {
    rows.innerHTML =
      '<div class="empty">' +
      '<h3>Nenhuma lista carregada</h3>' +
      '<p>Big Buck Bunny e demos foram removidos. Carregue sua playlist por arquivo (recomendado), colar texto, link ou Xtream.</p>' +
      '<button class="btn-white" type="button" id="emptyLoad">Carregar lista</button></div>';
    const btn = $('emptyLoad');
    if (btn) btn.addEventListener('click', openLoad);
    return;
  }

  if (!list.length) {
    rows.innerHTML = '<div class="empty"><h3>' + emptyTitle() + '</h3><p>Nada nesta categoria.</p></div>';
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
    heroTitle.textContent = 'Carregue sua lista';
    heroText.textContent = 'Arquivo M3U (melhor opção), colar, link ou login Xtream.';
    heroTag.textContent = 'Bem-vindo';
    heroImage.style.backgroundImage = 'none';
    heroPlay.hidden = true;
    heroLater.hidden = true;
    heroLoad.hidden = false;
    return;
  }
  heroTitle.textContent = item.name;
  heroText.textContent = item.group ? typeLabel(item) + ' · ' + item.group : typeLabel(item);
  heroTag.textContent = tab === 'continue' ? 'Continuar' : item.type === 'live' ? 'Ao Vivo' : 'Destaque';
  heroImage.style.backgroundImage = 'url("' + (item.logo || avatar(item.name)) + '")';
  heroPlay.hidden = false;
  heroLater.hidden = false;
  heroLoad.hidden = true;
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
  if (live.length) html += makeRow('TV ao Vivo', live.slice(0, 50), true);
  if (movies.length) html += makeRow('Filmes', movies.slice(0, 50), false);
  if (series.length) html += makeRow('Séries', series.slice(0, 50), false);

  Object.keys(groups).forEach((g) => {
    if (groups[g].length >= 5) html += makeRow(g, groups[g].slice(0, 40), groups[g][0].type === 'live');
  });

  if (!html) html = makeRow('Todos', list.slice(0, 50), false);
  rows.innerHTML = html;
  bindUI();
}

function renderGrid(list) {
  const titles = { live: 'TV ao Vivo', movies: 'Filmes', series: 'Séries', continue: 'Continuar Assistindo', watchlater: 'Minha Lista' };
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

async function play(item) {
  current = item;
  store.last = item.id;
  saveStore();
  playerTitle.textContent = item.name;
  playerMeta.textContent = typeLabel(item) + (item.group ? ' · ' + item.group : '');
  btnLaterPlayer.classList.toggle('on', store.later.includes(item.id));
  playerOverlay.hidden = false;
  document.body.style.overflow = 'hidden';

  let url = item.url;

  if (item.type === 'series' && item.seriesId && !url) {
    try {
      playerTitle.textContent = item.name + ' (carregando...)';
      const info = await fetchJsonAny(
        item.xtHost + '/player_api.php?username=' + encodeURIComponent(item.xtUser) +
        '&password=' + encodeURIComponent(item.xtPass) + '&action=get_series_info&series_id=' + item.seriesId
      );
      const episodes = info.episodes || {};
      const firstSeason = Object.keys(episodes).sort((a, b) => Number(a) - Number(b))[0];
      const ep = firstSeason && episodes[firstSeason] && episodes[firstSeason][0];
      if (ep) {
        const ext = ep.container_extension || 'mp4';
        url = item.xtHost + '/series/' + item.xtUser + '/' + item.xtPass + '/' + ep.id + '.' + ext;
        playerMeta.textContent = 'S' + firstSeason + 'E' + (ep.episode_num || '1');
      } else {
        playerTitle.textContent = item.name + ' (sem episódios)';
        return;
      }
    } catch (e) {
      playerTitle.textContent = item.name + ' (erro na série)';
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
  saveStore();
}

function toggleLater(id) {
  const i = store.later.indexOf(id);
  if (i >= 0) store.later.splice(i, 1);
  else store.later.push(id);
  saveStore();
  heroLater.classList.toggle('on', store.later.includes(current?.id));
  btnLaterPlayer.classList.toggle('on', store.later.includes(current?.id));
  render();
}

/* Parser M3U mais tolerante */
function parseM3U(text) {
  if (!text) return [];
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const out = [];
  let cur = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      let name = 'Canal';
      const comma = line.indexOf(',');
      if (comma >= 0) name = line.slice(comma + 1).trim() || name;

      const logo = (line.match(/tvg-logo="([^"]*)"/i) || line.match(/tvg-logo='([^']*)'/i) || [])[1] || '';
      const group = (line.match(/group-title="([^"]*)"/i) || line.match(/group-title='([^']*)'/i) || [])[1] || 'Outros';

      cur = {
        id: 'c_' + hash(name + logo + i),
        name,
        logo,
        group,
        type: detect(group, name),
        url: ''
      };
    } else if (!line.startsWith('#') && cur) {
      cur.url = line;
      if (cur.url) out.push(cur);
      cur = null;
    } else if (!line.startsWith('#') && /^https?:\/\//i.test(line)) {
      // linha solta com URL
      out.push({
        id: 'c_' + hash(line + i),
        name: 'Stream ' + (out.length + 1),
        logo: '',
        group: 'Outros',
        type: 'live',
        url: line
      });
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
function hash(s) { let h = 0; for (let i = 0; i < String(s).length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0; return Math.abs(h).toString(36); }
function avatar(n) {
  return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n || '?') + '&background=1a1a1a&color=e50914&size=400&font-size=0.33&bold=true';
}
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function attr(s) { return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function emptyTitle() {
  if (tab === 'continue') return 'Nada para continuar';
  if (tab === 'watchlater') return 'Lista vazia';
  return 'Nenhum item';
}
