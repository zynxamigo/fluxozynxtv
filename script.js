const STORAGE_KEY = 'fluxozynxtv_data';

const defaultDemo = [
  { id: 'demo1', name: 'Big Buck Bunny', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', group: 'Demo', type: 'movie' },
  { id: 'demo2', name: 'Sintel', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Sintel_poster.jpg/220px-Sintel_poster.jpg', url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', group: 'Demo', type: 'movie' },
  { id: 'demo3', name: 'Tears of Steel', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Tears_of_Steel_poster.jpg/220px-Tears_of_Steel_poster.jpg', url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8', group: 'Demo', type: 'movie' },
  { id: 'demo4', name: 'Apple Test Stream', logo: '', url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8', group: 'Demo', type: 'live' }
];

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    channels: [...defaultDemo],
    progress: {},
    watchLater: [],
    lastPlayed: null
  };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = loadData();
let currentTab = 'live';
let currentCategory = 'all';
let currentItem = null;
let hls = null;

const video = document.getElementById('video');
const channelsList = document.getElementById('channelsList');
const categoriesEl = document.getElementById('categories');
const searchInput = document.getElementById('searchInput');
const playerOverlay = document.getElementById('playerOverlay');
const currentTitle = document.getElementById('currentTitle');
const currentType = document.getElementById('currentType');
const btnPlaylist = document.getElementById('btnPlaylist');
const m3uFile = document.getElementById('m3uFile');
const btnWatchLater = document.getElementById('btnWatchLater');
const mainTabs = document.getElementById('mainTabs');

mainTabs.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    currentCategory = 'all';
    mainTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

searchInput.addEventListener('input', () => render());
btnPlaylist.addEventListener('click', () => m3uFile.click());
m3uFile.addEventListener('change', handleM3UFile);
btnWatchLater.addEventListener('click', toggleWatchLater);

video.addEventListener('timeupdate', () => {
  if (currentItem && video.duration && !isNaN(video.duration)) {
    saveProgress(currentItem.id, video.currentTime, video.duration);
  }
});

video.addEventListener('pause', () => {
  if (currentItem) saveProgress(currentItem.id, video.currentTime, video.duration);
});

window.addEventListener('beforeunload', () => {
  if (currentItem) saveProgress(currentItem.id, video.currentTime, video.duration);
});

render();

function render() {
  renderCategories();
  renderList();
}

function getItemsForTab() {
  let items = data.channels;

  if (currentTab === 'live') {
    items = items.filter(c => c.type === 'live' || (!c.type && !isVodGroup(c.group)));
  } else if (currentTab === 'movies') {
    items = items.filter(c => c.type === 'movie' || isMovieGroup(c.group));
  } else if (currentTab === 'series') {
    items = items.filter(c => c.type === 'series' || isSeriesGroup(c.group));
  } else if (currentTab === 'continue') {
    items = items.filter(c => data.progress[c.id] && data.progress[c.id].time > 10)
      .sort((a, b) => (data.progress[b.id]?.updated || 0) - (data.progress[a.id]?.updated || 0));
  } else if (currentTab === 'watchlater') {
    items = items.filter(c => data.watchLater.includes(c.id));
  }

  if (currentCategory !== 'all') {
    items = items.filter(c => (c.group || 'Outros') === currentCategory);
  }

  const q = searchInput.value.toLowerCase().trim();
  if (q) items = items.filter(c => c.name.toLowerCase().includes(q));

  return items;
}

function renderCategories() {
  let base = data.channels;
  if (currentTab === 'live') base = base.filter(c => c.type === 'live' || (!c.type && !isVodGroup(c.group)));
  else if (currentTab === 'movies') base = base.filter(c => c.type === 'movie' || isMovieGroup(c.group));
  else if (currentTab === 'series') base = base.filter(c => c.type === 'series' || isSeriesGroup(c.group));
  else if (currentTab === 'continue') base = base.filter(c => data.progress[c.id] && data.progress[c.id].time > 10);
  else if (currentTab === 'watchlater') base = base.filter(c => data.watchLater.includes(c.id));

  const groups = ['all', ...new Set(base.map(c => c.group || 'Outros'))];

  categoriesEl.innerHTML = groups.map(g => `
    <button class="cat-btn ${g === currentCategory ? 'active' : ''}" data-cat="${escapeAttr(g)}">
      ${g === 'all' ? 'Todos' : escapeHtml(g)}
    </button>
  `).join('');

  categoriesEl.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.cat;
      render();
    });
  });
}

function renderList() {
  const items = getItemsForTab();

  if (items.length === 0) {
    let msg = 'Nenhum item encontrado';
    if (currentTab === 'continue') msg = 'Nada para continuar. Assista algo e volte aqui!';
    if (currentTab === 'watchlater') msg = 'Sua lista "Assistir Depois" está vazia';
    if (data.channels.length <= 4 && currentTab === 'live') msg = 'Carregue uma playlist M3U para ver canais ao vivo';
    channelsList.innerHTML = `<p class="empty-msg">${msg}</p>`;
    return;
  }

  channelsList.innerHTML = items.map(item => {
    const prog = data.progress[item.id];
    const pct = prog && prog.duration ? Math.min(100, (prog.time / prog.duration) * 100) : 0;
    const inLater = data.watchLater.includes(item.id);
    const logo = item.logo || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=14141a&color=6c5ce7&size=96`;

    return `
      <div class="channel-item ${currentItem?.id === item.id ? 'active' : ''}" data-id="${escapeAttr(item.id)}">
        <img class="channel-logo" src="${escapeAttr(logo)}" alt="" loading="lazy"
             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=14141a&color=6c5ce7&size=96'">
        <div class="channel-info">
          <h4>${escapeHtml(item.name)}</h4>
          <span>${escapeHtml(item.group || 'Outros')} ${prog && prog.time > 10 ? '• ' + formatTime(prog.time) : ''}</span>
          ${pct > 2 ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>` : ''}
        </div>
        <div class="item-actions">
          <button class="action-btn ${inLater ? 'active' : ''}" data-action="later" title="Assistir depois">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${inLater ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  channelsList.querySelectorAll('.channel-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="later"]')) {
        e.stopPropagation();
        toggleWatchLaterById(el.dataset.id);
        return;
      }
      const item = data.channels.find(c => c.id === el.dataset.id);
      if (item) playItem(item);
    });
  });
}

function playItem(item) {
  currentItem = item;
  data.lastPlayed = item.id;
  saveData();

  currentTitle.textContent = item.name;
  currentType.textContent = typeLabel(item);
  playerOverlay.classList.add('hidden');
  updateWatchLaterBtn();

  document.querySelectorAll('.channel-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === item.id);
  });

  if (hls) { hls.destroy(); hls = null; }

  const startTime = data.progress[item.id]?.time || 0;

  if (Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(item.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (startTime > 10 && startTime < (video.duration || Infinity) - 15) {
        video.currentTime = startTime;
      }
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (d.fatal) currentTitle.textContent = item.name + ' (erro ao carregar)';
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = item.url;
    video.addEventListener('loadedmetadata', function onMeta() {
      video.removeEventListener('loadedmetadata', onMeta);
      if (startTime > 10) video.currentTime = startTime;
      video.play().catch(() => {});
    });
  } else {
    alert('Seu navegador não suporta HLS.');
  }

  renderList();
}

function saveProgress(id, time, duration) {
  if (!id || !duration || isNaN(duration)) return;
  data.progress[id] = {
    time: Math.floor(time),
    duration: Math.floor(duration),
    updated: Date.now()
  };
  if (time / duration > 0.95) {
    delete data.progress[id];
  }
  saveData();
}

function toggleWatchLater() {
  if (!currentItem) return;
  toggleWatchLaterById(currentItem.id);
}

function toggleWatchLaterById(id) {
  const idx = data.watchLater.indexOf(id);
  if (idx >= 0) data.watchLater.splice(idx, 1);
  else data.watchLater.push(id);
  saveData();
  updateWatchLaterBtn();
  render();
}

function updateWatchLaterBtn() {
  if (!currentItem) return;
  const active = data.watchLater.includes(currentItem.id);
  btnWatchLater.classList.toggle('active', active);
}

function handleM3UFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const parsed = parseM3U(ev.target.result);
    if (parsed.length === 0) {
      alert('Nenhum canal válido encontrado.');
      return;
    }
    data.channels = parsed;
    saveData();
    currentTab = 'live';
    currentCategory = 'all';
    mainTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'live'));
    render();
    alert(`${parsed.length} itens carregados!`);
  };
  reader.readAsText(file);
  e.target.value = '';
}

function parseM3U(content) {
  const lines = content.split(/\r?\n/);
  const result = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const name = nameMatch ? nameMatch[1].trim() : 'Canal';
      const group = groupMatch ? groupMatch[1] : 'Outros';

      current = {
        id: 'ch_' + hash(name + (logoMatch ? logoMatch[1] : '') + i),
        name,
        logo: logoMatch ? logoMatch[1] : '',
        group,
        type: detectType(group, name),
        url: ''
      };
    } else if (line && !line.startsWith('#') && current) {
      current.url = line;
      result.push(current);
      current = null;
    }
  }
  return result;
}

function detectType(group, name) {
  const g = (group + ' ' + name).toLowerCase();
  if (/s[eé]rie|series|temporada|episode|episodio|tv show/i.test(g)) return 'series';
  if (/filme|movie|cinema|vod|filmes/i.test(g)) return 'movie';
  return 'live';
}

function isMovieGroup(g) {
  return /filme|movie|cinema|vod|filmes/i.test(g || '');
}
function isSeriesGroup(g) {
  return /s[eé]rie|series|temporada|tv show/i.test(g || '');
}
function isVodGroup(g) {
  return isMovieGroup(g) || isSeriesGroup(g);
}

function typeLabel(item) {
  if (item.type === 'movie') return 'Filme';
  if (item.type === 'series') return 'Série';
  return 'Ao Vivo';
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}