/* SKIN & TALK — 푸시 알림 서비스워커
   페이로드 없는 푸시를 받으면 서버에서 최신 입력을 읽어 알림을 띄운다. */
const SUPA_URL = 'https://orbjqhjkewuijroojlui.supabase.co';
const SUPA_KEY = 'sb_publishable_9t6hMtCG1S_rvUDEmnh-sA_cdmHvYD0';
const ROW_ID   = 'skt_v3';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let title = 'SKIN & TALK', body = '새 관리 내역이 등록되었습니다';
    try {
      const d = event.data ? event.data.json() : null;
      if (d && d.title) { title = d.title; body = d.body || body; }
      else { const t = await latestText(); if (t) { title = t.title; body = t.body; } }
    } catch (e) {
      try { const t = await latestText(); if (t) { title = t.title; body = t.body; } } catch (_) {}
    }
    await self.registration.showNotification(title, {
      body, icon: '/icon-192.png', badge: '/icon-192.png',
      tag: 'skt-record', renotify: true, data: { url: '/' }
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('/');
  })());
});

/* 서버에서 가장 최근 관리 내역을 읽어 알림 문구를 만든다 */
async function latestText() {
  const r = await fetch(`${SUPA_URL}/rest/v1/app_data?id=eq.${ROW_ID}&select=data`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
  });
  if (!r.ok) return null;
  const rows = await r.json();
  const db = rows && rows[0] && rows[0].data;
  if (!db || !db.records || !db.records.length) return null;
  const rec = db.records.filter(x => !x.canceled && x.createdAt)
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!rec) return null;
  const name = id => (db.users.find(u => u.id === id) || {}).name || '';
  const cust = id => (db.customers.find(c => c.id === id) || {}).name || '';
  const store = id => (db.stores.find(s => s.id === id) || {}).name || '';
  const prog = id => { const p = (db.programs || []).find(x => x.id === id); return p ? p.name : '관리'; };
  const won = n => Math.round(n || 0).toLocaleString('ko-KR');
  return {
    title: `${store(rec.storeId)} ${name(rec.teacherId)} 선생님`,
    body: `${cust(rec.customerId)} · ${prog(rec.serviceId)}\n인정매출 ${won(rec.real)}원 / 수수료 ${won(rec.fee)}원`
  };
}
