/* Vercel 서버리스 함수 — 관리자 기기로 웹푸시 발송
   VAPID_PRIVATE_KEY 환경변수가 설정돼 있어야 동작한다. */
const crypto = require('crypto');

const SUPA_URL = 'https://orbjqhjkewuijroojlui.supabase.co';
const SUPA_KEY = 'sb_publishable_9t6hMtCG1S_rvUDEmnh-sA_cdmHvYD0';
const ROW_ID   = 'skt_v3';
const VAPID_PUBLIC = 'BCjTE4e4Z4TJyOAlBBtglAgzVHIXIeaRcT9zgPxQIgXnikluJjOi7eo9OZf54ndkQSyzEOIm3ZYF7SkqjM6y6NI';
const CONTACT = 'mailto:admin@skinandtalk.local';

const b64u = buf => Buffer.from(buf).toString('base64url');

function vapidJWT(audience, jwk) {
  const header  = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: CONTACT
  }));
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d },
    format: 'jwk'
  });
  const sig = crypto.createSign('SHA256')
    .update(`${header}.${payload}`)
    .sign({ key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64u(sig)}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const secret = process.env.VAPID_PRIVATE_KEY;
  if (!secret) { res.status(200).json({ sent: 0, skipped: 'VAPID_PRIVATE_KEY 미설정' }); return; }

  let jwk;
  try { jwk = JSON.parse(Buffer.from(secret, 'base64url').toString()); }
  catch (e) { res.status(500).json({ error: '키 형식 오류' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const fromId = body.from || '';

  // 구독 정보와 계정을 서버 데이터에서 읽는다
  const r = await fetch(`${SUPA_URL}/rest/v1/app_data?id=eq.${ROW_ID}&select=data`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
  });
  const rows = await r.json();
  const db = rows && rows[0] && rows[0].data;
  if (!db) { res.status(200).json({ sent: 0, skipped: '데이터 없음' }); return; }

  const adminIds = (db.users || []).filter(u => u.role === 'admin' && u.active !== false).map(u => u.id);
  const subs = (db.pushSubs || []).filter(s => adminIds.includes(s.userId) && s.userId !== fromId);

  let sent = 0;
  const gone = [];
  await Promise.all(subs.map(async s => {
    try {
      const url = new URL(s.sub.endpoint);
      const jwt = vapidJWT(url.origin, jwk);
      const resp = await fetch(s.sub.endpoint, {
        method: 'POST',
        headers: {
          TTL: '600',
          Urgency: 'high',
          'Content-Length': '0',
          Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC}`
        }
      });
      if (resp.ok) sent++;
      else if (resp.status === 404 || resp.status === 410) gone.push(s.sub.endpoint);
    } catch (e) { /* 개별 실패는 무시 */ }
  }));

  res.status(200).json({ sent, total: subs.length, gone: gone.length });
};
