(function () {
'use strict';

const KEY = 'fluxozynxtv_v8';
const $ = (id) => document.getElementById(id);

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

/* ===== LOG VISÍVEL ===== */
function logClear() {
  const el = $('workLogBody');
  if (el) el.innerHTML = '';
}
function log(msg, kind) {
  const el = $('workLogBody');
  if (!el) return;
  const line = document.createElement('div');
  if (kind) line.className = kind;
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  line.textContent = '[' + hh + ':' + mm + ':' + ss + '] ' + msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  console.log('[FluxoZynx]', msg);
}

function setStatus(msg, type) {
  const loadStatus = $('loadStatus');
  if (!loadStatus) return;
  if (!msg) { loadStatus.hidden = true; loadStatus.textContent = ''; return; }
  loadStatus.hidden = false;
  loadStatus.textContent = msg;
  loadStatus.className = 'load-status ' + (type || 'info');
}

/* boot check */
window.addEventListener('error', (e) => {
  log('ERRO JS: ' + (e.message || e), 'err');
});
window.addEventListener('unhandledrejection', (e) => {
  log('ERRO async: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), 'err');
});

log('Script carregou. Pronto.', 'info');

/* nav */
window.addEventListener('scroll', () => {
  const nav = $('navbar');
  if (nav) nav.classList.toggle('solid', window.scrollY > 50);
});

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

$('logoHome').addEventListener('click', (e) => {
  e.preventDefault();
  tab = 'home';
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'home'));
  render();
});

$('btnSearch').addEventListener('click', () => {
  $('searchBox').classList.toggle('open');
  if ($('searchBox').classList.contains('open')) $('searchInput').focus();
  else { $('searchInput').value = ''; render(); }
});
$('searchInput').addEventListener('input', () => render());

$('profileSelect').addEventListener('change', async () => {
  const id = $('profileSelect').value;
  if (id) await activateProfile(id);
});

/* modal */
function openLoad() {
  log('Abrindo modal de listas...', 'info');
  $('loadModal').hidden = false;
  setStatus('');
  renderProfilesPanel();
}
function closeLoad() { $('loadModal').hidden = true; }

$('btnOpenLoad').addEventListener('click', openLoad);
$('heroLoad').addEventListener('click', openLoad);
$('loadClose').addEventListener('click', closeLoad);
$('loadModal').addEventListener('click', (e) => { if (e.target === $('loadModal')) closeLoad(); });

document.querySelectorAll('.load-tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.load-tab').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.load-panel').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    const map = { bulk: 'panelBulk', profiles: 'panelProfiles', file: 'panelFile', url: 'panelUrl', xtream: 'panelXtream' };
    const panel = $(map[t.dataset.load]);
    if (panel) panel.classList.add('active');
    setStatus('');
    log('Aba: ' + t.dataset.load, 'info');
    if (t.dataset.load === 'profiles') renderProfilesPanel();
  });
});

/* ===== EXTRAIR LINKS ===== */
function normalizeText(text) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/(https?:\/\/[^\s\n]*?)\n\s*/gi, '$1');
  t = t.replace(/(get\.php\?)\s*\n\s*/gi, '$1');
  t = t.replace(/(&)\s*\n\s*/g, '$1');
  return t;
}

function findM3ULinks(text) {
  const t = normalizeText(text);
  const found = [];
  const seen = new Set();
  const push = (raw) => {
    let u = String(raw || '').trim().replace(/[<>"'`]/g, '').replace(/[.,;\])\]}]+$/, '');
    if (!/^https?:\/\//i.test(u) && /get\.php/i.test(u)) u = 'http://' + u.replace(/^\/+/, '');
    if (!/^https?:\/\//i.test(u)) return;
    const isList = /get\.php/i.test(u) || /\.m3u8?(?:$|\?)/i.test(u) || /[?&](username|password|type)=/i.test(u);
    if (!isList) return;
    const key = u.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(u);
  };

  let m;
  const lineRe = /Link\s*M3U\s*[:：]\s*(.+)/gi;
  while ((m = lineRe.exec(t)) !== null) {
    const urlMatch = m[1].match(/https?:\/\/\S+/i) || m[1].match(/\S*get\.php\S*/i);
    if (urlMatch) push(urlMatch[0]);
  }
  const getRe = /https?:\/\/[^\s"'<>]*get\.php\?[^\s"'<>]*/gi;
  while ((m = getRe.exec(t)) !== null) push(m[0]);
  const m3uRe = /https?:\/\/[^\s"'<>]+\.m3u8?(?:\?[^\s"'<>]*)?/gi;
  while ((m = m3uRe.exec(t)) !== null) push(m[0]);

  return found;
}

function extractFromBulk(text) {
  const norm = normalizeText(text);
  const links = findM3ULinks(norm);
  log('Links M3U encontrados no texto: ' + links.length, links.length ? 'ok' : 'err');
  links.forEach((u, i) => log('  [' + (i + 1) + '] ' + u, 'info'));

  if (!links.length) return [];

  const title = ((norm.match(/\[([^\]]+)\]/) || [])[1] || '').trim();
  const server = (norm.match(/Servidor\s*[:：]\s*(\S+)/i) || [])[1] || '';
  const user = (norm.match(/Usu[aá]rio\s*[:：]\s*(\S+)/i) || [])[1] || '';
  const pass = (norm.match(/Senha\s*[:：]\s*(\S+)/i) || [])[1] || '';

  return links.map((u, i) => ({
    name: title || hostLabel(u) || ('Lista ' + (i + 1)),
    m3u: u,
    server: clean(server),
    user: clean(user),
    pass: clean(pass)
  }));
}

function clean(s) {
  return String(s || '').replace(/[📡👤🔐💎📆🔗💀📃📅]/g, '').trim();
}
function hostLabel(u) {
  try { return new URL(/^https?:/i.test(u) ? u : 'http://' + u).hostname; } catch (e) { return 'Lista'; }
}

async function fetchText(url) {
  const attempts = [
    { label: 'direto', u: url },
    { label: 'corsproxy', u: 'https://corsproxy.io/?' + encodeURIComponent(url) },
    { label: 'allorigins', u: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) }
  ];
  let lastErr = null;
  for (const a of attempts) {
    try {
      log('Tentando baixar via ' + a.label + '...', 'info');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 16000);
      const res = await fetch(a.u, { signal: ctrl.signal });
      clearTimeout(t);
      log('  HTTP ' + res.status + ' (' + a.label + ')', res.ok ? 'ok' : 'err');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      log('  Baixou ' + text.length + ' caracteres', 'ok');
      if (text && text.length > 20) return text;
    } catch (e) {
      lastErr = e;
      log('  Falhou ' + a.label + ': ' + (e.message || e), 'err');
    }
  }
  throw lastErr || new Error('download falhou');
}

async function testM3U(url) {
  try {
    const text = await fetchText(url);
    if (/<html/i.test(text) && !/#EXTM3U/i.test(text)) {
      log('Resposta parece HTML, não M3U', 'err');
      return { ok: false, reason: 'Não é M3U (veio HTML)', channels: [], count: 0 };
    }
    const channels = parseM3U(text);
    log('Canais parseados: ' + channels.length, channels.length ? 'ok' : 'err');
    if (!channels.length) return { ok: false, reason: 'M3U sem canais', channels: [], count: 0 };
    return { ok: true, reason: channels.length + ' itens', channels, count: channels.length };
  } catch (e) {
    return { ok: false, reason: 'Não baixou (CORS/rede)', channels: [], count: 0 };
  }
}

/* BOTÃO PRINCIPAL */
const btnParse = $('btnParseTest');
if (!btnParse) {
  log('ERRO: botão btnParseTest não existe no HTML!', 'err');
} else {
  log('Botão "Extrair e testar" conectado.', 'ok');
  btnParse.addEventListener('click', onParseClick);
}

async function onParseClick() {
  try {
    logClear();
    log('>>> Clique em Extrair e testar', 'info');

    const bulk = $('bulkInput');
    if (!bulk) {
      log('ERRO: caixa de texto bulkInput não encontrada', 'err');
      setStatus('Erro interno: campo de texto sumiu', 'err');
      return;
    }

    const text = bulk.value.trim();
    log('Tamanho do texto colado: ' + text.length + ' caracteres', text.length ? 'info' : 'err');

    if (!text) {
      setStatus('Cole o texto primeiro', 'err');
      log('Nada colado na caixa.', 'err');
      return;
    }

    // preview primeiras linhas
    const preview = text.split(/\n/).slice(0, 4).join(' | ');
    log('Início do texto: ' + preview.slice(0, 120), 'info');

    btnParse.disabled = true;
    btnParse.textContent = 'Trabalhando...';

    if (/#EXTM3U/i.test(text) && /#EXTINF/i.test(text)) {
      log('Detectado conteúdo M3U puro (#EXTM3U)', 'ok');
      const channels = parseM3U(text);
      log('Canais no texto: ' + channels.length, channels.length ? 'ok' : 'err');
      if (!channels.length) {
        setStatus('M3U sem canais', 'err');
      } else {
        saveAndUseProfile({
          id: 'p_' + hash('paste' + Date.now()),
          name: 'Lista colada',
          m3u: 'local://paste',
          ok: true,
          channels,
          count: channels.length
        });
      }
      btnParse.disabled = false;
      btnParse.textContent = 'Extrair e testar links';
      return;
    }

    log('Tratando como bloco de credenciais (não é #EXTM3U)...', 'info');
    const extracted = extractFromBulk(text);

    if (!extracted.length) {
      setStatus('Nenhum Link M3U achado no texto', 'err');
      log('Não encontrei URL com get.php / .m3u / Link M3U:', 'err');
      log('Dica: o texto precisa ter http://...get.php?username=...', 'info');
      btnParse.disabled = false;
      btnParse.textContent = 'Extrair e testar links';
      return;
    }

    setStatus('Testando ' + extracted.length + ' link(s)...', 'info');
    const testResults = $('testResults');
    testResults.hidden = false;
    testResults.innerHTML = '';

    for (let i = 0; i < extracted.length; i++) {
      const item = extracted[i];
      log('--- Teste ' + (i + 1) + '/' + extracted.length + ': ' + item.name, 'info');
      log('URL: ' + item.m3u, 'info');

      const card = document.createElement('div');
      card.className = 'test-card';
      card.innerHTML =
        '<div class="t-name">' + esc(item.name) + '</div>' +
        '<div class="t-meta">' + esc(item.m3u) + '</div>' +
        '<div class="t-status">Testando...</div>';
      testResults.appendChild(card);

      const result = await testM3U(item.m3u);
      const entry = Object.assign({}, item, result, { id: 'p_' + hash(item.m3u) });

      card.classList.add(result.ok ? 'ok' : 'fail');
      card.querySelector('.t-status').textContent = result.ok
        ? '✓ ' + result.reason
        : '✗ ' + result.reason;

      log(result.ok ? 'SUCESSO: ' + result.reason : 'FALHA: ' + result.reason, result.ok ? 'ok' : 'err');

      const actions = document.createElement('div');
      actions.className = 'test-actions';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-fail';
      copyBtn.textContent = 'Copiar link';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(item.m3u).then(() => { copyBtn.textContent = 'Copiado!'; log('Link copiado', 'ok'); });
      };
      actions.appendChild(copyBtn);

      if (result.ok) {
        const b1 = document.createElement('button');
        b1.type = 'button';
        b1.className = 'btn-use';
        b1.textContent = 'Salvar e usar';
        b1.onclick = () => saveAndUseProfile(entry);
        actions.appendChild(b1);
      } else {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-fail';
        b.textContent = 'Abrir / baixar';
        b.onclick = () => {
          log('Abrindo link no navegador para você baixar o M3U...', 'info');
          window.open(item.m3u, '_blank');
        };
        actions.appendChild(b);
      }
      card.appendChild(actions);
    }

    log('>>> Fim dos testes', 'info');
    setStatus('Testes terminaram. Veja o log e os cards acima.', 'info');
  } catch (err) {
    log('EXCEÇÃO: ' + (err && err.message ? err.message : err), 'err');
    setStatus('Erro: ' + (err && err.message ? err.message : 'desconhecido'), 'err');
  } finally {
    btnParse.disabled = false;
    btnParse.textContent = 'Extrair e testar links';
  }
}

function saveProfile(entry, activate) {
  log('Salvando perfil: ' + entry.name, 'ok');
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
  if (existing >= 0) store.profiles[existing] = Object.assign({}, store.profiles[existing], profile);
  else store.profiles.push(profile);
  saveStore();
  if (activate) activateProfile(profile.id);
}

function saveAndUseProfile(entry) {
  saveProfile(entry, true);
  setStatus('Perfil ativo: ' + entry.name, 'ok');
  setTimeout(() => closeLoad(), 400);
}

async function activateProfile(id) {
  const p = store.profiles.find((x) => x.id === id);
  if (!p) return;
  log('Ativando perfil: ' + p.name, 'info');

  if (p.channels && p.channels.length) {
    store.channels = p.channels;
    store.activeProfileId = p.id;
    saveStore();
    refreshProfileSelect();
    render();
    log('Canais em cache: ' + p.channels.length, 'ok');
    return;
  }

  if (String(p.m3u).startsWith('local://')) {
    setStatus('Perfil de arquivo — carregue o arquivo de novo.', 'err');
    return;
  }

  const result = await testM3U(p.m3u);
  if (!result.ok) {
    p.status = 'fail';
    saveStore();
    setStatus('Não baixou. Baixe o M3U e use Arquivo.', 'err');
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
}

function renderProfilesPanel() {
  const el = $('profilesList');
  if (!el) return;
  if (!store.profiles.length) {
    el.innerHTML = '<p class="load-hint">Nenhum perfil.</p>';
    return;
  }
  el.innerHTML = store.profiles.map((p) => {
    const active = store.activeProfileId === p.id;
    const badge = p.status === 'ok' ? 'ok' : 'fail';
    const label = p.status === 'ok' ? (p.count || '?') + ' itens' : 'falhou';
    return '<div class="prof-card' + (active ? ' active' : '') + '">' +
      '<div class="prof-info"><strong>' + esc(p.name) + (active ? ' · ativo' : '') + '</strong>' +
      '<span>' + esc(p.m3u) + '</span></div>' +
      '<span class="prof-badge ' + badge + '">' + label + '</span>' +
      '<div class="test-actions">' +
      '<button type="button" class="btn-use" data-act="use" data-id="' + attr(p.id) + '">Usar</button>' +
      '<button type="button" class="btn-fail" data-act="del" data-id="' + attr(p.id) + '">Apagar</button>' +
      '</div></div>';
  }).join('');
  el.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.act === 'use') await activateProfile(btn.dataset.id);
      if (btn.dataset.act === 'del') {
        store.profiles = store.profiles.filter((p) => p.id !== btn.dataset.id);
        if (store.activeProfileId === btn.dataset.id) {
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
  const sel = $('profileSelect');
  const cur = store.activeProfileId || '';
  sel.innerHTML = '<option value="">Perfis</option>' +
    store.profiles.map((p) => '<option value="' + attr(p.id) + '"' + (p.id === cur ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
}

$('btnRetestAll').addEventListener('click', async () => {
  log('Retestando todos os perfis...', 'info');
  for (const p of store.profiles) {
    if (String(p.m3u).startsWith('local://')) continue;
    const r = await testM3U(p.m3u);
    p.status = r.ok ? 'ok' : 'fail';
    p.count = r.count;
    if (r.ok) p.channels = r.channels;
  }
  saveStore();
  renderProfilesPanel();
  setStatus('Reteste ok', 'ok');
});

/* arquivo */
$('fileDrop').addEventListener('click', () => $('m3uFile').click());
$('m3uFile').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  log('Lendo arquivo: ' + f.name, 'info');
  const reader = new FileReader();
  reader.onload = (ev) => {
    const channels = parseM3U(String(ev.target.result || ''));
    log('Canais no arquivo: ' + channels.length, channels.length ? 'ok' : 'err');
    if (!channels.length) { setStatus('Arquivo sem canais', 'err'); return; }
    const name = $('fileProfileName').value.trim() || f.name.replace(/\.m3u8?$/i, '');
    saveAndUseProfile({ id: 'p_' + hash(name + Date.now()), name, m3u: 'local://' + f.name, ok: true, channels, count: channels.length });
  };
  reader.readAsText(f);
  e.target.value = '';
});

$('btnLoadUrl').addEventListener('click', async () => {
  let url = $('urlInput').value.trim();
  if (!url) { setStatus('Cole o link', 'err'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  log('Testando URL avulsa: ' + url, 'info');
  const r = await testM3U(url);
  if (!r.ok) { setStatus('Falhou. Baixe e use Arquivo.', 'err'); return; }
  saveAndUseProfile({ id: 'p_' + hash(url), name: $('urlProfileName').value.trim() || hostLabel(url), m3u: url, ok: true, channels: r.channels, count: r.count });
});

$('btnXtreamOpen').addEventListener('click', () => {
  const c = readXt();
  if (!c) return;
  const m3u = c.host + '/get.php?username=' + encodeURIComponent(c.user) + '&password=' + encodeURIComponent(c.pass) + '&type=m3u_plus&output=ts';
  log('Abrindo: ' + m3u, 'info');
  window.open(m3u, '_blank');
});
$('btnLoadXtream').addEventListener('click', async () => {
  const c = readXt();
  if (!c) return;
  const m3u = c.host + '/get.php?username=' + encodeURIComponent(c.user) + '&password=' + encodeURIComponent(c.pass) + '&type=m3u_plus&output=ts';
  log('Testando Xtream M3U: ' + m3u, 'info');
  const r = await testM3U(m3u);
  if (!r.ok) { setStatus('Falhou no site. Use Abrir link M3U.', 'err'); return; }
  saveAndUseProfile({
    id: 'p_' + hash(m3u),
    name: $('xtName').value.trim() || hostLabel(c.host),
    m3u, server: c.host, user: c.user, pass: c.pass,
    ok: true, channels: r.channels, count: r.count
  });
});

function readXt() {
  let host = $('xtHost').value.trim().replace(/\/$/, '');
  const user = $('xtUser').value.trim();
  const pass = $('xtPass').value.trim();
  if (!host || !user || !pass) { setStatus('Preencha os 3 campos', 'err'); return null; }
  if (!/^https?:\/\//i.test(host)) host = 'http://' + host;
  return { host, user, pass };
}

/* player */
$('heroPlay').addEventListener('click', () => { if (current) play(current); else openLoad(); });
$('heroLater').addEventListener('click', () => { if (current) toggleLater(current.id); });
$('playerClose').addEventListener('click', closePlayer);
$('playerOverlay').addEventListener('click', (e) => { if (e.target === $('playerOverlay')) closePlayer(); });
$('btnLaterPlayer').addEventListener('click', () => { if (current) toggleLater(current.id); });
$('video').addEventListener('timeupdate', () => {
  if (current && $('video').duration && !isNaN($('video').duration))
    saveProgress(current.id, $('video').currentTime, $('video').duration);
});

refreshProfileSelect();
render();
log('Interface pronta. Abra Gerenciar listas → Colar blocos.', 'ok');

function render() {
  const q = ($('searchInput').value || '').toLowerCase().trim();
  let list = byTab(store.channels, tab);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
  setHero(list.find((c) => store.progress[c.id]) || list[0] || null);

  if (!store.channels.length) {
    $('rows').innerHTML =
      '<div class="empty"><h3>Nenhuma lista ativa</h3>' +
      '<p>Abra <strong>Gerenciar listas</strong> → <strong>Colar blocos</strong>. O log mostra o que está acontecendo.</p>' +
      '<button class="btn-white" type="button" id="emptyLoad">Gerenciar listas</button></div>';
    const b = $('emptyLoad');
    if (b) b.addEventListener('click', openLoad);
    return;
  }
  if (!list.length) {
    $('rows').innerHTML = '<div class="empty"><h3>Nada aqui</h3></div>';
    return;
  }
  if (tab === 'home') {
    const live = list.filter((c) => c.type === 'live' || (!c.type && !isVod(c.group)));
    const movies = list.filter((c) => c.type === 'movie' || isMovie(c.group));
    const series = list.filter((c) => c.type === 'series' || isSeries(c.group));
    let html = '';
    if (live.length) html += makeRow('TV ao Vivo', live.slice(0, 50), true);
    if (movies.length) html += makeRow('Filmes', movies.slice(0, 50), false);
    if (series.length) html += makeRow('Séries', series.slice(0, 50), false);
    if (!html) html = makeRow('Todos', list.slice(0, 50), false);
    $('rows').innerHTML = html;
  } else {
    const titles = { live: 'TV ao Vivo', movies: 'Filmes', series: 'Séries', continue: 'Continuar', watchlater: 'Minha Lista' };
    $('rows').innerHTML = makeRow(titles[tab] || 'Lista', list, tab === 'live');
  }
  bindUI();
}

function byTab(list, t) {
  if (t === 'home') return list;
  if (t === 'live') return list.filter((c) => c.type === 'live' || (!c.type && !isVod(c.group)));
  if (t === 'movies') return list.filter((c) => c.type === 'movie' || isMovie(c.group));
  if (t === 'series') return list.filter((c) => c.type === 'series' || isSeries(c.group));
  if (t === 'continue') return list.filter((c) => store.progress[c.id]?.time > 10);
  if (t === 'watchlater') return list.filter((c) => store.later.includes(c.id));
  return list;
}

function setHero(item) {
  current = item || null;
  if (!item) {
    $('heroTitle').textContent = 'Suas listas IPTV';
    $('heroText').textContent = 'O log na tela mostra cada passo do teste.';
    $('heroTag').textContent = 'Bem-vindo';
    $('heroImage').style.backgroundImage = 'none';
    $('heroPlay').hidden = true;
    $('heroLater').hidden = true;
    $('heroLoad').hidden = false;
    return;
  }
  $('heroTitle').textContent = item.name;
  $('heroText').textContent = typeLabel(item) + (item.group ? ' · ' + item.group : '');
  $('heroTag').textContent = item.type === 'live' ? 'Ao Vivo' : 'Destaque';
  $('heroImage').style.backgroundImage = 'url("' + (item.logo || avatar(item.name)) + '")';
  $('heroPlay').hidden = false;
  $('heroLater').hidden = false;
  $('heroLoad').hidden = true;
}

function makeRow(title, items, isLive) {
  return '<div class="row"><h2 class="row-title">' + esc(title) + '</h2><div class="row-wrap">' +
    '<button class="arrow prev" type="button" data-dir="-1">‹</button><div class="row-scroll">' +
    items.map((item) => {
      const img = item.logo || avatar(item.name);
      return '<div class="card' + (isLive ? ' is-live' : '') + '" data-id="' + attr(item.id) + '">' +
        '<img class="card-img" src="' + attr(img) + '" alt="" loading="lazy" onerror="this.src=\'' + avatar(item.name) + '\'">' +
        '<div class="card-hover"><div class="card-name">' + esc(item.name) + '</div>' +
        '<div class="card-sub">' + esc(typeLabel(item)) + '</div></div></div>';
    }).join('') +
    '</div><button class="arrow next" type="button" data-dir="1">›</button></div></div>';
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
  $('playerTitle').textContent = item.name;
  $('playerMeta').textContent = typeLabel(item);
  $('playerOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  if (!item.url) return;
  if (hls) { hls.destroy(); hls = null; }
  const start = store.progress[item.id]?.time || 0;
  const isHls = /\.m3u8($|\?)/i.test(item.url) || item.type === 'live';
  if (isHls && window.Hls && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true });
    hls.loadSource(item.url);
    hls.attachMedia($('video'));
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (start > 10) $('video').currentTime = start;
      $('video').play().catch(() => {});
    });
  } else {
    $('video').src = item.url;
    $('video').play().catch(() => {});
  }
}

function closePlayer() {
  if (current) saveProgress(current.id, $('video').currentTime, $('video').duration);
  $('playerOverlay').hidden = true;
  document.body.style.overflow = '';
  $('video').pause();
  if (hls) { hls.destroy(); hls = null; }
  $('video').removeAttribute('src');
  $('video').load();
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
      cur = { id: 'c_' + hash(name + i), name, logo, group, type: detect(group, name), url: '' };
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
  if (/s[eé]rie|series|temporada/.test(t)) return 'series';
  if (/filme|movie|cinema|vod/.test(t)) return 'movie';
  return 'live';
}
function isMovie(g) { return /filme|movie|cinema|vod/i.test(g || ''); }
function isSeries(g) { return /s[eé]rie|series|temporada/i.test(g || ''); }
function isVod(g) { return isMovie(g) || isSeries(g); }
function typeLabel(i) { return i.type === 'movie' ? 'Filme' : i.type === 'series' ? 'Série' : 'Ao Vivo'; }
function hash(s) { let h = 0; for (let i = 0; i < String(s).length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0; return Math.abs(h).toString(36); }
function avatar(n) { return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n || '?') + '&background=1a1a1a&color=e50914&size=400&bold=true'; }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function attr(s) { return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

})();