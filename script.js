const KEY = 'fluxozynxtv_v3';

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
  return { channels: [...demos], progress: {}, later: [], last: null };
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(store));
}

let store = load();
let tab = 'home';
let current = null;
let hls = null;

const $ = (id) => document.getElementById(id);

/* elements */
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

/* scroll nav */
window.addEventListener('scroll', () => {
  navbar.classList.toggle('solid', window.scrollY > 50);
});

/* tabs */
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

/* search */
$('btnSearch').addEventListener('click', () => {
  searchBox.classList.toggle('open');
  if (searchBox.classList.contains('open')) searchInput.focus();
  else {
    searchInput.value = '';
    render();
  }
});

searchInput.addEventListener('input', () => render());

/* playlist */
$('btnPlaylist').addEventListener('click', () => $('m3uFile').click());
$('m3uFile').addEventListener('change', onM3U);

/* hero */
heroPlay.addEventListener('click', () => {
  if (current) play(current);
  else $('btnPlaylist').click();
});

heroLater.addEventListener('click', () => {
  if (current) toggleLater(current.id);
});

/* player */
$('playerClose').addEventListener('click', closePlayer);
playerOverlay.addEventListener('click', (e) => {
  if (e.target === playerOverlay) closePlayer();
});
btnLaterPlayer.addEventListener('click', () => {
  if (current) toggleLater(current.id);
});

video.addEventListener('timeupdate', () => {
  if (current && video.duration && !isNaN(video.duration)) {
    saveProgress(current.id, video.currentTime, video.duration);
  }
});

video.addEventListener('pause', () => {
  if (current) saveProgress(current.id, video.currentTime, video.duration);
});

window.addEventListener('beforeunload', () => {
  if (current) saveProgress(current.id, video.currentTime, video.duration);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !playerOverlay.hidden) closePlayer();
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
    rows.innerHTML = `
      <div class="empty">
        <h3>${emptyTitle()}</h3>
        <p>Carregue uma playlist M3U para começar</p>
        <button class="btn-white" type="button" id="emptyLoad">Carregar M3U</button>
      </div>`;
    const btn = $('emptyLoad');
    if (btn) btn.addEventListener('click', () => $('btnPlaylist').click());
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
    return list
      .filter((c) => store.progress[c.id] && store.progress[c.id].time > 10)
      .sort((a, b) => (store.progress[b.id]?.updated || 0) - (store.progress[a.id]?.updated || 0));
  }
  if (t === 'watchlater') return list.filter((c) => store.later.includes(c.id));
  return list;
}

function setHero(item) {
  current = item || null;
  if (!item) {
    heroTitle.textContent = 'Carregue sua playlist';
    heroText.textContent = 'Importe um arquivo M3U e comece a assistir.';
    heroTag.textContent = 'Bem-vindo';
    heroImage.style.backgroundImage = 'none';
    return;
  }
  heroTitle.textContent = item.name;
  heroText.textContent = item.group ? typeLabel(item) + ' · ' + item.group : typeLabel(item);
  heroTag.textContent = tab === 'continue' ? 'Continuar' : item.type === 'live' ? 'Ao Vivo' : 'Destaque';
  const img = item.logo || avatar(item.name);
  heroImage.style.backgroundImage = 'url("' + img + '")';
  heroLater.classList.toggle('on', store.later.includes(item.id));
}

function renderHome(list) {
  const cont = list
    .filter((c) => store.progress[c.id] && store.progress[c.id].time > 10)
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
  if (live.length) html += makeRow('TV ao Vivo', live.slice(0, 30), true);
  if (movies.length) html += makeRow('Filmes', movies.slice(0, 30), false);
  if (series.length) html += makeRow('Séries', series.slice(0, 30), false);

  Object.keys(groups).forEach((g) => {
    if (['Destaques', 'Demo', 'Demo Live'].includes(g)) return;
    if (groups[g].length >= 3) {
      html += makeRow(g, groups[g].slice(0, 24), groups[g][0].type === 'live');
    }
  });

  if (!html) html = makeRow('Todos', list.slice(0, 40), false);
  rows.innerHTML = html;
  bindUI();
}

function renderGrid(list) {
  const titles = {
    live: 'TV ao Vivo',
    movies: 'Filmes',
    series: 'Séries',
    continue: 'Continuar Assistindo',
    watchlater: 'Minha Lista'
  };
  const isLive = tab === 'live';
  rows.innerHTML = makeRow(titles[tab] || 'Conteúdo', list, isLive);
  bindUI();
}

function makeRow(title, items, isLive) {
  const cards = items.map((item) => makeCard(item, isLive)).join('');
  return (
    '<div class="row">' +
    '<h2 class="row-title">' + esc(title) + '</h2>' +
    '<div class="row-wrap">' +
    '<button class="arrow prev" type="button" data-dir="-1" aria-label="Anterior">&#10094;</button>' +
    '<div class="row-scroll">' + cards + '</div>' +
    '<button class="arrow next" type="button" data-dir="1" aria-label="Próximo">&#10095;</button>' +
    '</div></div>'
  );
}

function makeCard(item, isLive) {
  const prog = store.progress[item.id];
  const pct = prog && prog.duration ? Math.min(100, (prog.time / prog.duration) * 100) : 0;
  const on = store.later.includes(item.id);
  const img = item.logo || avatar(item.name);
  return (
    '<div class="card' + (isLive ? ' is-live' : '') + '" data-id="' + attr(item.id) + '">' +
    '<img class="card-img" src="' + attr(img) + '" alt="" loading="lazy" onerror="this.src=\'' + avatar(item.name) + '\'">' +
    '<div class="card-hover">' +
    '<div class="card-name">' + esc(item.name) + '</div>' +
    '<div class="card-sub">' + esc(typeLabel(item)) + (prog && prog.time > 10 ? ' · ' + fmt(prog.time) : '') + '</div>' +
    (pct > 2 ? '<div class="card-bar"><i style="width:' + pct + '%"></i></div>' : '') +
    '<div class="card-acts">' +
    '<button class="card-act" data-act="play" type="button" title="Assistir">&#9654;</button>' +
    '<button class="card-act' + (on ? ' on' : '') + '" data-act="later" type="button" title="Minha Lista">&#9733;</button>' +
    '</div></div></div>'
  );
}

function bindUI() {
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', (e) => {
      const id = card.dataset.id;
      const item = store.channels.find((c) => c.id === id);
      if (!item) return;
      if (e.target.closest('[data-act="later"]')) {
        e.stopPropagation();
        toggleLater(id);
        return;
      }
      play(item);
    });
  });

  document.querySelectorAll('.arrow').forEach((btn) => {
    btn.addEventListener('click', () => {
      const track = btn.parentElement.querySelector('.row-scroll');
      const dir = parseInt(btn.dataset.dir, 10);
      track.scrollBy({ left: dir * track.clientWidth * 0.75, behavior: 'smooth' });
    });
  });
}

/* ========== PLAY ========== */
function play(item) {
  current = item;
  store.last = item.id;
  save();
  playerTitle.textContent = item.name;
  playerMeta.textContent = typeLabel(item) + (item.group ? ' · ' + item.group : '');
  btnLaterPlayer.classList.toggle('on', store.later.includes(item.id));
  playerOverlay.hidden = false;
  document.body.style.overflow = 'hidden';

  if (hls) {
    hls.destroy();
    hls = null;
  }

  const start = store.progress[item.id]?.time || 0;

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(item.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (start > 10 && start < (video.duration || Infinity) - 15) video.currentTime = start;
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (d.fatal) playerTitle.textContent = item.name + ' (erro)';
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = item.url;
    video.addEventListener('loadedmetadata', function onMeta() {
      video.removeEventListener('loadedmetadata', onMeta);
      if (start > 10) video.currentTime = start;
      video.play().catch(() => {});
    });
  } else {
    alert('Seu navegador não suporta HLS');
  }
}

function closePlayer() {
  if (current) saveProgress(current.id, video.currentTime, video.duration);
  playerOverlay.hidden = true;
  document.body.style.overflow = '';
  video.pause();
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.removeAttribute('src');
  video.load();
  render();
}

function saveProgress(id, time, duration) {
  if (!id || !duration || isNaN(duration)) return;
  store.progress[id] = {
    time: Math.floor(time),
    duration: Math.floor(duration),
    updated: Date.now()
  };
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

/* ========== M3U ========== */
function onM3U(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const parsed = parseM3U(ev.target.result);
    if (!parsed.length) {
      alert('Nenhum item válido encontrado');
      return;
    }
    store.channels = parsed;
    save();
    tab = 'home';
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'home'));
    render();
    alert(parsed.length + ' itens carregados!');
  };
  reader.readAsText(file);
  e.target.value = '';
}

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
      cur = {
        id: 'c_' + hash(name + logo + i),
        name,
        logo,
        group,
        type: detect(group, name),
        url: ''
      };
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

function isMovie(g) {
  return /filme|movie|cinema|vod|filmes/i.test(g || '');
}
function isSeries(g) {
  return /s[eé]rie|series|temporada|tv show/i.test(g || '');
}
function isVod(g) {
  return isMovie(g) || isSeries(g);
}
function typeLabel(i) {
  return i.type === 'movie' ? 'Filme' : i.type === 'series' ? 'Série' : 'Ao Vivo';
}
function fmt(s) {
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}
function avatar(n) {
  return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) + '&background=1a1a1a&color=e50914&size=400&font-size=0.33&bold=true';
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
function attr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function emptyTitle() {
  if (tab === 'continue') return 'Nada para continuar';
  if (tab === 'watchlater') return 'Sua lista está vazia';
  return 'Nenhum conteúdo';
}
