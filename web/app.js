'use strict';
const $ = id => document.getElementById(id);
let config = null, busy = false, toastTimer = 0;

const bytes = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
const uptime = s => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return 'Hoạt động ' + (d ? d + ' ngày ' : '') + (d || h ? h + ' giờ ' : '') + m + ' phút'; };

async function api(url) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  let v; try { v = await r.json(); } catch { throw Error('Máy chủ chưa phản hồi. Thử tải lại trang.'); }
  if (!r.ok) throw Error(v.error || 'Không kết nối được máy chủ.');
  return v;
}

function setState(kind, pill, text) {
  $('pill').dataset.state = kind; $('ring').dataset.state = kind;
  $('pill-text').textContent = pill; $('status-text').textContent = text;
}

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

async function refresh() {
  if (busy) return; busy = true;
  try {
    const s = await api('/api/state');
    $('up').textContent = bytes(s.stats.up || 0);
    $('down').textContent = bytes(s.stats.down || 0);
    $('conn').textContent = s.activeConnections;
    $('uptime').textContent = uptime(s.uptimeSeconds || 0);
    if (s.online) {
      setState('ok', 'Trực tuyến', 'Sẵn sàng kết nối');
      if (!config) {
        config = await api('/api/config');
        $('add').disabled = false; $('copy').disabled = false; $('message').textContent = '';
      }
    } else {
      setState('wait', 'Đang khởi động', 'Máy chủ đang khởi động…');
    }
  } catch (e) {
    setState('bad', 'Ngoại tuyến', 'Chưa kết nối được');
    $('message').textContent = e.message;
    $('add').disabled = true; $('copy').disabled = true; config = null;
  } finally { busy = false; }
}

$('add').onclick = () => { if (config) location.href = config.addUrl; };
$('copy').onclick = async () => {
  if (!config) return;
  try { await navigator.clipboard.writeText(config.subscription); toast('Đã sao chép liên kết'); }
  catch { $('message').textContent = config.subscription; }
};

refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
