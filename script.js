const KEY = 'fluxozynxtv_v6';

function loadStore() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) {
      const d = JSON.parse(r);
      d.channels = Array.isArray(d.channels) ? d.channels : [];
      d.profiles = Array.isArray(d.profiles) ? d.profiles : [];
      d.progress = d.progress || {};
      d.later = d.later || [];
      return d;
    }
  } catch (e) {}
  return { channels: [], profiles: [], progress: {}, later: [], activeProfileId: null };
}
function saveStore() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
}

let store = loadStore();
let tab = 'home';
let current = null;
let hls = null;
let lastParsed = []; // resultados do último teste em memória

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
const profileSelect = $('profileSelect');
const testResults = $('testResults');
const profilesList = $('profilesList');

window.addEventListener('scroll', () => navbar.classList.toggle('solid', window.scrollY > 50));

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
});

$('btnSearch').addEventListener('click', () => {
  searchBox.classList.toggle('open');
  if (searchBox.classList.contains('open')) searchInput.focus();
  else { searchInput.value = ''; render(); }
});
searchInput.addEventListener('input', () => render());

profileSelect.addEventListener('change', async () => {
  const id = profileSelect.value;
  if (!id) return;
  await activateProfile(id);
});

/* modal */
function openLoad() {
  loadModal.hidden = false;
  setStatus('');
  renderProfilesPanel();
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
    const map = { bulk: 'panelBulk', profiles: 'panelProfiles', file: 'panelFile', url: 'panelUrl', xtream: 'panelXtream' };
    $(map[t.dataset.load]).classList.add('active');
    setStatus('');
    if (t.dataset.load === 'profiles') renderProfilesPanel();
  });
});

function setStatus(msg, type) {
  if (!msg) { loadStatus.hidden = true; loadStatus.textContent = ''; return; }
  loadStatus.hidden = false;
  loadStatus.textContent = msg;
  loadStatus.className = 'load-status ' + (type || 'info');
}

/* ===== EXTRAIR BLOCOS DO USUÁRIO ===== */
function extractFromBulk(text) {
  const blocks = [];
  // split por linhas de traço ou por [TÍTULO]
  const parts = text.split(/(?=\[[^\]]+\])|(?=━{5,})|(?=_{5,})|(?=-{10,})/i).filter((p) => p.trim().length > 15);

  const tryOne = (chunk, idx) => {
    const m3u =
      matchField(chunk, /Link\s*M3U\s*[:：]\s*(.+)/i) ||
      matchField(chunk, /M3U\s*[:：]\s*(https?:\/\/\S+)/i) ||
      matchField(chunk, /(https?:\/\/[^\s"']+get\.php[^\s"']*)/i) ||
      matchField(chunk, /(https?:\/\/[^\s"']+\.(m3u8?|txt)(?:\?[^\s"']*)?)/i);

    if (!m3u) return null;

    const server = matchField(chunk, /Servidor\s*[:：]\s*(.+)/i) || matchField(chunk, /Server\s*[:：]\s*(.+)/i);
    const user = matchField(chunk, /Usu[aá]rio\s*[:：]\s*(.+)/i) || matchField(chunk, /User(?:name)?\s*[:：]\s*(.+)/i);
    const pass = matchField(chunk, /Senha\s*[:：]\s*(.+)/i) || matchField(chunk, /Pass(?:word)?\s*[:：]\s*(.+)/i);
    const status = matchField(chunk, /Status\s*[:：]\s*(.+)/i);
    const expira = matchField(chunk, /Expira(?:\s*em)?\s*[:：]\s*(.+)/i);
    const title =
      (chunk.match(/\[([^\]]+)\]/) || [])[1] ||
      (server ? hostLabel(server) : null) ||
      'Lista ' + (idx + 1);

    return {
      name: clean(title),
      m3u: cleanUrl(m3u),
      server: server ? clean(server) : '',
      user: user ? clean(user) : '',
      pass: pass ? clean(pass) : '',
      status: status ? clean(status) : '',
      expira: expira ? clean(expira) : ''
    };
  };

  if (parts.length) {
    parts.forEach((p, i) => {
      const o = tryOne(p, i);
      if (o) blocks.push(o);
    });
  }

  // fallback: texto inteiro
  if (!blocks.length) {
    const o = tryOne(text, 0);
    if (o) blocks.push(o);
  }

  // dedupe por m3u
  const seen = new Set();
  return blocks.filter((b) => {
    if (seen.has(b.m3u)) return false;
    seen.add(b.m3u);
    return true;
  });
}

function matchField(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}
function clean(s) {
  return String(s).replace(/[📡👤🔐💎📆🔗💀📃📅]/g, '').replace(/━+/g, '').trim();
}
function cleanUrl(s) {
  return clean(s).replace(/[<>"']/g, '').split(/\s/)[0];
}
function hostLabel(u) {
  try { return new URL(/^https?:/i.test(u) ? u : 'http://' + u).hostname; } catch (e) { return u; }
}

/* ===== FETCH / TESTE M3U ===== */
async function fetchText(url) {
  const attempts = [
    url,
    'https://corsproxy.io/?' + encodeURIComponent(url),
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
  ];
  let lastErr = null;
  for (const u of attempts) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 18000);
      const res = await fetch(u, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text && text.length > 20) return text;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('download falhou');
}

async function testM3U(url) {
  try {
    const text = await fetchText(url);
    const channels = parseM3U(text);
    if (!channels.length) {
      return { ok: false, reason: 'Resposta sem canais válidos', channels: [], count: 0, raw: text.slice(0, 200) };
    }
    return { ok: true, reason: channels.length + ' itens', channels, count: channels.length };
  } catch (e) {
    return { ok: false, reason: 'Não baixou (CORS/servidor/offline)', channels: [], count: 0 };
  }
}

/* Colar e testar */
$('btnParseTest').addEventListener('click', async () => {
  const text = $('bulkInput').value.trim();
  if (!text) { setStatus('Cole seus blocos salvos', 'err'); return; }

  const extracted = extractFromBulk(text);
  if (!extracted.length) {
    setStatus('Nenhum Link M3U encontrado. Confira se tem a linha "Link M3U: http..."', 'err');
    return;
  }

  setStatus('Encontrei ' + extracted.length + ' link(s). Testando...', 'info');
  $('btnParseTest').disabled = true;
  testResults.hidden = false;
  testResults.innerHTML = '';
  lastParsed = [];

  for (let i = 0; i < extracted.length; i++) {
    const item = extracted[i];
    const card = document.createElement('div');
    card.className = 'test-card';
    card.innerHTML =
      '<div class="t-name">' + esc(item.name) + '</div>' +
      '<div class="t-meta">' + esc(item.m3u) + '</div>' +
      '<div class="t-status">Testando...</div>';
    testResults.appendChild(card);

    const result = await testM3U(item.m3u);
    const entry = { ...item, ...result, id: 'p_' + hash(item.m3u) };
    lastParsed.push(entry);

    card.classList.add(result.ok ? 'ok' : 'fail');
    card.querySelector('.t-status').textContent = result.ok
      ? '✓ Funcionou — ' + result.reason
      : '✗ Falhou — ' + result.reason;

    const actions = document.createElement('div');
    actions.className = 'test-actions';
    if (result.ok) {
      const b1 = document.createElement('button');
      b1.className = 'btn-use';
      b1.type = 'button';
      b1.textContent = 'Salvar perfil e usar';
      b1.onclick = () => saveAndUseProfile(entry);
      actions.appendChild(b1);

      const b2 = document.createElement('button');
      b2.className = 'btn-ok';
      b2.type = 'button';
      b2.textContent = 'Só salvar perfil';
      b2.onclick = () => { saveProfile(entry, false); setStatus('Perfil salvo: ' + entry.name, 'ok'); renderProfilesPanel(); refreshProfileSelect(); };
      actions.appendChild(b2);
    } else {
      const b = document.createElement('button');
      b.className = 'btn-fail';
      b.type = 'button';
      b.textContent = 'Abrir link (baixar M3U)';
      b.onclick = () => window.open(item.m3u, '_blank');
      actions.appendChild(b);
    }
    card.appendChild(actions);
  }

  const okN = lastParsed.filter((x) => x.ok).length;
  setStatus('Teste ok: ' + okN + '/' + lastParsed.length + ' link(s). Salve os que funcionaram.', okN ? 'ok' : 'err');
  $('btnParseTest').disabled = false;
});

function saveProfile(entry, activate) {
  const existing = store.profiles.findIndex((p) => p.m3u === entry.m3u);
  const profile = {
    id: entry.id || 'p_' + hash(entry.m3u),
    name: entry.name,
    m3u: entry.m3u,
    server: entry.server || '',
    user: entry.user || '',
    pass: entry.pass || '',
    status: entry.ok ? 'ok' : 'fail',
    count: entry.count || 0,
    channels: entry.channels || [],
    testedAt: Date.now()
  };
  if (existing >= 0) store.profiles[existing] = { ...store.profiles[existing], ...profile };
  else store.profiles.push(profile);
  saveStore();
  if (activate) activateProfile(profile.id);
}

function saveAndUseProfile(entry) {
  saveProfile(entry, true);
  setStatus('Perfil ativo: ' + entry.name + ' (' + entry.count + ' itens)', 'ok');
  setTimeout(() => closeLoad(), 500);
}

async function activateProfile(id) {
  const p = store.profiles.find((x) => x.id === id);
  if (!p) return;

  // se já tem channels em cache, usa; senão baixa de novo
  if (p.channels && p.channels.length) {
    store.channels = p.channels;
    store.activeProfileId = p.id;
    saveStore();
    refreshProfileSelect();
    render();
    return;
  }

  setStatus('Carregando lista do perfil...', 'info');
  const result = await testM3U(p.m3u);
  if (!result.ok) {
    p.status = 'fail';
    saveStore();
    setStatus('Esse link não baixou agora. Baixe o M3U e use a aba Arquivo.', 'err');
    renderProfilesPanel();
    return;
  }
  p.channels = result.channels;
  p.count = result.count;
  p.status = 'ok';
  store.channels = result.channels;
  store.activeProfileId = p.id;
  saveStore();
  refreshProfileSelect();
  render();
  setStatus('Perfil carregado: ' + p.name, 'ok');
}

function renderProfilesPanel() {
  if (!store.profiles.length) {
    profilesList.innerHTML = '<p class="load-hint">Nenhum perfil ainda. Use "Colar blocos" ou Arquivo/Link.</p>';
    return;
  }
  profilesList.innerHTML = store.profiles.map((p) => {
    const active = store.activeProfileId === p.id;
    const badge = p.status === 'ok' ? 'ok' : p.status === 'fail' ? 'fail' : 'unk';
    const label = p.status === 'ok' ? (p.count || '?') + ' itens' : p.status === 'fail' ? 'falhou' : '—';
    return '<div class="prof-card' + (active ? ' active' : '') + '">' +
      '<div class="prof-info"><strong>' + esc(p.name) + (active ? ' · ativo' : '') + '</strong>' +
      '<span>' + esc(p.m3u) + '</span></div>' +
      '<span class="prof-badge ' + badge + '">' + label + '</span>' +
      '<div class="test-actions">' +
      '<button type="button" class="btn-use" data-act="use" data-id="' + attr(p.id) + '">Usar</button>' +
      '<button type="button" class="btn-fail" data-act="del" data-id="' + attr(p.id) + '">Apagar</button>' +
      '</div></div>';
  }).join('');

  profilesList.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (btn.dataset.act === 'use') await activateProfile(id);
      if (btn.dataset.act === 'del') {
        store.profiles = store.profiles.filter((p) => p.id !== id);
        if (store.activeProfileId === id) {
          store.activeProfileId = null;
          store.channels = [];
        }
        saveStore();
        refreshProfileSelect();
        renderProfilesPanel();
        render();
      }
    });
  });
}

function refreshProfileSelect() {
  const cur = store.activeProfileId || '';
  profileSelect.innerHTML = '<option value="">Perfis</option>' +
    store.profiles.map((p) => '<option value="' + attr(p.id) + '"' + (p.id === cur ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
}

$('btnRetestAll').addEventListener('click', async () => {
  if (!store.profiles.length) return;
  setStatus('Retestando perfis...', 'info');
  for (const p of store.profiles) {
    const r = await testM3U(p.m3u);
    p.status = r.ok ? 'ok' : 'fail';
    p.count = r.count;
    if (r.ok) p.channels = r.channels;
    p.testedAt = Date.now();
  }
  saveStore();
  renderProfilesPanel();
  refreshProfileSelect();
  setStatus('Reteste concluído', 'ok');
});

/* Arquivo */
const fileDrop = $('fileDrop');
const m3uFile = $('m3uFile');
fileDrop.addEventListener('click', () => m3uFile.click());
m3uFile.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const channels = parseM3U(String(ev.target.result || ''));
      if (!channels.length) { setStatus('Arquivo sem canais', 'err'); return; }
      const name = $('fileProfileName').value.trim() || f.name.replace(/\.m3u8?$/i, '') || 'Arquivo local';
      const entry = { id: 'p_' + hash(name + Date.now()), name, m3u: 'local://' + f.name, ok: true, channels, count: channels.length };
      saveAndUseProfile(entry);
    };
    reader.readAsText(f);
  }
  e.target.value = '';
});
fileDrop.addEventListener('dragover', (e) => { e.preventDefault(); fileDrop.classList.add('drag'); });
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag'));
fileDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDrop.classList.remove('drag');
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) {
    m3uFile.files = e.dataTransfer.files;
    m3uFile.dispatchEvent(new Event('change'));
  }
});

/* URL avulsa */
$('btnLoadUrl').addEventListener('click', async () => {
  let url = $('urlInput').value.trim();
  if (!url) { setStatus('Cole o link M3U', 'err'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  setStatus('Testando link...', 'info');
  $('btnLoadUrl').disabled = true;
  const r = await testM3U(url);
  $('btnLoadUrl').disabled = false;
  if (!r.ok) {
    setStatus('Link não funcionou no navegador. Baixe o arquivo e use a aba Arquivo.', 'err');
    return;
  }
  const name = $('urlProfileName').value.trim() || hostLabel(url);
  saveAndUseProfile({ id: 'p_' + hash(url), name, m3u: url, ok: true, channels: r.channels, count: r.count });
});

/* Xtream */
$('btnXtreamOpen').addEventListener('click', () => {
  const c = readXt();
  if (!c) return;
  window.open(c.host + '/get.php?username=' + encodeURIComponent(c.user) + '&password=' + encodeURIComponent(c.pass) + '&type=m3u_plus&output=ts', '_blank');
});
$('btnLoadXtream').addEventListener('click', async () => {
  const c = readXt();
  if (!c) return;
  const m3u = c.host + '/get.php?username=' + encodeURIComponent(c.user) + '&password=' + encodeURIComponent(c.pass) + '&type=m3u_plus&output=ts';
  setStatus('Testando M3U do painel...', 'info');
  $('btnLoadXtream').disabled = true;
  const r = await testM3U(m3u);
  $('btnLoadXtream').disabled = false;
  if (!r.ok) {
    setStatus('Não baixou no site. Use "Abrir link M3U" → salve o arquivo → aba Arquivo.', 'err');
    return;
  }
  const name = $('xtName').value.trim() || hostLabel(c.host);
  saveAndUseProfile({
    id: 'p_' + hash(m3u),
    name,
    m3u,
    server: c.host,
    user: c.user,
    pass: c.pass,
    ok: true,
    channels: r.channels,
    count: r.count
  });
});

function readXt() {
  let host = $('xtHost').value.trim().replace(/\/$/, '');
  const user = $('xtUser').value.trim();
  const pass = $('xtPass').value.trim();
  if (!host || !user || !pass) { setStatus('Preencha servidor, usuário e senha', 'err'); return null; }
  if (!/^https?:\/\//i.test(host)) host = 'http://' + host;
  return { host, user, pass };
}

/* player */
heroPlay.addEventListener('click', () => { if (current) play(current); else openLoad(); });
heroLater.addEventListener('click', () => { if (current) toggleLater(current.id); });
$('playerClose').addEventListener('click', closePlayer);
playerOverlay.addEventListener('click', (e) => { if (e.target === playerOverlay) closePlayer(); });
btnLaterPlayer.addEventListener('click', () => { if (current) toggleLater(current.id); });
video.addEventListener('timeupdate', () => {
  if (current && video.duration && !isNaN(video.duration)) saveProgress(current.id, video.currentTime, video.duration);
});
video.addEventListener('pause', () => { if (current) saveProgress(current.id, video.currentTime, video.duration); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!playerOverlay.hidden) closePlayer();
    else if (!loadModal.hidden) closeLoad();
  }
});

refreshProfileSelect();
render();

/* RENDER */
function render() {
  const q = searchInput.value.toLowerCase().trim();
  let list = byTab(store.channels, tab);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
  setHero(list.find((c) => store.progress[c.id]) || list[0] || null);

  if (!store.channels.length) {
    rows.innerHTML =
      '<div class="empty"><h3>Nenhuma lista ativa</h3>' +
      '<p>Cole seus blocos com Link M3U, teste quais funcionam e salve como perfis. Se o navegador bloquear, baixe o arquivo e use a aba Arquivo.</p>' +
      '<button class="btn-white" type="button" id="emptyLoad">Gerenciar listas</button></div>';
    const b = $('emptyLoad');
    if (b) b.addEventListener('click', openLoad);
    return;
  }
  if (!list.length) {
    rows.innerHTML = '<div class="empty"><h3>Nada nesta categoria</h3></div>';
    return;
  }
  if (tab === 'home') renderHome(list);
  else {
    const titles = { live: 'TV ao Vivo', movies: 'Filmes', series: 'Séries', continue: 'Continuar', watchlater: 'Minha Lista' };
    rows.innerHTML = makeRow(titles[tab] || 'Lista', list, tab === 'live');
    bindUI();
  }
}

function byTab(list, t) {
  if (t === 'home') return list;
  if (t === 'live') return list.filter((c) => c.type === 'live' || (!c.type && !isVod(c.group)));
  if (t === 'movies') return list.filter((c) => c.type === 'movie' || isMovie(c.group));
  if (t === 'series') return list.filter((c) => c.type === 'series' || isSeries(c.group));
  if (t === 'continue') return list.filter((c) => store.progress[c.id]?.time > 10).sort((a, b) => (store.progress[b.id]?.updated || 0) - (store.progress[a.id]?.updated || 0));
  if (t === 'watchlater') return list.filter((c) => store.later.includes(c.id));
  return list;
}

function setHero(item) {
  current = item || null;
  const prof = store.profiles.find((p) => p.id === store.activeProfileId);
  if (!item) {
    heroTitle.textContent = 'Suas listas IPTV';
    heroText.textContent = prof ? ('Perfil: ' + prof.name + ' — recarregue ou troque no menu') : 'Cole blocos, teste M3U e salve perfis.';
    heroTag.textContent = 'Bem-vindo';
    heroImage.style.backgroundImage = 'none';
    heroPlay.hidden = true;
    heroLater.hidden = true;
    heroLoad.hidden = false;
    return;
  }
  heroTitle.textContent = item.name;
  heroText.textContent = (prof ? prof.name + ' · ' : '') + typeLabel(item) + (item.group ? ' · ' + item.group : '');
  heroTag.textContent = item.type === 'live' ? 'Ao Vivo' : 'Destaque';
  heroImage.style.backgroundImage = 'url("' + (item.logo || avatar(item.name)) + '")';
  heroPlay.hidden = false;
  heroLater.hidden = false;
  heroLoad.hidden = true;
  heroLater.classList.toggle('on', store.later.includes(item.id));
}

function renderHome(list) {
  const cont = list.filter((c) => store.progress[c.id]?.time > 10).sort((a, b) => (store.progress[b.id]?.updated || 0) - (store.progress[a.id]?.updated || 0));
  const later = list.filter((c) => store.later.includes(c.id));
  const live = list.filter((c) => c.type === 'live' || (!c.type && !isVod(c.group)));
  const movies = list.filter((c) => c.type === 'movie' || isMovie(c.group));
  const series = list.filter((c) => c.type === 'series' || isSeries(c.group));
  let html = '';
  if (cont.length) html += makeRow('Continuar Assistindo', cont, false);
  if (later.length) html += makeRow('Minha Lista', later, false);
  if (live.length) html += makeRow('TV ao Vivo', live.slice(0, 60), true);
  if (movies.length) html += makeRow('Filmes', movies.slice(0, 60), false);
  if (series.length) html += makeRow('Séries', series.slice(0, 60), false);
  if (!html) html = makeRow('Todos', list.slice(0, 60), false);
  rows.innerHTML = html;
  bindUI();
}

function makeRow(title, items, isLive) {
  return '<div class="row"><h2 class="row-title">' + esc(title) + '</h2><div class="row-wrap">' +
    '<button class="arrow prev" type="button" data-dir="-1">&#10094;</button><div class="row-scroll">' +
    items.map((item) => makeCard(item, isLive)).join('') +
    '</div><button class="arrow next" type="button" data-dir="1">&#10095;</button></div></div>';
}

function makeCard(item, isLive) {
  const prog = store.progress[item.id];
  const pct = prog?.duration ? Math.min(100, (prog.time / prog.duration) * 100) : 0;
  const img = item.logo || avatar(item.name);
  return '<div class="card' + (isLive ? ' is-live' : '') + '" data-id="' + attr(item.id) + '">' +
    '<img class="card-img" src="' + attr(img) + '" alt="" loading="lazy" onerror="this.src=\'' + avatar(item.name) + '\'">' +
    '<div class="card-hover"><div class="card-name">' + esc(item.name) + '</div>' +
    '<div class="card-sub">' + esc(typeLabel(item)) + '</div>' +
    (pct > 2 ? '<div class="card-bar"><i style="width:' + pct + '%"></i></div>' : '') +
    '</div></div>';
}

function bindUI() {
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      const item = store.channels.find((c) => c.id === card.dataset.id);
      if (item) play(item);
    });
  });
  document.querySelectorAll('.arrow').forEach((btn) => {
    btn.addEventListener('click', () => {
      const track = btn.parentElement.querySelector('.row-scroll');
      track.scrollBy({ left: parseInt(btn.dataset.dir, 10) * track.clientWidth * 0.75, behavior: 'smooth' });
    });
  });
}

function play(item) {
  current = item;
  saveStore();
  playerTitle.textContent = item.name;
  playerMeta.textContent = typeLabel(item) + (item.group ? ' · ' + item.group : '');
  btnLaterPlayer.classList.toggle('on', store.later.includes(item.id));
  playerOverlay.hidden = false;
  document.body.style.overflow = 'hidden';

  if (!item.url) { playerTitle.textContent = item.name + ' (sem URL)'; return; }
  if (hls) { hls.destroy(); hls = null; }
  const start = store.progress[item.id]?.time || 0;
  const isHls = /\.m3u8($|\?)/i.test(item.url) || item.type === 'live';

  if (isHls && window.Hls && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(item.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (start > 10 && start < (video.duration || Infinity) - 15) video.currentTime = start;
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) playerTitle.textContent = item.name + ' (erro stream)'; });
  } else {
    video.src = item.url;
    video.addEventListener('loadedmetadata', function onM() {
      video.removeEventListener('loadedmetadata', onM);
      if (start > 10) video.currentTime = start;
      video.play().catch(() => {});
    });
  }
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
  if (i >= 0) store.later.splice(i, 1); else store.later.push(id);
  saveStore();
  render();
}

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
      const c = line.indexOf(',');
      if (c >= 0) name = line.slice(c + 1).trim() || name;
      const logo = (line.match(/tvg-logo="([^"]*)"/i) || [])[1] || '';
      const group = (line.match(/group-title="([^"]*)"/i) || [])[1] || 'Outros';
      cur = { id: 'c_' + hash(name + logo + i), name, logo, group, type: detect(group, name), url: '' };
    } else if (!line.startsWith('#') && cur) {
      cur.url = line;
      if (cur.url) out.push(cur);
      cur = null;
    }
  }
  return out;
}

function detect(g, n) {
  const t = (g + ' ' + n).toLowerCase();
  if (/s[eé]rie|series|temporada|episode|episodio/.test(t)) return 'series';
  if (/filme|movie|cinema|vod|filmes/.test(t)) return 'movie';
  return 'live';
}
function isMovie(g) { return /filme|movie|cinema|vod|filmes/i.test(g || ''); }
function isSeries(g) { return /s[eé]rie|series|temporada/i.test(g || ''); }
function isVod(g) { return isMovie(g) || isSeries(g); }
function typeLabel(i) { return i.type === 'movie' ? 'Filme' : i.type === 'series' ? 'Série' : 'Ao Vivo'; }
function hash(s) { let h = 0; for (let i = 0; i < String(s).length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0; return Math.abs(h).toString(36); }
function avatar(n) { return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n || '?') + '&background=1a1a1a&color=e50914&size=400&bold=true'; }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function attr(s) { return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
