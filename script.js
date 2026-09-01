const KEY = 'fluxozynxtv_v7';

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
let lastParsed = [];

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

/* ========== EXTRAIR SÓ LINKS M3U ========== */

/** Junta linhas quebradas de URL (comum no seu formato) */
function normalizeText(text) {
  let t = String(text || '').replace(/\r/g, '');
  // junta URL quebrada depois de get.php? ou & no fim da linha
  t = t.replace(/(https?:\/\/[^\s\n]*?)\n\s*/gi, '$1');
  t = t.replace(/(get\.php\?)\s*\n\s*/gi, '$1');
  t = t.replace(/(&)\s*\n\s*/g, '$1');
  t = t.replace(/(username=)\s*\n\s*/gi, '$1');
  t = t.replace(/(password=)\s*\n\s*/gi, '$1');
  return t;
}

/** Encontra todas as URLs que parecem playlist M3U / get.php */
function findM3ULinks(text) {
  const t = normalizeText(text);
  const found = [];
  const seen = new Set();

  const push = (raw, nameHint) => {
    let u = String(raw || '').trim();
    u = u.replace(/[<>"'`]/g, '').replace(/[.,;\])\]}]+$/, '');
    // completa se começou sem protocolo mas tem get.php
    if (!/^https?:\/\//i.test(u) && /get\.php/i.test(u)) {
      u = 'http://' + u.replace(/^\/+/, '');
    }
    if (!/^https?:\/\//i.test(u)) return;
    // só aceita se parece lista IPTV
    const isList =
      /get\.php/i.test(u) ||
      /\.m3u8?(?:$|\?)/i.test(u) ||
      /[?&](username|password|type)=/i.test(u) ||
      /m3u/i.test(u);
    if (!isList) return;
    const key = u.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ url: u, nameHint: nameHint || '' });
  };

  // 1) Linha explícita "Link M3U: ..."
  const lineRe = /Link\s*M3U\s*[:：]\s*(.+)/gi;
  let m;
  while ((m = lineRe.exec(t)) !== null) {
    let rest = m[1].trim();
    // pega URL até espaço ou emoji de próxima linha lógica
    const urlMatch = rest.match(/https?:\/\/\S+/i) || rest.match(/\S*get\.php\S*/i);
    if (urlMatch) push(urlMatch[0]);
  }

  // 2) Qualquer get.php com query
  const getRe = /https?:\/\/[^\s"'<>]*get\.php\?[^\s"'<>]*/gi;
  while ((m = getRe.exec(t)) !== null) push(m[0]);

  // 3) .m3u / .m3u8
  const m3uRe = /https?:\/\/[^\s"'<>]+\.m3u8?(?:\?[^\s"'<>]*)?/gi;
  while ((m = m3uRe.exec(t)) !== null) push(m[0]);

  return found;
}

/** Monta objetos de perfil a partir do texto colado */
function extractFromBulk(text) {
  const norm = normalizeText(text);
  const links = findM3ULinks(norm);
  if (!links.length) return [];

  // tenta associar cada link a um bloco [NOME] / servidor / user
  const blocks = [];
  const parts = norm.split(/(?=\[[^\]\n]{1,80}\])/).filter((p) => p.trim());

  const parseMeta = (chunk) => {
    const title = ((chunk.match(/\[([^\]]+)\]/) || [])[1] || '').trim();
    const server = (chunk.match(/Servidor\s*[:：]\s*(\S+)/i) || [])[1] || '';
    const user = (chunk.match(/Usu[aá]rio\s*[:：]\s*(\S+)/i) || chunk.match(/User(?:name)?\s*[:：]\s*(\S+)/i) || [])[1] || '';
    const pass = (chunk.match(/Senha\s*[:：]\s*(\S+)/i) || chunk.match(/Pass(?:word)?\s*[:：]\s*(\S+)/i) || [])[1] || '';
    const status = (chunk.match(/Status\s*[:：]\s*([^\n]+)/i) || [])[1] || '';
    const expira = (chunk.match(/Expira[^\n]*[:：]\s*([^\n]+)/i) || [])[1] || '';
    return { title, server: clean(server), user: clean(user), pass: clean(pass), status: clean(status), expira: clean(expira) };
  };

  if (parts.length > 1) {
    parts.forEach((chunk, i) => {
      const localLinks = findM3ULinks(chunk);
      const meta = parseMeta(chunk);
      localLinks.forEach((L, j) => {
        blocks.push({
          name: meta.title || hostLabel(L.url) || ('Lista ' + (i + 1)),
          m3u: L.url,
          server: meta.server,
          user: meta.user,
          pass: meta.pass,
          status: meta.status,
          expira: meta.expira
        });
      });
    });
  }

  // se não achou por bloco, usa lista global de links
  if (!blocks.length) {
    const meta = parseMeta(norm);
    links.forEach((L, i) => {
      blocks.push({
        name: meta.title || hostLabel(L.url) || ('Lista ' + (i + 1)),
        m3u: L.url,
        server: meta.server,
        user: meta.user,
        pass: meta.pass,
        status: meta.status,
        expira: meta.expira
      });
    });
  }

  // dedupe por URL
  const seen = new Set();
  return blocks.filter((b) => {
    const k = b.m3u.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function clean(s) {
  return String(s || '').replace(/[📡👤🔐💎📆🔗💀📃📅]/g, '').replace(/━+/g, '').trim();
}
function hostLabel(u) {
  try { return new URL(/^https?:/i.test(u) ? u : 'http://' + u).hostname; } catch (e) { return 'Lista'; }
}

/* fetch / test */
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
    // se veio HTML de erro, falha
    if (/<html/i.test(text) && !/#EXTM3U/i.test(text)) {
      return { ok: false, reason: 'Servidor devolveu página, não M3U', channels: [], count: 0 };
    }
    const channels = parseM3U(text);
    if (!channels.length) {
      return { ok: false, reason: 'Baixou mas sem canais no M3U', channels: [], count: 0 };
    }
    return { ok: true, reason: channels.length + ' itens', channels, count: channels.length };
  } catch (e) {
    return { ok: false, reason: 'Não baixou no navegador (CORS/offline)', channels: [], count: 0 };
  }
}

/* Colar blocos */
$('btnParseTest').addEventListener('click', async () => {
  const text = $('bulkInput').value.trim();
  if (!text) { setStatus('Cole seus blocos salvos', 'err'); return; }

  // Se for playlist crua #EXTM3U, trata diferente
  if (/#EXTM3U/i.test(text) && /#EXTINF/i.test(text)) {
    const channels = parseM3U(text);
    if (!channels.length) { setStatus('Texto M3U sem canais', 'err'); return; }
    const entry = {
      id: 'p_' + hash('paste' + Date.now()),
      name: 'Lista colada',
      m3u: 'local://paste',
      ok: true,
      channels,
      count: channels.length
    };
    saveAndUseProfile(entry);
    return;
  }

  const extracted = extractFromBulk(text);
  if (!extracted.length) {
    setStatus('Não achei nenhum Link M3U. Precisa ter algo como: Link M3U: http://servidor/get.php?username=...', 'err');
    return;
  }

  // mostra os links extraídos antes de testar
  setStatus('Extraí ' + extracted.length + ' link(s) M3U. Testando...', 'info');
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
      '<div class="t-meta">🔗 ' + esc(item.m3u) + '</div>' +
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

    // sempre mostra o link limpo extraído
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-fail';
    copyBtn.textContent = 'Copiar link';
    copyBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(item.m3u); copyBtn.textContent = 'Copiado!'; } catch (e) {}
    };
    actions.appendChild(copyBtn);

    if (result.ok) {
      const b1 = document.createElement('button');
      b1.className = 'btn-use';
      b1.type = 'button';
      b1.textContent = 'Salvar e usar';
      b1.onclick = () => saveAndUseProfile(entry);
      actions.appendChild(b1);

      const b2 = document.createElement('button');
      b2.className = 'btn-ok';
      b2.type = 'button';
      b2.textContent = 'Só salvar';
      b2.onclick = () => {
        saveProfile(entry, false);
        setStatus('Perfil salvo: ' + entry.name, 'ok');
        renderProfilesPanel();
        refreshProfileSelect();
      };
      actions.appendChild(b2);
    } else {
      const b = document.createElement('button');
      b.className = 'btn-fail';
      b.type = 'button';
      b.textContent = 'Abrir / baixar M3U';
      b.onclick = () => window.open(item.m3u, '_blank');
      actions.appendChild(b);
    }
    card.appendChild(actions);
  }

  const okN = lastParsed.filter((x) => x.ok).length;
  setStatus(
    'Links encontrados: ' + lastParsed.length + ' · Funcionando no site: ' + okN +
    (okN ? '' : ' — use "Abrir / baixar M3U" e depois a aba Arquivo'),
    okN ? 'ok' : 'err'
  );
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
  setStatus('Perfil ativo: ' + entry.name + ' (' + (entry.count || 0) + ' itens)', 'ok');
  setTimeout(() => closeLoad(), 400);
}

async function activateProfile(id) {
  const p = store.profiles.find((x) => x.id === id);
  if (!p) return;

  if (p.channels && p.channels.length) {
    store.channels = p.channels;
    store.activeProfileId = p.id;
    saveStore();
    refreshProfileSelect();
    render();
    return;
  }

  if (String(p.m3u).startsWith('local://')) {
    setStatus('Esse perfil é de arquivo local — carregue o arquivo de novo na aba Arquivo.', 'err');
    return;
  }

  setStatus('Carregando lista do perfil...', 'info');
  const result = await testM3U(p.m3u);
  if (!result.ok) {
    p.status = 'fail';
    saveStore();
    setStatus('Link não baixou. Abra o M3U no navegador, salve o arquivo e use a aba Arquivo.', 'err');
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
    profilesList.innerHTML = '<p class="load-hint">Nenhum perfil ainda.</p>';
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
  setStatus('Retestando...', 'info');
  for (const p of store.profiles) {
    if (String(p.m3u).startsWith('local://')) continue;
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
      saveAndUseProfile({
        id: 'p_' + hash(name + Date.now()),
        name,
        m3u: 'local://' + f.name,
        ok: true,
        channels,
        count: channels.length
      });
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
    const dt = new DataTransfer();
    dt.items.add(f);
    m3uFile.files = dt.files;
    m3uFile.dispatchEvent(new Event('change'));
  }
});

/* URL */
$('btnLoadUrl').addEventListener('click', async () => {
  let url = $('urlInput').value.trim();
  if (!url) { setStatus('Cole o link M3U', 'err'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  setStatus('Testando...', 'info');
  $('btnLoadUrl').disabled = true;
  const r = await testM3U(url);
  $('btnLoadUrl').disabled = false;
  if (!r.ok) {
    setStatus('Não funcionou no site. Baixe o M3U e use Arquivo.', 'err');
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
  setStatus('Testando M3U...', 'info');
  $('btnLoadXtream').disabled = true;
  const r = await testM3U(m3u);
  $('btnLoadXtream').disabled = false;
  if (!r.ok) {
    setStatus('Falhou no site. Use "Abrir link M3U" → baixe → Arquivo.', 'err');
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

function render() {
  const q = searchInput.value.toLowerCase().trim();
  let list = byTab(store.channels, tab);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
  setHero(list.find((c) => store.progress[c.id]) || list[0] || null);

  if (!store.channels.length) {
    rows.innerHTML =
      '<div class="empty"><h3>Nenhuma lista ativa</h3>' +
      '<p>Aba <strong>Colar blocos</strong>: cole seu texto. O site pega só o Link M3U, testa e cria perfil.</p>' +
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
    heroText.textContent = 'Cole o bloco → o site pega só o Link M3U.';
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
