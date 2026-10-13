// 실제 브라우저(크로미움)로 화면 동작 확인
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');

const page = path.join(os.tmpdir(), 'cue3-e2e.html');
fs.writeFileSync(page, '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>' +
  fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8') + '</body></html>');
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); });
test.after(async () => { await browser.close(); });
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 400, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.goto('file://' + page + (opts.hash || ''));
  if (!opts.noWait) await p.waitForSelector('#solChips .chip:not(.skel)', { timeout: 30000 }); // 스켈레톤이 아니라 계산이 끝난 칩
  return p;
}
const noErr = p => assert.deepEqual(p.errors, []);

test('E2E 1: 첫 화면에 추천 길과 길 이름이 뜨고 오류 없음', async () => {
  const p = await open();
  const t = await p.$$eval('.chip .t', e => e.map(x => x.textContent));
  assert.ok(t.length >= 1 && t.length <= 6 && t.every(x => x.length > 0), String(t.length));
  // 당구대 바로 아래 한 줄 요약이 첫 화면(400x900)에 보이고 힘 단계까지 나옴
  assert.equal(await p.isVisible('#recStrip'), true);
  assert.match(await p.textContent('#recStrip'), /단계/);
  const nav = await p.$eval('.tabs', n => n.getBoundingClientRect().top);
  const strip = await p.$eval('#recStrip .pips', n => n.getBoundingClientRect().bottom);
  assert.ok(strip <= nav, `strip ${strip} nav ${nav}`);
  assert.match(await p.textContent('#recSub'), /추천 순/);
  // 칩마다 난이도를 글자로도 표시
  assert.ok((await p.$$eval('.chip .n', e => e.map(x => x.textContent))).every(x => /쉬움|보통|어려움/.test(x)));
  assert.match(await p.getAttribute('#cvTable', 'aria-label'), /추천 길 1/);
  noErr(p); await p.context().close();
});
test('E2E 2: 샷 보기 재생·멈춤', async () => {
  const p = await open();
  await p.click('#btnPlay'); assert.equal(await p.textContent('#btnPlay span'), '멈추기');
  await p.click('#btnPlay'); assert.equal(await p.textContent('#btnPlay span'), '샷 보기');
  noErr(p); await p.context().close();
});
test('E2E 3: 공을 끌면 되돌리기가 켜지고 되돌리면 원래 자리', async () => {
  const p = await open();
  const before = await p.inputValue('#codeOut');
  const box = await p.$eval('#cvTable', c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
  const s = box.w / (2.844 + 0.3), bx = box.x + (0.15 + 0.75) * s, by = box.y + (0.15 + 0.95) * s;
  await p.mouse.move(bx, by); await p.mouse.down(); await p.mouse.move(bx + 60, by - 20, { steps: 5 }); await p.mouse.up();
  assert.notEqual(await p.inputValue('#codeOut'), before);
  assert.equal(await p.isDisabled('#btnUndo'), false);
  await p.click('#btnUndo');
  assert.equal(await p.inputValue('#codeOut'), before);
  noErr(p); await p.context().close();
});
test('E2E 4: 직접 조준 결과표', async () => {
  const p = await open();
  await p.click('#mAim');
  assert.ok((await p.textContent('#aimTable')).includes('결과'));
  await p.click('.nudge button[data-d="0.5"]');
  noErr(p); await p.context().close();
});
test('E2E 5: 정답 가리기 → 정답 보기', async () => {
  const p = await open();
  await p.check('#hideIn');
  await p.waitForSelector('#btnReveal', { timeout: 30000 });
  assert.equal(await p.$$eval('.chip', e => e.length), 0);
  await p.click('#btnReveal');
  assert.ok(await p.$$eval('.chip', e => e.length) > 0);
  noErr(p); await p.context().close();
});
test('E2E 6: 배치 코드 복사 후 무작위 → 코드로 되돌리기', async () => {
  const p = await open();
  await p.click('#layoutBox summary');
  const code = await p.inputValue('#codeOut');
  await p.click('#btnRandom');
  assert.notEqual(await p.inputValue('#codeOut'), code);
  await p.fill('#codeIn', '카페 글: ' + code); await p.click('#btnLoadCode');
  assert.equal(await p.inputValue('#codeOut'), code);
  noErr(p); await p.context().close();
});
test('E2E 7: 문제집 저장·불러오기·지우기', async () => {
  const p = await open();
  await p.click('#layoutBox summary');
  await p.fill('#saveName', '<b>놓친</b> 공'); await p.click('#btnSaveLayout');
  assert.ok((await p.textContent('#savedList')).includes('<b>놓친</b> 공'), 'escaped');
  await p.click('#savedList [data-load="0"]');
  await p.click('#savedList [data-del="0"]');
  assert.ok((await p.textContent('#savedList')).includes('저장한 배치가 없어요'));
  noErr(p); await p.context().close();
});
test('E2E 8: 혼자 연습 (이닝 제한 2)', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scMinus');
  assert.equal(await p.textContent('#scStart'), '연습 시작');
  await p.click('#scMore > summary'); await p.fill('#scLimit', '2'); await p.click('#scStart');
  await p.click('#scHit'); await p.click('#scMiss'); await p.click('#scHit'); await p.click('#scHit'); await p.click('#scMiss');
  assert.match(await p.textContent('#scMsg'), /2이닝 동안 3점/);
  assert.ok((await p.textContent('#scHist')).includes('3/20'));
  noErr(p); await p.context().close();
});
test('E2E 9: 4인 경기, 2번이 끝내면 4번까지 같은 이닝', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scPlus'); await p.click('#scPlus');
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[1].fill('2');
  await p.click('#scStart');
  await p.click('#scMiss'); await p.click('#scHit'); await p.click('#scHit');
  assert.match(await p.textContent('#scInfo'), /선수 C 차례/);
  await p.click('#scMiss'); await p.click('#scMiss');
  assert.match(await p.textContent('#scMsg'), /선수 B 승/);
  assert.equal(await p.$$eval('#scLog tr', r => r.length), 5);
  noErr(p); await p.context().close();
});
test('E2E 10: 점수판 되돌리기로 끝난 경기 취소', async () => {
  const p = await open({ hash: '#score', noWait: true });
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('1'); await t[1].fill('1');
  await p.click('#scStart'); await p.click('#scMiss'); await p.click('#scHit');
  assert.match(await p.textContent('#scMsg'), /경기 끝/);
  await p.click('#scUndo');
  assert.equal(await p.isDisabled('#scHit'), false);
  assert.ok((await p.textContent('#scHist')).includes('끝난 경기가 여기에'));
  noErr(p); await p.context().close();
});
test('E2E 11: 샷 클락 표시와 연장', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scMore > summary'); await p.click('#scClockSeg [data-v="30"]'); await p.click('#scStart');
  assert.equal(await p.isVisible('#scClock'), true);
  await p.waitForTimeout(1200);
  const n = +(await p.textContent('#scClockNum')); assert.ok(n <= 29 && n >= 27, String(n));
  await p.click('#scExt'); assert.ok(+(await p.textContent('#scClockNum')) > 50);
  assert.equal(await p.isDisabled('#scExt'), true);
  noErr(p); await p.context().close();
});
test('E2E 12: 큰 화면과 결과 복사', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scStart'); await p.click('#scHit');
  await p.click('#scBig'); assert.equal(await p.isVisible('.tabs'), false);
  // 큰 화면에서는 경기 중 결과 복사·새 경기를 숨김
  assert.equal(await p.isVisible('#scCopy'), false); assert.equal(await p.isVisible('#scNew'), false);
  await p.click('#scBig'); assert.equal(await p.isVisible('.tabs'), true);
  await p.click('#scCopy');
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /^3쿠션 경기 /);
  assert.match(clip, /선수 A {2}1\/20점/);
  noErr(p); await p.context().close();
});
test('E2E 13: 파이브앤하프 계산기', async () => {
  const p = await open({ hash: '#tips', noWait: true });
  await p.fill('#fhCue', '45'); await p.fill('#fhArr', '15');
  assert.equal(await p.textContent('#fhOut'), '30');
  await p.fill('#fhArr', '60'); assert.match(await p.textContent('#fhNote'), /벗어납니다/);
  noErr(p); await p.context().close();
});
test('E2E 14: 360px 다크 모드에서 가로 넘침 없음 (모든 탭)', async () => {
  const p = await open({ w: 360, dark: true });
  for (const tab of ['find', 'score', 'tips']) {
    await p.click(`.tabs [data-tab="${tab}"]`);
    if (tab === 'find') await p.click('#layoutBox summary');
    if (tab === 'score') { await p.click('#scPlus'); await p.click('#scPlus'); await p.click('#scPlus'); await p.click('#scPlus'); await p.click('#scStart'); }
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, `${tab} overflow ${over}`);
  }
  noErr(p); await p.context().close();
});
test('E2E 15: 팀전 칠 사람 표시', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scMore > summary'); await p.check('#scTeam');
  const n = await p.$$('#scPlayers input[data-k="name"]'); await n[0].fill('철수, 영희'); await n[1].fill('민수, 지은');
  await p.click('#scStart');
  assert.match(await p.textContent('#scBoard'), /칠 사람: 철수/);
  await p.click('#scMiss'); await p.click('#scMiss');
  assert.match(await p.textContent('#scBoard'), /칠 사람: 영희/);
  assert.equal(await p.textContent('#scTitle'), '2팀 팀전');
  noErr(p); await p.context().close();
});
test('E2E 16: 상대 전적과 탭을 떠나면 샷 클락 멈춤', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scMore > summary'); await p.click('#scClockSeg [data-v="30"]');
  // 기본 이름(선수 A…)은 내 기록에서 빠지므로 실제 이름으로
  const n = await p.$$('#scPlayers input[data-k="name"]'); await n[0].fill('김철수'); await n[1].fill('이영희');
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('1'); await t[1].fill('5');
  await p.click('#scStart'); await p.click('#scHit'); await p.click('#scMiss');
  assert.match(await p.textContent('#scMine'), /김철수 vs 이영희/);
  assert.match(await p.textContent('#scMine'), /1-0-0/);
  await p.click('#scNew'); await p.click('#scStart');
  await p.click('.tabs [data-tab="tips"]');
  const a = await p.textContent('#scClockNum'); await p.waitForTimeout(1300);
  assert.equal(await p.textContent('#scClockNum'), a);
  noErr(p); await p.context().close();
});
test('E2E 17: 화면 밝기 버튼이 시스템 → 밝게 → 어둡게로 바뀜', async () => {
  const p = await open();
  await p.click('#btnTheme'); assert.equal(await p.getAttribute('html', 'data-theme'), 'light');
  await p.click('#btnTheme'); assert.equal(await p.getAttribute('html', 'data-theme'), 'dark');
  await p.click('#btnTheme'); assert.equal(await p.getAttribute('html', 'data-theme'), null);
  noErr(p); await p.context().close();
});
test('E2E 18: 키보드(리모컨)로 점수 입력', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scStart');
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowDown');
  await p.keyboard.press('PageUp'); await p.keyboard.press('ArrowLeft');
  const b = await p.$$eval('.sc-score b', e => e.map(x => x.textContent));
  assert.deepEqual(b, ['2', '0']);
  noErr(p); await p.context().close();
});
test('E2E 19: 경기 중 새 경기는 두 번 눌러야 함', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scStart'); await p.click('#scHit');
  await p.click('#scNew'); assert.equal(await p.isVisible('#scGame'), true);
  await p.click('#scNew'); assert.equal(await p.isVisible('#scSetup'), true);
  noErr(p); await p.context().close();
});
test('E2E 20: 꿀팁 찾기', async () => {
  const p = await open({ hash: '#tips', noWait: true });
  await p.fill('#tipQ', '키스');
  const vis = await p.$$eval('#tipList details.tip', d => d.filter(x => !x.hidden).length);
  assert.ok(vis >= 1 && vis < 7);
  // 현장 말로 찾아도 표준 말 항목이 나옴
  await p.fill('#tipQ', '우라');
  assert.equal(await p.isVisible('#tipNone'), false);
  const hits = await p.$$eval('#tipList dt', d => d.filter(x => x.offsetParent).map(x => x.textContent));
  assert.ok(hits.includes('현장 말 ↔ 표준 말'), JSON.stringify(hits));
  assert.ok(hits.some(t => t.startsWith('돌리기')), JSON.stringify(hits));
  await p.fill('#tipQ', 'zzzz없는말'); assert.equal(await p.isVisible('#tipNone'), true);
  noErr(p); await p.context().close();
});
test('E2E 21: 휴대폰은 아래 탭바, 넓은 화면은 2단', async () => {
  const p = await open();
  const nav = await p.$eval('.tabs', n => { const r = n.getBoundingClientRect(); return { pos: getComputedStyle(n).position, bottom: r.bottom, h: innerHeight }; });
  assert.equal(nav.pos, 'fixed'); assert.ok(Math.abs(nav.bottom - nav.h) < 1);
  await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(150);
  const cols = await p.evaluate(() => { const a = document.querySelector('.table-col').getBoundingClientRect(), b = document.querySelector('.side-col').getBoundingClientRect(); return [a.left, b.left, a.top, b.top]; });
  assert.ok(cols[1] > cols[0] + 300 && Math.abs(cols[2] - cols[3]) < 2, JSON.stringify(cols));
  noErr(p); await p.context().close();
});
test('E2E 22: 추천 길 칩에 길 그림, 조준해 보기로 직접 조준', async () => {
  const p = await open();
  assert.ok(await p.$$eval('.chip svg.thumb polyline', e => e.length) >= 1);
  await p.click('#btnTryAim'); assert.equal(await p.isVisible('#aimPanel'), true);
  noErr(p); await p.context().close();
});

// ---------- 플랫폼 기능 흉내(window.claude) ----------
const MOCK = `(() => {
  // 다른 사람이 써 둔 문서는 window.__seed로 넣고, 저장소는 window.__store로 들여다봄
  const store = new Map(Object.entries(window.__seed || {})), subs = [];
  window.__store = store;
  // 실제 플랫폼처럼 경로 조각은 ASCII 문법만 허용
  const seg = p => { if (typeof p !== 'string' || !p.split('/').every(x => /^[A-Za-z0-9_\\-.~:@+]{1,200}$/.test(x))) throw new TypeError('bad path: ' + p); return p; };
  const snapDoc = (path) => ({ id: path.split('/').pop(), exists: store.has(path), data: () => store.get(path), metadata: { fromCache: false, hasPendingWrites: false } });
  const notify = () => subs.forEach(s => s.fire());
  const query = (coll, ord, lim) => ({
    orderBy: (f, d) => query(coll, [f, d || 'asc'], lim), limit: n => query(coll, ord, n), where: () => query(coll, ord, lim),
    get: async () => build(coll, ord, lim),
    onSnapshot(next) { const s = { fire: () => next(build(coll, ord, lim)) }; subs.push(s); setTimeout(s.fire, 0); return () => subs.splice(subs.indexOf(s), 1); }
  });
  function build(coll, ord, lim) {
    let docs = [...store.keys()].filter(k => k.startsWith(coll + '/') && k.split('/').length === coll.split('/').length + 1).map(snapDoc);
    if (ord) docs.sort((a, b) => (a.data()[ord[0]] > b.data()[ord[0]] ? 1 : -1) * (ord[1] === 'desc' ? -1 : 1));
    if (lim) docs = docs.slice(0, lim);
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} };
  }
  const doc = path => seg(path) && ({ id: path.split('/').pop(), path, get: async () => snapDoc(path),
    set: async d => { if (window.__failWrites) throw Object.assign(new Error('막힘'), { code: window.__failWrites }); store.set(path, JSON.parse(JSON.stringify(d))); window.__writes = (window.__writes || 0) + 1; notify(); },
    update: async d => { store.set(path, Object.assign({}, store.get(path), d)); notify(); }, delete: async () => { store.delete(path); notify(); },
    onSnapshot(next) { const s = { fire: () => next(snapDoc(path)) }; subs.push(s); setTimeout(s.fire, 0); return () => {}; } });
  const db = { doc, collection: p => seg(p) && Object.assign(query(p), { path: p, doc: id => doc(p + '/' + (id || Math.random().toString(36).slice(2))) }) };
  const sample = async (input, o) => { window.__prompt = input; const t = '이 길은 두께가 넉넉해서 안전해요.'; o && o.onText && o.onText({ text: t, delta: t }); return { text: t, truncated: false }; };
  sample.json = async (input, o) => { window.__jsonImages = o && o.images && o.images.length; return { white: { x: 225, y: 150 }, yellow: { x: 675, y: 300 }, red: { x: 450, y: 225 } }; };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 2e7, mediaTypes: ['image/jpeg'] } });
  const user = { can: async () => true, id: async () => 'u_test', isOwner: async () => true, canEdit: async () => true };
  const downloads = { save: async r => { window.__saved = r; return { status: 'saved' }; } };
  const caps = { db, sample, user, downloads };
  window.claude = { use: async n => { await new Promise(r => setTimeout(r, 20)); return caps[n] || null; } };
})();`;
async function openMock(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 400, height: opts.h || 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  if (opts.seed) await ctx.addInitScript(s => { window.__seed = s; }, opts.seed);
  if (opts.local) await ctx.addInitScript(l => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const k in l) localStorage.setItem(k, l[k]); } }, opts.local);
  await ctx.addInitScript(MOCK);
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.goto('file://' + page + (opts.hash || ''));
  if (!opts.noWait) await p.waitForSelector('#solChips .chip:not(.skel)', { timeout: 30000 }); // 스켈레톤이 아니라 계산이 끝난 칩
  return p;
}

test('E2E 23: 시스템 표 — 17줄, 줄 고르기, 수구 끌면 표가 바뀜', async () => {
  const p = await open();
  await p.click('#mSys');
  assert.equal(await p.$$eval('#sysTable tr[data-k]', r => r.length), 17);
  await p.click('#sysTable tr[data-k="4"]');
  assert.equal(await p.getAttribute('#sysTable tr[data-k="4"]', 'aria-selected'), 'true');
  const before = await p.textContent('#sysTable');
  const vis = await p.$eval('#cvTable', c => { const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  assert.ok(vis, '표를 눌러도 당구대가 화면에 보여야 함');
  const box = await p.$eval('#cvTable', c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
  const s = box.w / (2.844 + 0.3), bx = box.x + (0.15 + 0.75) * s, by = box.y + (0.15 + 0.95) * s;
  await p.mouse.move(bx, by); await p.mouse.down(); await p.mouse.move(bx + 120, by - 40, { steps: 6 }); await p.mouse.up();
  assert.notEqual(await p.textContent('#sysTable'), before);
  await p.click('#sysTip [data-v="3"]'); assert.match(await p.textContent('#sysNote'), /3팁/);
  noErr(p); await p.context().close();
});
test('E2E 24: 4구 — 목표 200, 한 번 득점에 10점', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scType [data-v="4b"]');
  assert.equal(await p.inputValue('#scPlayers input[data-k="target"]'), '200');
  await p.click('#scStart'); assert.equal(await p.textContent('#scHit'), '+10 득점');
  await p.click('#scHit'); await p.click('#scHit');
  assert.equal(await p.$eval('.sc-score b', b => b.textContent), '20');
  assert.match(await p.textContent('#scTitle'), /4구/);
  noErr(p); await p.context().close();
});
test('E2E 25: 선수 명단 — 저장한 이름을 고르면 점수(핸디)가 자동 입력', async () => {
  const p = await open({ hash: '#score', noWait: true });
  const n = await p.$$('#scPlayers input[data-k="name"]'), t = await p.$$('#scPlayers input[data-k="target"]');
  await n[0].fill('김철수'); await t[0].fill('28'); await n[1].fill('이영희'); await t[1].fill('15');
  await p.click('#scRosterSave');
  await p.click('#scPlus');
  const n3 = (await p.$$('#scPlayers input[data-k="name"]'))[2];
  await n3.fill('이영희');
  assert.equal(await (await p.$$('#scPlayers input[data-k="target"]'))[2].inputValue(), '15');
  await p.click('#scRosterBox summary'); assert.match(await p.textContent('#scRoster'), /김철수/);
  noErr(p); await p.context().close();
});
test('E2E 26: 리모컨 버튼 지정 — 아무 키나 득점/공타/되돌리기로', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scMore > summary'); await p.click('#scKeyLearn');
  await p.keyboard.press('k'); await p.keyboard.press('j'); await p.keyboard.press('u');
  assert.equal(await p.isVisible('#scKeyPanel'), false);
  assert.match(await p.textContent('#scKeyInfo'), /득점 k/);
  await p.click('#scStart');
  await p.keyboard.press('k'); await p.keyboard.press('k'); await p.keyboard.press('u'); await p.keyboard.press('j');
  assert.deepEqual(await p.$$eval('.sc-score b', e => e.map(x => x.textContent)), ['1', '0']);
  assert.match(await p.textContent('#scInfo'), /선수 B 차례/);
  noErr(p); await p.context().close();
});
test('E2E 27: 기록 백업 저장 → 다른 기기에서 불러오기', async () => {
  const p = await openMock({ hash: '#score', noWait: true });
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('1'); await t[1].fill('1');
  await p.click('#scStart'); await p.click('#scMiss'); await p.click('#scHit');
  await p.click('#scExport'); await p.waitForFunction(() => window.__saved);
  const saved = await p.evaluate(() => window.__saved);
  assert.match(saved.filename, /^3쿠션-기록-\d{8}\.json$/);
  await p.context().close();
  const q = await open({ hash: '#score', noWait: true });
  await q.setInputFiles('#scImport', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(saved.data) });
  await q.waitForFunction(() => /선수 B/.test(document.querySelector('#scHist').textContent));
  await q.setInputFiles('#scImport', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  // 파일 읽기는 비동기라 안내가 뜰 때까지 기다림
  await q.waitForFunction(() => /백업 파일이 아니에요/.test(document.querySelector('#toast').textContent));
  noErr(q); await q.context().close();
});
test('E2E 28: 클럽 기록 — 경기 끝나면 공유 기록에 올라가고 실시간 중계가 보임', async () => {
  const p = await openMock({ hash: '#score', noWait: true });
  await p.waitForSelector('#clubPanel:not([hidden])');
  await p.click('#scMore > summary'); assert.equal(await p.isVisible('#scLiveRow'), true);
  await p.check('#scLive');
  // 기본 이름(선수 A…)은 선수별 기록에서 빠지므로 실제 이름으로
  const n = await p.$$('#scPlayers input[data-k="name"]'); await n[0].fill('김철수'); await n[1].fill('이영희');
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('2'); await t[1].fill('2');
  await p.click('#scStart'); await p.click('#scHit');
  await p.waitForSelector('#clubLive .live-card');
  await p.click('#clubLive [data-watch]'); await p.waitForSelector('#clubWatch .sc-p');
  await p.click('#scHit'); await p.click('#scMiss');
  await p.waitForFunction(() => /김철수/.test(document.querySelector('#clubStats').textContent));
  assert.match(await p.textContent('#clubHist'), /김철수 승/);
  noErr(p); await p.context().close();
});
test('E2E 29: Claude 코치 설명 (흉내)', async () => {
  const p = await openMock();
  await p.waitForSelector('#btnCoach:not([hidden])');
  await p.click('#btnCoach');
  await p.waitForFunction(() => document.querySelector('#coachOut').textContent.includes('안전해요'));
  const prompt = await p.evaluate(() => window.__prompt);
  assert.match(prompt, /추천 길: /); assert.match(prompt, /당점: /);
  noErr(p); await p.context().close();
});
test('E2E 30: 사진 올리기 → 펴기 → Claude로 공 찾기 (흉내)', async () => {
  const p = await openMock();
  const dataUrl = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 600; const g = c.getContext('2d');
    g.fillStyle = '#4a2f1e'; g.fillRect(0, 0, 1000, 600); g.fillStyle = '#2158b8'; g.fillRect(100, 100, 800, 400);
    return c.toDataURL('image/png');
  });
  await p.setInputFiles('#fileIn', { name: 't.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await p.waitForSelector('#viewCorner:not([hidden])');
  await p.click('#btnConfirm');
  await p.waitForSelector('#aiRow:not([hidden])');
  assert.match(await p.textContent('#aiRowText'), /못 찾았어요/);
  await p.click('#btnAiBalls');
  await p.waitForFunction(() => /Claude가/.test(document.querySelector('#toast').textContent));
  assert.equal(await p.evaluate(() => window.__jsonImages), 1);
  // 흉내 응답(900×450 픽셀 좌표)이 테이블 미터 좌표로 정확히 바뀌었는지
  assert.equal(await p.inputValue('#codeOut'), '3C-D-W-0711-0474-2133-0948-1422-0711');
  const pills = await p.$$eval('#status .pill.miss', e => e.length); assert.equal(pills, 0);
  noErr(p); await p.context().close();
});
test('E2E 31: 플랫폼 기능이 없으면 클럽·Claude 버튼은 숨김', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.waitForTimeout(300);
  assert.equal(await p.isVisible('#clubPanel'), false); assert.equal(await p.isVisible('#scLiveRow'), false);
  await p.click('.tabs [data-tab="find"]'); await p.waitForSelector('.chip');
  assert.equal(await p.isVisible('#btnCoach'), false); assert.equal(await p.isVisible('#aiRow'), false);
  noErr(p); await p.context().close();
});
test('E2E 32: 가로로 눕힌 휴대폰 큰 화면 — 점수 왼쪽, 버튼 오른쪽', async () => {
  const p = await open({ hash: '#score', noWait: true, w: 844 });
  await p.setViewportSize({ width: 844, height: 390 });
  await p.click('#scStart'); await p.click('#scBig');
  const r = await p.evaluate(() => { const a = document.querySelector('#scBoard').getBoundingClientRect(), b = document.querySelector('#scHit').getBoundingClientRect(); return [a.left, a.right, b.left, b.top]; });
  assert.ok(r[2] >= r[1] - 1, JSON.stringify(r));
  noErr(p); await p.context().close();
});

// 점수판을 다녀와도 당구대 캔버스 크기가 맞고 공이 끌리는지
async function tableFits(p) {
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  return p.$eval('#cvTable', c => {
    const dpr = Math.min(3, window.devicePixelRatio || 1), r = c.getBoundingClientRect();
    return { cw: c.width / dpr, sw: c.parentElement.clientWidth, ch: c.height / dpr, rh: r.height };
  });
}
async function dragWhite(p) {
  await p.$eval('#cvTable', c => c.scrollIntoView({ block: 'center' }));
  const before = await p.inputValue('#codeOut');
  const box = await p.$eval('#cvTable', c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
  const s = box.w / (2.844 + 0.3), bx = box.x + (0.15 + 0.75) * s, by = box.y + (0.15 + 0.95) * s;
  await p.mouse.move(bx, by); await p.mouse.down(); await p.mouse.move(bx + 60, by - 20, { steps: 5 }); await p.mouse.up();
  return before !== await p.inputValue('#codeOut');
}
for (const c of [{ w: 400 }, { w: 1200 }, { w: 400, hash: '#score' }, { w: 1200, resize: 900 }]) {
  test(`E2E 33: 점수판 → 길 찾기로 오가도 당구대가 안 찌그러짐 (${JSON.stringify(c)})`, async () => {
    const p = await open({ w: c.w, hash: c.hash, noWait: !!c.hash });
    if (!c.hash) await p.click('.tabs [data-tab="score"]');
    if (c.resize) await p.setViewportSize({ width: c.resize, height: 900 });
    await p.click('.tabs [data-tab="find"]'); await p.waitForSelector('.chip');
    const f = await tableFits(p);
    assert.ok(Math.abs(f.cw - f.sw) < 2, JSON.stringify(f));
    assert.ok(Math.abs(f.rh - f.ch) < 2, JSON.stringify(f));
    assert.ok(await dragWhite(p), '흰공을 끌면 배치 코드가 바뀌어야 함');
    noErr(p); await p.context().close();
  });
}
test('E2E 34: 점수판에서 붙여넣은 사진은 길 찾기에서 맞는 크기로 열리고, 입력 칸 붙여넣기는 무시', async () => {
  const p = await open({ hash: '#score', noWait: true });
  const paste = sel => p.evaluate(async sel => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 600; const g = c.getContext('2d');
    g.fillStyle = '#4a2f1e'; g.fillRect(0, 0, 1000, 600); g.fillStyle = '#2158b8'; g.fillRect(100, 100, 800, 400);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 't.png', { type: 'image/png' }));
    document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, sel);
  await paste('#scPlayers input[data-k="name"]');
  assert.equal(await p.isVisible('#tabScore'), true);
  assert.equal(await p.isHidden('#viewCorner'), true);
  await paste('#tabScore');
  await p.waitForSelector('#viewCorner:not([hidden])');
  assert.equal(await p.isVisible('#tabFind'), true);
  const r = await p.$eval('#cvPhoto', c => ({ cw: c.getBoundingClientRect().width, sw: c.parentElement.clientWidth }));
  assert.ok(Math.abs(r.cw - r.sw) < 2, JSON.stringify(r));
  noErr(p); await p.context().close();
});
test('E2E 35: 감싸지 않은 index.html을 휴대폰에서 바로 열어도 360px 레이아웃', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await ctx.route('https://fonts.googleapis.com/**', r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await p.waitForSelector('.chip', { timeout: 30000 });
  assert.equal(await p.evaluate(() => window.innerWidth), 360);
  assert.equal(await p.evaluate(() => document.characterSet), 'UTF-8');
  assert.equal(await p.$eval('.wrap', e => e.lang), 'ko');
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).wordBreak), 'keep-all');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});
test('E2E 36: 글꼴 서버가 응답하지 않아도 첫 화면과 추천 길이 뜸', async () => {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await ctx.route('https://fonts.googleapis.com/**', () => {}); // 끝내 응답 없음
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + page, { waitUntil: 'commit' });
  await p.waitForSelector('.chip', { timeout: 15000 });
  assert.ok(await p.$('link[rel="stylesheet"][href*="fonts.googleapis.com/css2"]'), '글꼴은 나중에 붙여야 함');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});
test('E2E 37: 다시 계산하는 동안 지난 길은 지우고, 몰린 계산은 하나로 합침', async () => {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await ctx.addInitScript(() => {
    window.__posts = 0;
    if (window.Worker) { const pm = Worker.prototype.postMessage; Worker.prototype.postMessage = function (m) { window.__posts++; return pm.call(this, m); }; }
  });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + page);
  await p.waitForSelector('#solChips .chip:not(.skel)', { timeout: 30000 });
  // 같은 틱에서 세 번 요청: 바로 스켈레톤이 보이고 지난 길·요약 줄은 사라짐
  const r = await p.evaluate(() => {
    window.__posts = 0;
    for (let i = 0; i < 3; i++) document.getElementById('btnRandom').click();
    return { skel: document.querySelectorAll('#solChips .chip.skel').length, real: document.querySelectorAll('#solChips .chip:not(.skel)').length, strip: document.getElementById('recStrip').hidden };
  });
  assert.deepEqual(r, { skel: 3, real: 0, strip: true });
  await p.waitForFunction(() => !document.querySelector('#solChips .chip.skel'), null, { timeout: 30000 });
  // 워커는 처음 1번 + 끝난 뒤 최신 배치로 1번만 계산
  assert.ok(await p.evaluate(() => window.__posts) <= 2);
  assert.ok(await p.$$eval('#solChips .chip', e => e.length) <= 6);
  assert.equal(await p.evaluate(() => document.querySelector('#status').textContent.includes('계산 중')), false);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});
test('E2E 38: 손가락으로 득점을 누른 뒤 리모컨 Enter는 공타, 꾹 누른 키는 한 번만', async () => {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 }, hasTouch: true });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + page + '#score');
  await p.click('#scStart');
  const scores = () => p.$$eval('.sc-score b', e => e.map(x => x.textContent));
  await p.tap('#scHit'); await p.keyboard.press('Enter');
  assert.deepEqual(await scores(), ['1', '0']);
  assert.match(await p.textContent('#scInfo'), /선수 B 차례/);
  // 꾹 누르면 반복 keydown(repeat)이 와도 +1만
  await p.keyboard.down('ArrowUp'); await p.keyboard.down('ArrowUp'); await p.keyboard.down('ArrowUp'); await p.keyboard.up('ArrowUp');
  assert.deepEqual(await scores(), ['1', '1']);
  // Tab으로 고른 버튼은 Enter가 그 버튼 동작(결과 복사)
  await p.keyboard.press('Tab'); await p.focus('#scCopy'); await p.keyboard.press('Enter');
  assert.deepEqual(await scores(), ['1', '1']);
  assert.match(await p.textContent('#scInfo'), /선수 B 차례/);
  // 복사 결과 글은 클립보드 응답 뒤에 뜸
  await p.waitForSelector('#scMsg', { state: 'visible', timeout: 3000 });
  assert.deepEqual(p.errors, []);
  await ctx.close();
});
test('E2E 39: 리모컨 버튼 지정 — 이름 칸 입력은 안 배우고, 취소하면 지난 지정 유지', async () => {
  const p = await open({ hash: '#score', noWait: true });
  const keys = () => p.evaluate(() => localStorage.getItem('cue3-keys'));
  await p.click('#scMore > summary'); await p.click('#scKeyLearn');
  await p.click('#scPlayers input[data-k="name"]'); await p.keyboard.type('abc');
  assert.equal(await keys(), null);
  assert.match(await p.textContent('#scKeyStep'), /^1\/3/);
  await p.click('#scKeyDone');
  assert.equal(await keys(), null);
  await p.click('#scKeyLearn');
  await p.keyboard.press('k'); await p.keyboard.press('j'); await p.keyboard.press('u');
  assert.deepEqual(JSON.parse(await keys()), { hit: ['k'], miss: ['j'], undo: ['u'] });
  // 다시 지정하다 Escape: 그대로
  await p.click('#scKeyLearn'); await p.keyboard.press('Escape');
  assert.deepEqual(JSON.parse(await keys()), { hit: ['k'], miss: ['j'], undo: ['u'] });
  assert.match(await p.textContent('#scKeyInfo'), /득점 k/);
  // 득점만 새로 배우고 끝내기: 나머지는 그대로
  await p.click('#scKeyLearn'); await p.keyboard.press('x'); await p.click('#scKeyDone');
  assert.deepEqual(JSON.parse(await keys()), { hit: ['x'], miss: ['j'], undo: ['u'] });
  noErr(p); await p.context().close();
});
test('E2E 40: 경기 시작하면 점수판이 화면 안에, 새 경기는 맨 위로', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + page + '#score');
  for (let i = 0; i < 4; i++) await p.click('#scPlus');
  await p.click('#scStart');
  const top = await p.$eval('#scBoard', e => e.getBoundingClientRect().top);
  assert.ok(top >= 0 && top < 740, String(top));
  // 큰 화면에서 차례가 넘어가면 지금 선수 카드가 보이게
  await p.click('#scBig');
  for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowDown');
  assert.match(await p.textContent('#scInfo'), /선수 F 차례/);
  const r = await p.$eval('#scBoard .sc-p.on', e => { const b = e.getBoundingClientRect(); return [b.top, b.bottom]; });
  assert.ok(r[0] >= -1 && r[1] <= 741, JSON.stringify(r));
  await p.click('#scBig');
  await p.click('#scNew'); await p.click('#scNew');
  assert.equal(await p.evaluate(() => window.scrollY), 0);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});
test('E2E 41: 새로 고쳐도 되돌리기와 연장 기록이 남고, 탭을 다녀오면 샷 클락은 이어 감', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scMore > summary'); await p.click('#scClockSeg [data-v="30"]'); await p.click('#scStart');
  await p.click('#scExt'); await p.click('#scHit');
  await p.reload(); await p.waitForSelector('#scGame:not([hidden])');
  assert.equal(await p.isDisabled('#scExt'), true);
  assert.equal(await p.isDisabled('#scUndo'), false);
  await p.click('#scUndo');
  assert.deepEqual(await p.$$eval('.sc-score b', e => e.map(x => x.textContent)), ['0', '0']);
  assert.equal(await p.isDisabled('#scExt'), true);
  // 남은 시간이 28초 이하가 된 뒤 탭을 다녀와도 30초로 다시 채우지 않음
  await p.waitForFunction(() => +document.querySelector('#scClockNum').textContent <= 28, null, { timeout: 10000 });
  await p.click('.tabs [data-tab="tips"]'); await p.click('.tabs [data-tab="score"]');
  assert.ok(+(await p.textContent('#scClockNum')) <= 28);
  noErr(p); await p.context().close();
});
test('E2E 42: 저장이 막힌 화면이면 경기 설정에 미리 알림', async () => {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await ctx.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('막힘', 'QuotaExceededError'); }; });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + page + '#score');
  assert.match(await p.textContent('#scSetup'), /기록이 저장되지 않아요/);
  await p.click('#scStart'); await p.click('#scHit');
  assert.deepEqual(await p.$$eval('.sc-score b', e => e.map(x => x.textContent)), ['1', '0']);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});
test('E2E 43: 악성 백업을 불러와도 스크립트가 돌지 않고, 망가진 기록 줄은 건너뜀', async () => {
  const p = await open({ hash: '#score', noWait: true });
  const bad = '<img src=x onerror=window.__x=1>';
  const backup = { app: 'cue3', v: 1, history: [
    { id: 'evil1', d: Date.now() - 6e4, k: '3c', n: ['김철수', bad], t: [bad, 20], s: [bad, 3], i: [bad, 5], h: [bad, 2], res: bad },
    { d: Date.now() - 12e4, n: 'x', s: [1] }, null
  ], roster: [{ name: '박민수', t3: '1" onfocus=window.__y=1 autofocus x="' }, { name: bad, t4: bad }, { t3: 5 }] };
  await p.setInputFiles('#scImport', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await p.waitForFunction(() => /김철수/.test(document.querySelector('#scHist').textContent));
  assert.match(await p.textContent('#toast'), /경기 1개 불러옴 · 2개 건너뜀/);
  await p.click('#scRosterBox summary');
  assert.match(await p.textContent('#scRoster'), /박민수/);
  // 명단 이름을 고르면 점수 칸에 숫자만 들어감
  await (await p.$$('#scPlayers input[data-k="name"]'))[0].fill('박민수');
  await p.waitForTimeout(300);
  assert.equal(await p.$$eval('#scHist img, #scMine img, #scRoster img, #scPlayers img', e => e.length), 0);
  assert.equal(await p.$$eval('#scRoster [onfocus], #scPlayers [onfocus]', e => e.length), 0);
  assert.deepEqual(await p.evaluate(() => [window.__x, window.__y]), [undefined, undefined]);
  noErr(p); await p.context().close();
});
test('E2E 44: 칸이 빠진 옛 백업·망가진 저장값이어도 오류 없이 점수가 저장되고, Claude 밖에서는 백업 파일을 내려받음', async () => {
  const p = await open({ hash: '#score', noWait: true });
  // 이미 망가진 저장값은 읽을 때 정리
  await p.evaluate(() => localStorage.setItem('cue3-history', JSON.stringify([{ d: Date.now(), n: ['김철수'], s: ['<img src=x onerror=window.__z=1>'], i: 'x' }, 5, { n: [] }])));
  await p.reload(); await p.waitForSelector('#scSetup:not([hidden])');
  await p.waitForTimeout(200);
  assert.match(await p.textContent('#scHist'), /김철수 0\/0/);
  assert.equal(await p.$$eval('#scHist img', e => e.length), 0);
  assert.equal(await p.evaluate(() => window.__z), undefined);
  await p.setInputFiles('#scImport', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cue3', history: [{ d: 1, n: ['A'], s: [1] }] })) });
  await p.waitForFunction(() => /경기 1개 불러옴/.test(document.querySelector('#toast').textContent));
  await p.click('#scStart'); await p.click('#scHit');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('cue3-score2')).g.players[0].score), 1);
  await p.reload(); await p.waitForSelector('#scGame:not([hidden])');
  assert.deepEqual(await p.$$eval('.sc-score b', e => e.map(x => x.textContent)), ['1', '0']);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#scExport')]);
  // 파일 이름은 실행 환경 로캘에 따라 'download'로 바뀔 수 있어 내용만 확인
  const got = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.equal(got.app, 'cue3'); assert.equal(got.history.length, 2);
  assert.match(await p.textContent('#toast'), /내려받았어요/);
  noErr(p); await p.context().close();
});
test('E2E 45: 300경기를 불러온 뒤 한 경기를 끝내면 301경기, 끝난 경기 되돌리기는 그 경기만 지움', async () => {
  const p = await open({ hash: '#score', noWait: true });
  const now = Date.now(), history = Array.from({ length: 300 }, (_, j) => ({ id: 'old' + j, d: now - (j + 1) * 6e4, k: '3c', n: ['김철수', '이영희'], t: [20, 20], s: [20, j % 20], i: [30, 30], h: [3, 2], res: '김철수 승' }));
  await p.setInputFiles('#scImport', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cue3', v: 1, history })) });
  await p.waitForFunction(() => /경기 300개 불러옴/.test(document.querySelector('#toast').textContent));
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('1'); await t[1].fill('1');
  await p.click('#scStart'); await p.click('#scMiss'); await p.click('#scHit');
  assert.match(await p.textContent('#scMsg'), /경기 끝/);
  const len = () => p.evaluate(() => JSON.parse(localStorage.getItem('cue3-history')).length);
  assert.equal(await len(), 301);
  await p.click('#scUndo');
  assert.equal(await len(), 300);
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('cue3-history')).some(r => r.id === 'old0')), true);
  noErr(p); await p.context().close();
});
test('E2E 46: 파일 저장·복사가 모두 막히면 백업 내용을 버튼 아래 칸에 보여 줌', async () => {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await ctx.addInitScript(() => {
    HTMLAnchorElement.prototype.click = function () { throw new Error('막힘'); };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('막힘')) } });
  });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + page + '#score');
  await p.click('#scExport');
  await p.waitForSelector('#scBackupOut', { state: 'visible' });
  const v = await p.inputValue('#scBackupOut');
  assert.equal(JSON.parse(v).app, 'cue3');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'scBackupOut');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// ---------- 클럽 기록 · 실시간 중계 견고화 ----------
const clubGames = p => p.evaluate(() => [...window.__store.keys()].filter(k => k.startsWith('club/main/games/')));
async function finishNamed(p, a, b) {
  const n = await p.$$('#scPlayers input[data-k="name"]'); await n[0].fill(a); await n[1].fill(b);
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('1'); await t[1].fill('1');
  await p.click('#scStart'); await p.click('#scMiss'); await p.click('#scHit');
}
test('E2E 47: 악성 클럽 문서(숫자 칸 스크립트, 빈 선수, 미래 시각)가 있어도 스크립트가 돌지 않고 정상 중계가 보임', async () => {
  const bad = n => `<img src=x onerror="window.__xss=${n}">`, now = Date.now();
  const seed = {
    'club/main/games/evil1': { id: 'evil1', d: now - 6e4, k: '3c', n: ['김철수', '이영희'], t: [2, bad(1)], s: [bad(2), 1], i: [1, bad(3)], h: [bad(4), 1], res: bad(5) },
    'club/main/games/future': { id: 'future', d: 9e15, n: ['미래인', '이영희'], t: [2, 2], s: [2, 1], i: [1, 1], h: [1, 1], res: '미래인 승' },
    'club/main/live/evil': { u: now, round: bad(6), turn: 0, players: [{ name: bad(7), score: bad(8), target: 2, inn: bad(9), high: 0 }] },
    'club/main/live/nulls': { u: now, players: [null] },
    'club/main/live/future': { u: 9e15, players: [{ name: '미래인', score: 1, target: 2, inn: 1, high: 1 }] },
    'club/main/live/real': { u: now - 1000, done: false, round: 3, turn: 1, players: [{ name: '박정상', score: 5, target: 20, inn: 3, high: 2 }, { name: '최정상', score: 4, target: 20, inn: 2, high: 2 }] },
    'club/main/live/fake': { id: 'real', u: now - 2000, players: [{ name: '가짜', score: 1, target: 2, inn: 1, high: 1 }] }
  };
  const p = await openMock({ hash: '#score', noWait: true, seed });
  await p.waitForFunction(() => /박정상/.test(document.querySelector('#clubLive').textContent));
  await p.waitForFunction(() => /김철수/.test(document.querySelector('#clubStats').textContent));
  const live = await p.textContent('#clubLive');
  assert.doesNotMatch(live, /미래인/); assert.doesNotMatch(await p.textContent('#clubHist'), /미래인/);
  assert.doesNotMatch(await p.textContent('#clubStats'), /NaN|Infinity/);
  // 문서 본문의 id가 다른 경기 id를 덮어쓰지 못함
  assert.equal(await p.$$eval('#clubLive [data-watch="real"]', e => e.length), 1);
  await p.click('#clubLive [data-watch="real"]');
  await p.waitForFunction(() => /박정상/.test(document.querySelector('#clubWatch').textContent));
  await p.click('#clubLive [data-watch="evil"]');
  await p.waitForSelector('#clubWatch .sc-p');
  assert.equal(await p.evaluate(() => document.querySelectorAll('img').length), 0);
  assert.equal(await p.evaluate(() => window.__xss), undefined);
  // 다른 사람 중계는 탭의 빨간 점과 점수판 맨 위 바로 가기로 알림
  assert.equal(await p.$eval('#tabBtnScore', b => b.classList.contains('has-live')), true);
  assert.match(await p.textContent('#clubLiveJump'), /지금 경기 중 \d+ · 보기/);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#clubLiveJump');
  assert.ok(await p.$eval('#clubLive', el => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
  noErr(p); await p.context().close();
});
test('E2E 48: 이 기기 기록 올리기 — id 없는 한글 이름 기록도 올라가고, 혼자 연습·기본 이름 기록은 건너뜀', async () => {
  const now = Date.now(), hist = [
    { d: now - 6e4, k: '3c', n: ['김철수', '이영희'], t: [20, 20], s: [20, 15], i: [10, 10], h: [5, 3], res: '김철수 승' },
    { d: now - 12e4, k: '3c', n: ['선수 A', '선수 B'], t: [20, 20], s: [20, 1], i: [10, 10], h: [5, 1], res: '선수 A 승' },
    { id: 'solo1', d: now - 18e4, k: '3c', n: ['박민수'], t: [20], s: [12], i: [20], h: [3], res: '박민수 12점' }
  ];
  const p = await openMock({ hash: '#score', noWait: true, local: { 'cue3-history': JSON.stringify(hist) } });
  await p.waitForSelector('#clubWriteRow:not([hidden])');
  await p.click('#clubUpAll');
  await p.waitForFunction(() => /1개 올림/.test(document.querySelector('#toast').textContent));
  const keys = await clubGames(p);
  assert.equal(keys.length, 1); assert.match(keys[0], /^club\/main\/games\/h[0-9a-z]+-[0-9a-z]+$/);
  assert.deepEqual(await p.evaluate(k => window.__store.get(k).n, keys[0]), ['김철수', '이영희']);
  assert.equal(await p.isDisabled('#clubUpAll'), false);
  await p.waitForFunction(() => /김철수/.test(document.querySelector('#clubStats').textContent));
  // 다시 눌러도 같은 id라 두 번 올라가지 않음
  await p.click('#clubUpAll');
  await p.waitForFunction(() => /올릴 새 경기가 없어요/.test(document.querySelector('#toast').textContent));
  assert.equal((await clubGames(p)).length, 1);
  noErr(p); await p.context().close();
});
test('E2E 49: 클럽 — 기본 이름 경기는 안 올리고, 끝난 경기를 되돌리면 클럽 기록도 지우고, 접은 경기는 중계에 중단으로 남김', async () => {
  const p = await openMock({ hash: '#score', noWait: true });
  await p.waitForSelector('#clubWriteRow:not([hidden])');
  assert.equal(await p.isChecked('#clubAuto'), true);
  await p.click('#scMore > summary'); await p.check('#scLive');
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('1'); await t[1].fill('1');
  await p.click('#scStart'); await p.click('#scMiss'); await p.click('#scHit');
  await p.waitForFunction(() => /이름을 적은 2인 이상/.test(document.querySelector('#toast').textContent));
  assert.equal((await clubGames(p)).length, 0);
  await p.click('#scNew');
  await finishNamed(p, '김철수', '이영희');
  await p.waitForFunction(() => [...window.__store.keys()].some(k => k.startsWith('club/main/games/')));
  await p.click('#scUndo');
  await p.waitForFunction(() => ![...window.__store.keys()].some(k => k.startsWith('club/main/games/')));
  // 되돌린 경기를 끝내지 않고 접으면 중계 문서는 '중단'으로 닫힘
  await p.click('#scNew'); await p.click('#scNew');
  await p.waitForFunction(() => [...window.__store.entries()].some(([k, v]) => k.startsWith('club/main/live/') && v.done === true && v.res === '중단'));
  await p.waitForFunction(() => /중단/.test(document.querySelector('#clubLive').textContent));
  // 내 기기 중계는 바로 가기·빨간 점 대상이 아님
  assert.equal(await p.isVisible('#clubLiveJump'), false);
  assert.equal(await p.$eval('#tabBtnScore', b => b.classList.contains('has-live')), false);
  // 자동 올리기 해제는 다음 방문에도 유지
  await p.uncheck('#clubAuto');
  await p.reload(); await p.waitForSelector('#clubWriteRow:not([hidden])');
  assert.equal(await p.isChecked('#clubAuto'), false);
  noErr(p); await p.context().close();
});
test('E2E 50: 클럽 기록을 못 올리면 알려 주고, 이 기기 기록 올리기로 다시 올림', async () => {
  const p = await openMock({ hash: '#score', noWait: true });
  await p.waitForSelector('#clubWriteRow:not([hidden])');
  await p.evaluate(() => { window.__failWrites = 'internal'; });
  await finishNamed(p, '김철수', '이영희');
  await p.waitForFunction(() => /클럽 기록에 못 올렸어요/.test(document.querySelector('#toast').textContent));
  const pend = await p.evaluate(() => JSON.parse(localStorage.getItem('cue3-club-pending')));
  assert.equal(pend.length, 1);
  // 권한 문제가 아니므로 보기 전용으로 바뀌지 않음
  assert.match(await p.textContent('#clubStatus'), /함께 쓰는/);
  await p.evaluate(() => { window.__failWrites = ''; });
  await p.click('#clubUpAll');
  await p.waitForFunction(() => /1개 올림/.test(document.querySelector('#toast').textContent));
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('cue3-club-pending'))), []);
  assert.equal(await p.evaluate(id => window.__store.has('club/main/games/' + id), pend[0]), true);
  noErr(p); await p.context().close();
});

// 공 놓기·되돌리기 조작
const BR = 0.03075;
async function tablePx(p, x, y, W = 2.844) {
  await p.$eval('#cvTable', c => c.scrollIntoView({ block: 'center' }));
  const box = await p.$eval('#cvTable', c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
  const s = box.w / (W + 0.3);
  return [box.x + (0.15 + x) * s, box.y + (0.15 + y) * s];
}
async function dragPx(p, from, to) {
  await p.mouse.move(from[0], from[1]); await p.mouse.down();
  await p.mouse.move(to[0], to[1], { steps: 6 }); await p.mouse.up();
}
const layoutLS = p => p.evaluate(() => JSON.parse(localStorage.getItem('cue3-layout') || 'null'));
test('E2E 51: 공을 누르기만 하고 떼면 다시 계산하지 않고 고른 길이 그대로', async () => {
  const p = await open();
  await p.click('#solChips .chip[data-i="1"]');
  const code = await p.inputValue('#codeOut');
  const [x, y] = await tablePx(p, 0.75, 0.95);
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up();
  const r = await p.evaluate(() => ({
    busy: document.querySelector('#status').textContent.includes('계산 중'),
    sel: document.querySelector('#solChips .chip[aria-pressed="true"]').dataset.i,
    skel: document.querySelectorAll('#solChips .chip.skel').length
  }));
  assert.deepEqual(r, { busy: false, sel: '1', skel: 0 });
  assert.equal(await p.inputValue('#codeOut'), code);
  assert.equal(await p.isDisabled('#btnUndo'), true);
  noErr(p); await p.context().close();
});
test('E2E 52: 대대 끝으로 옮긴 공은 중대로 바꾼 뒤 되돌려도 판 안에 남고, 다시 열어도 그대로', async () => {
  const p = await open();
  await dragPx(p, await tablePx(p, 2.35, 1.15), await tablePx(p, 2.83, 1.15));
  assert.ok((await layoutLS(p)).balls.yellow.x > 2.79);
  await dragPx(p, await tablePx(p, 0.75, 0.95), await tablePx(p, 0.95, 0.85));
  await p.$eval('#segTable [data-v="jungdae"]', b => b.click());
  await p.click('#btnUndo');
  const inside = L => ['white', 'yellow', 'red'].every(k => L.balls[k].x >= BR - 1e-9 && L.balls[k].x <= 2.54 - BR + 1e-9 && L.balls[k].y >= BR - 1e-9 && L.balls[k].y <= 1.27 - BR + 1e-9);
  const L = await layoutLS(p);
  assert.equal(L.table, 'jungdae');
  assert.ok(inside(L), JSON.stringify(L));
  assert.ok(L.balls.yellow.x > 2.4, '되돌린 노란공은 오른쪽 끝 근처');
  // 판 밖 값이 저장돼 있어도 시작할 때 바로잡음
  await p.evaluate(() => localStorage.setItem('cue3-layout', JSON.stringify({ table: 'jungdae', balls: { white: { x: 0.75, y: 0.95 }, yellow: { x: 2.78, y: 1.30 }, red: { x: 2.50, y: 1.20 } } })));
  await p.reload(); await p.waitForFunction(() => !document.querySelector('#status').textContent.includes('계산 중'), null, { timeout: 30000 });
  const m = (await p.inputValue('#codeOut')).match(/^3C-J-W-(\d{4})-(\d{4})-(\d{4})-(\d{4})-(\d{4})-(\d{4})$/);
  assert.ok(m, await p.inputValue('#codeOut'));
  const v = m.slice(1).map(n => +n / 1000);
  assert.ok(v[2] <= 2.54 - BR + 0.001 && v[3] <= 1.27 - BR + 0.001, String(v));
  assert.ok(Math.hypot(v[2] - v[4], v[3] - v[5]) >= 2 * BR, '저장값에서 겹친 공도 떨어뜨림');
  noErr(p); await p.context().close();
});
test('E2E 53: 레일 가까운 빨간공 위로 흰공을 끌어도 겹치지 않음', async () => {
  const p = await open();
  await p.evaluate(() => { document.querySelector('#codeIn').value = '3C-D-W-0750-0950-2350-1150-1000-0075'; document.querySelector('#btnLoadCode').click(); });
  await p.waitForSelector('#solChips .chip:not(.skel)', { timeout: 30000 });
  await dragPx(p, await tablePx(p, 0.75, 0.95), await tablePx(p, 1.0, 0.0));
  const L = await layoutLS(p), w = L.balls.white, r = L.balls.red;
  assert.ok(Math.hypot(w.x - r.x, w.y - r.y) >= 2 * BR, JSON.stringify(L));
  assert.ok(w.y >= BR - 1e-9 && w.x >= BR && w.x <= 2.844 - BR, JSON.stringify(w));
  assert.ok(Math.abs(r.x - 1.0) < 1e-9 && Math.abs(r.y - 0.075) < 1e-9, '빨간공은 제자리');
  noErr(p); await p.context().close();
});
test('E2E 54: 직접 조준에서 공을 탭하면 공은 그대로 두고 그쪽을 겨냥, 6px 넘게 끌면 공이 움직임', async () => {
  const p = await open();
  await p.click('#mAim');
  const code = await p.inputValue('#codeOut');
  const red = await tablePx(p, 1.55, 0.62);
  await p.mouse.move(red[0], red[1]); await p.mouse.down(); await p.mouse.up();
  assert.equal(await p.inputValue('#codeOut'), code);
  // 흰공(0.75, 0.95)에서 빨간공(1.55, 0.62) 쪽: 약 22.4°
  const deg = parseFloat(await p.textContent('#angDeg'));
  assert.ok(Math.abs(deg - 22.4) < 1.5, String(deg));
  await dragPx(p, red, [red[0] + 30, red[1] + 12]);
  assert.notEqual(await p.inputValue('#codeOut'), code);
  noErr(p); await p.context().close();
});
test('E2E 55: 처음 온 사람은 공을 끌어 보라는 안내를 보고, 처음 끌면 안내가 바뀌고 사용법 카드가 접힘', async () => {
  const p = await open();
  assert.match(await p.textContent('#tableHint'), /공을 끌어 보세요/);
  assert.equal(await p.$eval('#photoCard', e => e.classList.contains('compact')), false);
  await dragPx(p, await tablePx(p, 0.75, 0.95), await tablePx(p, 0.95, 0.85));
  assert.doesNotMatch(await p.textContent('#tableHint'), /끌어 보세요/);
  assert.equal(await p.$eval('#photoCard', e => e.classList.contains('compact')), true);
  assert.equal(await p.evaluate(() => localStorage.getItem('cue3-dragged')), '1');
  assert.match(await p.textContent('#status'), /직접 놓은 배치/);
  // 다시 열면 맥박 안내 없음
  await p.reload(); await p.waitForSelector('#solChips .chip:not(.skel)', { timeout: 30000 });
  assert.doesNotMatch(await p.textContent('#tableHint'), /끌어 보세요/);
  noErr(p); await p.context().close();
});
test('E2E 56: 정답 가리기 중 직접 조준은 추천 길이 아니라 빨간공 가운데에서 시작, 미세 조준 +는 오른쪽(시계 방향)이고 다이아몬드로 표시', async () => {
  const p = await open();
  const route = (await p.textContent('#solDetail .route')).trim();
  assert.ok(route.length > 0);
  // 가리지 않으면 1번 길로 시작
  await p.click('#mAim');
  assert.ok((await p.textContent('#aimTable')).includes(route));
  await p.click('#mRec'); await p.check('#hideIn'); await p.click('#mAim');
  assert.ok(!(await p.textContent('#aimTable')).includes(route), '정답 가리기 중에는 추천 길이 보이면 안 됨');
  assert.equal(await p.textContent('#tipCap'), '중상단 가운데');
  // 흰공(0.75, 0.95)에서 빨간공(1.55, 0.62) 가운데: 약 22.4°
  const d0 = parseFloat(await p.textContent('#angDeg'));
  assert.ok(Math.abs(d0 - 22.4) < 0.2, String(d0));
  await p.$eval('.nudge button[data-d="0.5"]', b => b.click());
  const d1 = parseFloat(await p.textContent('#angDeg'));
  assert.ok(Math.abs(d1 - (d0 - 0.5)) < 0.06, `${d0} → ${d1}`);
  assert.match(await p.textContent('#angOut'), /다이아몬드 \d\.\d/);
  noErr(p); await p.context().close();
});
test('E2E 57: 당점 고르기 — 미스큐 당점은 없고, 화살표 키로 허용된 당점만 고름', async () => {
  const p = await open();
  await p.click('#mAim');
  // 7 x 4 = 28점 중 ±3팁 상단·하단 4점은 뺌 (+ 공 테두리 원 1개)
  assert.equal(await p.$$eval('#tipSvg circle', c => c.length), 1 + 24);
  assert.equal(await p.getAttribute('#tipSvg', 'role'), 'slider');
  await p.focus('#tipSvg');
  const val = () => p.getAttribute('#tipSvg', 'aria-valuetext');
  const press = async (k, n) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); assert.doesNotMatch(await val(), /3팁 · (상단|하단)/); } };
  // 위로 끝까지 → 오른쪽 끝까지: 상단이면 2팁에서 멈추고, 3팁이면 중상단에서 멈춤
  await press('ArrowUp', 4); await press('ArrowRight', 7);
  assert.match(await val(), /^오른쪽 (2팁 · 상단|3팁 · 중상단)$/);
  // 한 칸 내려 오른쪽 끝, 아래로 끝까지: 3팁은 하단이 없으므로 중단
  await press('ArrowDown', 1); await press('ArrowRight', 7); await press('ArrowDown', 4);
  assert.equal(await val(), '오른쪽 3팁 · 중단');
  await press('ArrowLeft', 1); await press('ArrowDown', 1);
  assert.equal(await val(), '오른쪽 2팁 · 하단');
  assert.equal(await p.textContent('#tipCap'), await val());
  noErr(p); await p.context().close();
});
test('E2E 58: 시스템 표 — 다이아몬드·쿠션·모양 열, 3팁은 중상단, 가로로 눕힌 휴대폰(800x360)에서 당구대가 표를 덮지 않음', async () => {
  const p = await open();
  await p.click('#mSys');
  const head = await p.textContent('#sysTable tr:first-child');
  assert.match(head, /1쿠션 다이아몬드/); assert.match(head, /모양/);
  assert.match(await p.textContent('#sysTable tr[data-k="0"]'), /쿠션 \d\.\d/);
  await p.click('#sysTip [data-v="3"]');
  assert.match(await p.textContent('#sysNote'), /3팁 · 중상단/);
  await p.setViewportSize({ width: 800, height: 360 }); await p.waitForTimeout(150);
  for (const k of ['0', '8']) {
    await p.$eval(`#sysTable tr[data-k="${k}"]`, e => e.scrollIntoView({ block: 'center' }));
    const hit = await p.$eval(`#sysTable tr[data-k="${k}"]`, tr => { const r = tr.getBoundingClientRect(); return tr.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); });
    assert.ok(hit, `${k}번 줄이 가려짐`);
  }
  noErr(p); await p.context().close();
});
// 연습 문제: 칩 제목('빨간공 · 돌리기' / '빈쿠션 1쿠션')을 퀴즈 답(첫 공|길 이름)으로
const BALLKEY = { 빨간공: 'red', 노란공: 'yellow', 흰공: 'white' };
const quizKey = t => { const m = t.trim().split(' · '); return m.length > 1 ? `${BALLKEY[m[0]]}|${m[1]}` : `cushion|${m[0]}`; };
// 새 배치 계산이 끝날 때까지 (아주 드물게 길이 없는 무작위 배치면 false)
async function quizReady(p) {
  await p.waitForFunction(() => !document.querySelector('#solChips .chip.skel') && (document.getElementById('btnReveal') || /찾지 못했어요/.test(document.getElementById('solDetail').textContent)), null, { timeout: 30000 });
  return !!(await p.$('#btnReveal'));
}
test('E2E 59: 연습 문제 — 첫 공·길 이름을 맞히면 결과와 오늘 점수, 같은 배치는 한 번만 세고, 다음 문제는 새 배치를 가림', async () => {
  const p = await open();
  const titles = await p.$$eval('#solChips .chip .t', e => e.map(x => x.textContent));
  const right = new Set(titles.map(quizKey));
  await p.check('#hideIn');
  await p.waitForSelector('#solDetail [data-q="1"]');
  assert.equal(await p.$$eval('#solChips .chip', e => e.length), 0);
  assert.equal(await p.isVisible('#recStrip'), false);
  assert.equal(await p.isVisible('#btnQuizRandom'), true);
  assert.equal(await p.isVisible('#btnReveal'), true);
  assert.equal(await p.$('#solDetail [data-q="2"]'), null, 'Q2는 Q1에 답한 뒤에');
  assert.deepEqual(await p.$$eval('#solDetail [data-q="1"]', e => e.map(x => x.dataset.v)), ['red', 'yellow', 'cushion']);
  assert.equal(await p.textContent('#quizTally'), '오늘 0문제 중 0개 맞힘');
  // 틀린 답: 빨간공 + 추천에 없는 길 이름
  await p.click('#solDetail [data-q="1"][data-v="red"]');
  const names = await p.$$eval('#solDetail [data-q="2"]', e => e.map(x => x.dataset.v));
  assert.ok(names.length >= 2 && names.length <= 4 && new Set(names).size === names.length, names.join(','));
  const wrong = names.find(n => !right.has('red|' + n));
  assert.ok(wrong, '오답 보기가 하나는 있어야 함');
  await p.click(`#solDetail [data-q="2"][data-v="${wrong}"]`);
  assert.ok(await p.$$eval('#solChips .chip', e => e.length) > 0, '답하면 칩이 다시 보임');
  assert.match(await p.textContent('#quizFb'), /^아쉬워요\. 이 배치는 .+(이|가) 가장 무난해요 \(±\d+mm\)오늘 1문제 중 0개 맞힘$/);
  assert.equal(await p.getAttribute('#solChips .chip[data-i="0"]', 'aria-pressed'), 'true');
  assert.equal(await p.textContent('#btnPlay span'), '멈추기', '답하면 샷을 바로 보여 줌');
  assert.equal(await p.isVisible('#btnNextQ'), true);
  // 다시 가리고 맞는 답: 길 1과 같다고 알려 주지만 같은 배치라 점수는 그대로
  await p.uncheck('#hideIn'); await p.check('#hideIn');
  assert.equal(await p.isVisible('#quizFb'), false);
  const [a1, a2] = quizKey(titles[0]).split('|');
  await p.click(`#solDetail [data-q="1"][data-v="${a1}"]`);
  await p.click(`#solDetail [data-q="2"][data-v="${a2}"]`);
  assert.match(await p.textContent('#quizFb'), /^정답! 길 1\(.+\)과 같아요오늘 1문제 중 0개 맞힘$/);
  const saved = JSON.parse(await p.evaluate(() => localStorage.getItem('cue3-practice')));
  assert.deepEqual({ n: saved.n, ok: saved.ok }, { n: 1, ok: 0 });
  assert.match(saved.day, /^\d{4}-\d{2}-\d{2}$/);
  // 다음 문제: 새 무작위 배치, 정답은 다시 가림
  const code = await p.inputValue('#codeOut');
  await p.click('#btnNextQ');
  assert.notEqual(await p.inputValue('#codeOut'), code);
  assert.match(await p.textContent('#status'), /무작위 배치/);
  if (await quizReady(p)) {
    assert.equal(await p.isVisible('#btnReveal'), true);
    assert.equal(await p.$$eval('#solChips .chip', e => e.length), 0);
    assert.equal(await p.textContent('#quizTally'), '오늘 1문제 중 0개 맞힘');
  }
  assert.equal(await p.isVisible('#quizFb'), false);
  // 접힌 문제집을 열지 않아도 '무작위 문제'로 새 배치
  const code2 = await p.inputValue('#codeOut');
  await p.click('#btnQuizRandom');
  assert.notEqual(await p.inputValue('#codeOut'), code2);
  if (await quizReady(p)) assert.equal(await p.isVisible('#btnReveal'), true);
  noErr(p); await p.context().close();
});
test('E2E 60: 연습 문제 — 어제 점수는 새로 시작하고, 직접 쳐서 득점하면 추천 길과 비교해 맞힌 문제로 셈', async () => {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('cue3-practice', JSON.stringify({ day: '2000-01-01', n: 9, ok: 7 })));
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + page);
  await p.waitForSelector('#solChips .chip:not(.skel)', { timeout: 30000 });
  const title = (await p.textContent('#solChips .chip[data-i="0"] .t')).trim();
  // 가리기 전에 1번 길로 조준해 둔 뒤 가리고 '직접 쳐 보기'
  await p.click('#mAim');
  assert.match(await p.textContent('#aimTable'), /득점/);
  assert.equal(await p.isVisible('#aimFb'), false, '정답을 가리지 않으면 비교 안내 없음');
  await p.click('#mRec'); await p.check('#hideIn');
  assert.equal(await p.textContent('#quizTally'), '오늘 0문제 중 0개 맞힘');
  await p.click('#btnQuizAim');
  assert.equal(await p.isVisible('#aimPanel'), true);
  assert.match(await p.textContent('#aimFb'), new RegExp(`^득점! 추천 길 1\\(${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)과 같은 길이에요 · 여유 ±\\d+mm$`));
  // 조준을 조금 바꿔 다시 득점해도 한 번만 셈
  await p.click('.nudge button[data-d="0.1"]'); await p.click('.nudge button[data-d="-0.1"]');
  await p.click('#mRec');
  assert.equal(await p.textContent('#quizTally'), '오늘 1문제 중 1개 맞힘');
  noErr(p); await ctx.close();
});

// 첫 화면 메시지·사진 도움말·배치 코드 공유
async function openSize(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.goto('file://' + page);
  await p.waitForSelector('#solChips .chip:not(.skel)', { timeout: 30000 });
  await p.evaluate(() => document.fonts.ready);
  return p;
}
const pasteText = (p, sel, text) => p.evaluate(([sel, text]) => {
  const dt = new DataTransfer(); dt.setData('text/plain', text);
  document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, [sel, text]);
test('E2E 61: 첫 화면은 공을 놓으면 길이 나온다고 말하고, 안내 카드가 낮아짐. 처음 무작위 배치하면 카드가 접힘', async () => {
  const p = await openSize(400, 860);
  assert.equal(await p.textContent('.brand span'), '공 위치만 놓으면 3쿠션 길을 계산해 줘요');
  assert.equal(await p.textContent('#photoCard h2'), '공 3개만 놓으면, 득점 길이 나와요');
  assert.equal(await p.$eval('#steps', e => e.tagName), 'P');
  assert.match(await p.textContent('#steps'), /11만 번 넘게.*예시 배치예요/);
  assert.equal(await p.getAttribute('#fileIn', 'aria-label'), '사진으로 공 위치 불러오기');
  assert.equal(await p.$eval('#fileIn', e => e.previousElementSibling.classList.contains('primary')), false);
  // 3단계 목록일 때는 카드 아래 끝이 330px였음
  const bottom = await p.$eval('#photoCard', e => e.getBoundingClientRect().bottom);
  assert.ok(bottom < 330, String(bottom));
  // 처음 무작위 배치: 카드가 접힘. 다시 펼친 사람은 다음 무작위에도 그대로
  await p.click('#layoutBox summary');
  await p.click('#btnRandom');
  assert.equal(await p.$eval('#photoCard', e => e.classList.contains('compact')), true);
  assert.equal(await p.evaluate(() => localStorage.getItem('cue3-steps')), '0');
  await p.click('#btnSteps');
  await p.click('#btnRandom');
  assert.equal(await p.$eval('#photoCard', e => e.classList.contains('compact')), false);
  noErr(p); await p.context().close();
});
test('E2E 62: 360px에서 사진 버튼과 카메라 버튼이 한 줄이고 카드 밖으로 넘치지 않음', async () => {
  const p = await openSize(360, 740);
  const r = await p.evaluate(() => {
    const b = s => document.querySelector(s).getBoundingClientRect();
    const card = b('#photoCard'), pad = parseFloat(getComputedStyle(document.querySelector('#photoCard')).paddingRight);
    return { gal: b('#fileIn').top, cam: b('#camIn').top, right: b('#camIn').right, inner: card.right - pad, sw: document.documentElement.scrollWidth };
  });
  assert.equal(r.cam, r.gal, JSON.stringify(r));
  assert.ok(r.right <= r.inner + 0.5, JSON.stringify(r));
  assert.equal(r.sw, 360);
  noErr(p); await p.context().close();
});
test('E2E 63: 받은 배치 코드 글을 아무 데나 붙여넣으면 그 배치가 열리고, 복사 글에는 안내가 붙음', async () => {
  const p = await openSize(400, 900);
  const code = '3C-J-Y-0500-0400-1800-0900-1200-0300';
  // 점수판에서 붙여넣어도 길 찾기로 돌아와 엶. 테이블·내 공도 코드대로
  await p.click('.tabs [data-tab="score"]');
  await pasteText(p, '#tabScore', `3쿠션 길잡이 배치 문제예요: ${code}\n(3쿠션 길잡이를 열고 아무 데나 붙여넣기 하세요)`);
  assert.equal(await p.isVisible('#tabFind'), true);
  assert.equal(await p.inputValue('#codeOut'), code);
  assert.equal(await p.getAttribute('#segTable [data-v="jungdae"]', 'aria-pressed'), 'true');
  assert.equal(await p.getAttribute('#segMy [data-v="yellow"]', 'aria-pressed'), 'true');
  assert.equal(await p.getAttribute('#quickMy [data-v="yellow"]', 'aria-pressed'), 'true');
  assert.equal(await p.textContent('#toast'), '받은 배치를 열었어요.');
  assert.match(await p.textContent('#status'), /받은 배치/);
  assert.deepEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('cue3-settings'))).table, 'jungdae');
  await p.waitForSelector('#solChips .chip:not(.skel)', { timeout: 30000 });
  // 입력 칸에 붙여넣은 글은 건드리지 않음
  await pasteText(p, '#saveName', '3C-D-W-0750-0950-2350-1150-1000-0075');
  assert.equal(await p.inputValue('#codeOut'), code);
  // 되돌리기 한 번이면 예시 배치로
  await p.click('#btnUndo');
  assert.equal(await p.isDisabled('#btnUndo'), true);
  // 복사 글
  await p.click('#layoutBox summary');
  await p.click('#btnCopyCode');
  const now = await p.inputValue('#codeOut');
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), `3쿠션 길잡이 배치 문제예요: ${now}\n(3쿠션 길잡이를 열고 아무 데나 붙여넣기 하세요)`);
  // '받은 코드 붙여넣기'는 접힌 문제집을 열고 코드 칸에 커서를 둠
  await p.click('#layoutBox summary');
  assert.equal(await p.$eval('#layoutBox', e => e.open), false);
  await p.click('#btnPasteCode');
  assert.equal(await p.$eval('#layoutBox', e => e.open), true);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'codeIn');
  noErr(p); await p.context().close();
});
test('E2E 64: 사진 도움말은 사진 없이 공 놓기가 먼저, 찍는 법은 도움말 안, 아래 안내는 짧게. 사진으로 공을 찾으면 카드가 접힘', async () => {
  const p = await open();
  await p.click('#btnHelp');
  assert.match(await p.textContent('ol.help > li:first-child'), /^사진 없이 공 놓기\s*바로 되는 방법/);
  assert.equal(await p.$eval('#btnManual', e => e.closest('li') === document.querySelector('ol.help > li')), true);
  assert.match(await p.textContent('#helpBrowser'), /링크를 복사해 삼성 인터넷이나 크롬 주소창에 붙여 넣으세요/);
  assert.match(await p.textContent('#uploadHelp'), /찍는 법/);
  const note = await p.textContent('#tabFind .note');
  assert.doesNotMatch(note, /찍는 법/);
  assert.match(note, /길 모양은 힘과 상관없이 계산하고/);
  assert.equal(await p.$eval('#photoCard', e => e.classList.contains('compact')), false);
  const dataUrl = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 600; const g = c.getContext('2d');
    g.fillStyle = '#4a2f1e'; g.fillRect(0, 0, 1000, 600); g.fillStyle = '#2158b8'; g.fillRect(100, 100, 800, 400);
    return c.toDataURL('image/png');
  });
  await p.setInputFiles('#fileIn', { name: 't.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await p.waitForSelector('#viewCorner:not([hidden])');
  assert.equal(await p.$eval('#photoCard', e => e.classList.contains('compact')), false, '코너만 보고 있을 때는 그대로');
  await p.click('#btnConfirm');
  await p.waitForSelector('#viewTable:not([hidden])');
  assert.equal(await p.$eval('#photoCard', e => e.classList.contains('compact')), true);
  noErr(p); await p.context().close();
});
test('E2E 65: 세로 큰 화면은 숫자가 크고 득점 버튼이 아래, 320px에서 공타 버튼이 카드 밖으로 안 넘침, 차례 배지는 길게 안 늘어남', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('#scStart'); await p.click('#scHit'); await p.click('#scBig');
  const r = await p.evaluate(() => ({
    fs: parseFloat(getComputedStyle(document.querySelector('#scBoard .sc-score b')).fontSize),
    hit: document.querySelector('#scHit').getBoundingClientRect().bottom, ih: innerHeight,
    badge: document.querySelector('#scBoard .badge').getBoundingClientRect().height
  }));
  assert.ok(r.fs > 120, JSON.stringify(r));
  assert.ok(r.hit > r.ih * 0.7 && r.hit <= r.ih, JSON.stringify(r));
  assert.ok(r.badge < 26, JSON.stringify(r));
  // 3명 이상은 두 줄 배치
  await p.click('#scBig'); await p.click('#scNew'); await p.click('#scNew');
  await p.click('#scPlus'); await p.click('#scStart'); await p.click('#scBig');
  const cols = await p.$$eval('#scBoard .sc-p', e => new Set(e.map(x => Math.round(x.getBoundingClientRect().left))).size);
  assert.equal(cols, 2);
  await p.setViewportSize({ width: 320, height: 640 });
  await p.click('#scBig'); await p.click('#scNew'); await p.click('#scNew');
  await p.click('#scMinus'); await p.click('#scStart'); await p.click('#scBig');
  const w = await p.evaluate(() => [document.querySelector('#scMiss').getBoundingClientRect().right, document.querySelector('#scGame').getBoundingClientRect().right]);
  assert.ok(w[0] <= w[1], JSON.stringify(w));
  noErr(p); await p.context().close();
});
test('E2E 66: 경기 설정 — 칸 머리글, 시작 버튼은 명단 저장 바로 아래, 추가 설정은 접혀 있다가 바꾼 설정이 있으면 펼쳐서 시작', async () => {
  const p = await open({ hash: '#score', noWait: true, w: 360 });
  assert.equal(await p.textContent('#scSetup .pl-head'), '이름목표 점수(핸디)');
  assert.equal(await p.$eval('#scStart', e => !!e.previousElementSibling.querySelector('#scRosterSave')), true);
  assert.equal(await p.$eval('#scMore', e => e.open), false);
  assert.equal(await p.isVisible('#scTeam'), false);
  await p.click('#scMore > summary');
  // 체크박스는 설명 길이와 상관없이 줄 오른쪽 끝
  const pos = await p.$$eval('#scTeam, #scVoice', e => e.map(x => x.parentElement.getBoundingClientRect().right - x.getBoundingClientRect().right));
  assert.ok(pos.every(d => Math.abs(d) <= 1), JSON.stringify(pos));
  await p.check('#scTeam');
  await p.reload(); await p.waitForSelector('#scSetup:not([hidden])');
  assert.equal(await p.$eval('#scMore', e => e.open), true);
  await p.uncheck('#scTeam');
  await p.reload(); await p.waitForSelector('#scSetup:not([hidden])');
  assert.equal(await p.$eval('#scMore', e => e.open), false);
  noErr(p); await p.context().close();
});
test('E2E 67: 4구 결과 복사·에버·안내 글, 끝나면 같은 설정으로 한 판 더와 순서 바꿔서', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scType [data-v="4b"]');
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('10'); await t[1].fill('10');
  await p.click('#scStart');
  assert.match(await p.textContent('#scNote'), /^득점하면 \+10, 못 맞히면 공타\./);
  assert.equal(await p.isVisible('#scAgain'), false);
  await p.click('#scHit'); await p.click('#scMiss');
  assert.match(await p.textContent('#scMsg'), /선수 A 승/);
  assert.match(await p.textContent('#scBoard'), /에버 10\.0하이런/);
  await p.click('#scCopy');
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /^4구 경기 /);
  assert.match(clip, /선수 A {2}10\/10점 {2}1이닝 {2}에버 10\.0 {2}하이런 10/);
  // 순서 바꿔서: 같은 종목·점수로 B가 먼저
  await p.click('#scSwap');
  assert.deepEqual(await p.$$eval('#scBoard .pname span:first-child', e => e.map(x => x.textContent)), ['선수 B', '선수 A']);
  assert.deepEqual(await p.$$eval('.sc-score b', e => e.map(x => x.textContent)), ['0', '0']);
  assert.equal(await p.textContent('#scHit'), '+10 득점');
  assert.equal(await p.isVisible('#scAgain'), false);
  await p.click('#scHit'); await p.click('#scMiss');
  await p.click('#scAgain');
  assert.deepEqual(await p.$$eval('#scBoard .pname span:first-child', e => e.map(x => x.textContent)), ['선수 B', '선수 A']);
  assert.match(await p.textContent('#scInfo'), /1이닝 · 선수 B 차례/);
  assert.ok((await p.textContent('#scHist')).includes('선수 B'));
  noErr(p); await p.context().close();
});
test('E2E 68: 혼자 연습은 목표를 못 채우면 배지 없음, 채우면 달성', async () => {
  const p = await open({ hash: '#score', noWait: true });
  await p.click('#scMinus');
  await p.click('#scMore > summary'); await p.fill('#scLimit', '1');
  await p.click('#scStart'); await p.click('#scHit'); await p.click('#scMiss');
  assert.match(await p.textContent('#scMsg'), /1이닝 동안 1점/);
  assert.equal(await p.$$eval('#scBoard .badge', e => e.length), 0);
  assert.equal(await p.$eval('#scBoard .sc-p', e => e.classList.contains('win')), false);
  assert.equal(await p.isVisible('#scSwap'), false);
  await p.click('#scNew');
  await p.fill('#scPlayers input[data-k="target"]', '1');
  await p.click('#scStart'); await p.click('#scHit');
  assert.equal(await p.textContent('#scBoard .badge'), '달성');
  // 혼자 연습 큰 화면도 숫자를 크게
  await p.click('#scBig');
  assert.ok(await p.$eval('#scBoard .sc-score b', e => parseFloat(getComputedStyle(e).fontSize)) > 120);
  noErr(p); await p.context().close();
});
test('E2E 69: 우리 테이블 맞추기 — 아래 장쿠션을 누르면 회전 효과가 바뀌고 원래 공·모드로, 쿠션 반발과 저장한 테이블', async () => {
  const p = await open();
  const code = await p.inputValue('#codeOut');
  await p.click('#settings summary');
  assert.equal(await p.textContent('#cushOut'), '0.80');
  assert.match(await p.textContent('#settings'), /필요한 힘 계산에만 쓰여요/);
  // 그만두기: 공·모드·회전 효과 그대로
  await p.click('#btnCalib');
  assert.equal(await p.getAttribute('#mSys', 'aria-pressed'), 'true');
  await p.click('#btnCalibCancel');
  assert.equal(await p.getAttribute('#mRec', 'aria-pressed'), 'true');
  assert.equal(await p.isVisible('#calibBox'), false);
  assert.equal(await p.inputValue('#codeOut'), code);
  // 1단계: 수구를 코너 50에 두고 위 장 3 줄을 강조
  await p.click('#btnCalib');
  assert.equal(await p.isVisible('#calibBox'), true);
  assert.match(await p.textContent('#calibText'), /코너 50에서 위 장 다이아몬드 3\(30\)을 상단 .*2팁/);
  assert.match(await p.textContent('#sysTable tr[aria-selected="true"]'), /위 장 3\.0/);
  await p.$eval('#cvTable', c => c.scrollIntoView({ block: 'center' }));
  const box = await p.$eval('#cvTable', c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
  const s = box.w / (2.844 + 0.3);
  // 아래 장쿠션이 아닌 곳은 무시하고 계속 기다림
  await p.mouse.click(box.x + (0.15 + 1.4) * s, box.y + (0.15 + 0.4) * s);
  assert.equal(await p.isVisible('#calibBox'), true);
  assert.equal(await p.textContent('#spinOut'), '×1.0');
  // 2단계: 아래 장쿠션 1.75 포인트를 누르면 회전 효과를 맞추고 추천 공략으로 돌아옴
  await p.mouse.click(box.x + (0.15 + 1.75 * 2.844 / 8) * s, box.y + (0.15 + 1.422 + 0.06) * s);
  const out = await p.textContent('#spinOut');
  assert.notEqual(out, '×1.0'); assert.match(out, /^×1\.[12]/);
  assert.match(await p.textContent('#toast'), /회전 효과 ×1\.\d+로 맞췄어요/);
  assert.equal(await p.getAttribute('#mRec', 'aria-pressed'), 'true');
  assert.equal(await p.isVisible('#calibBox'), false);
  assert.equal(await p.inputValue('#codeOut'), code);
  assert.equal(JSON.parse(await p.evaluate(() => localStorage.getItem('cue3-settings'))).spinGain, +out.slice(1));
  // 테이블 저장 → 상태 알약. 값을 바꾸면 알약이 빠지고, 다시 고르면 그 값으로
  await p.fill('#tblName', '우리당구장 3번대'); await p.click('#btnTblSave');
  assert.match(await p.textContent('#status'), /우리당구장 3번대/);
  assert.equal(JSON.parse(await p.evaluate(() => localStorage.getItem('cue3-tables')))[0].name, '우리당구장 3번대');
  const setEC = v => p.$eval('#cushIn', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }, v);
  await setEC('0.85');
  assert.equal(await p.textContent('#cushOut'), '0.85');
  assert.doesNotMatch(await p.textContent('#status'), /우리당구장/);
  await p.selectOption('#tblSel', '0');
  assert.equal(await p.textContent('#cushOut'), '0.80');
  assert.equal(await p.textContent('#spinOut'), out);
  assert.match(await p.textContent('#status'), /우리당구장 3번대/);
  // 쿠션 반발이 계산에 들어감: 시스템 표의 3쿠션 도착이 바뀜
  await p.click('#mSys');
  const row = () => p.textContent('#sysTable tr[aria-selected="true"] td:nth-child(2)');
  const r1 = await row();
  await setEC('0.9');
  assert.notEqual(await row(), r1);
  // 새로 열어도 저장한 보정값과 테이블이 남음
  await p.selectOption('#tblSel', '0');
  await p.reload(); await p.waitForSelector('#solChips .chip:not(.skel)', { timeout: 30000 });
  assert.equal(await p.textContent('#spinOut'), out);
  assert.match(await p.textContent('#status'), /우리당구장 3번대/);
  noErr(p); await p.context().close();
});
test('E2E 70: 4구 하우스 룰 — 4구에서만 보이는 옵션, 마무리 3쿠션 버튼, 두 번 눌러야 하는 파울 −10, 기록에 룰 표시', async () => {
  const p = await open({ hash: '#score', noWait: true, w: 360 });
  // 3쿠션에서는 숨김, 기본은 꺼짐
  assert.equal(await p.isVisible('#scOptFin'), false); assert.equal(await p.isVisible('#scOptFoul'), false);
  await p.click('#scType [data-v="4b"]');
  assert.equal(await p.isVisible('#scOptFin'), true); assert.equal(await p.isVisible('#scOptFoul'), true);
  assert.equal(await p.isChecked('#scOptFin'), false); assert.equal(await p.isChecked('#scOptFoul'), false);
  await p.check('#scOptFin'); await p.check('#scOptFoul');
  // 새로 열어도 옵션이 남음
  await p.reload(); await p.waitForSelector('#scSetup:not([hidden])');
  assert.equal(await p.isChecked('#scOptFin'), true); assert.equal(await p.isChecked('#scOptFoul'), true);
  await p.fill('#scPlayers input[data-i="0"][data-k="name"]', '철수'); await p.fill('#scPlayers input[data-i="1"][data-k="name"]', '영희');
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('20'); await t[1].fill('20');
  await p.click('#scStart');
  assert.match(await p.textContent('#scNote'), /3쿠션으로 마무리/);
  assert.equal(await p.isVisible('#scFoul'), true);
  const scores = () => p.$$eval('.sc-score b', e => e.map(x => x.textContent));
  // 철수: 목표 점수에 닿으면 차례가 이어지고 버튼이 마무리로 바뀜
  await p.click('#scHit'); await p.click('#scHit');
  assert.deepEqual(await scores(), ['20', '0']);
  assert.equal(await p.textContent('#scHit'), '마무리 3쿠션 성공');
  assert.equal(await p.textContent('#scMiss'), '마무리 실패 · 차례 넘기기');
  assert.equal(await p.textContent('#scBoard .sc-p.on .badge'), '마무리 차례');
  await p.click('#scMiss');
  assert.equal(await p.textContent('#scHit'), '+10 득점');
  assert.equal(await p.textContent('#scBoard .badge.soft'), '마무리');
  // 영희: 득점 뒤 파울은 한 번 누르면 확인만, 두 번째에 −10하고 차례 넘김
  await p.click('#scHit');
  await p.click('#scFoul');
  assert.equal(await p.textContent('#scFoul'), '한 번 더 누르면 −10');
  assert.deepEqual(await scores(), ['20', '10']);
  await p.click('#scFoul');
  assert.deepEqual(await scores(), ['20', '0']);
  assert.equal(await p.textContent('#scFoul'), '파울 −10');
  assert.match(await p.textContent('#scInfo'), /2이닝 · 철수 차례/);
  // 되돌리기로 파울 취소
  await p.click('#scUndo');
  assert.deepEqual(await scores(), ['20', '10']);
  assert.match(await p.textContent('#scInfo'), /영희 차례/);
  // 확인 중에 다른 버튼을 누르면 파울 확인은 풀림
  await p.click('#scFoul'); await p.click('#scMiss');
  assert.equal(await p.textContent('#scFoul'), '파울 −10');
  await p.click('#scFoul');
  assert.deepEqual(await scores(), ['20', '10']);
  await p.click('#scFoul'); assert.deepEqual(await scores(), ['10', '10']);
  // 철수 차례가 영희에게 넘어감 → 영희 공타 → 철수 득점 두 번 → 마무리 성공
  await p.click('#scMiss');
  await p.click('#scHit'); assert.equal(await p.textContent('#scHit'), '마무리 3쿠션 성공');
  await p.click('#scHit');
  assert.match(await p.textContent('#scMsg'), /마무리 성공! 같은 이닝을 끝까지/);
  await p.click('#scMiss');
  assert.match(await p.textContent('#scMsg'), /경기 끝 · 철수 승/);
  assert.equal(await p.isVisible('#scFoul'), false);
  const rec = JSON.parse(await p.evaluate(() => localStorage.getItem('cue3-history')))[0];
  assert.deepEqual(rec.r, { fin: true, foul: true });
  assert.match(await p.textContent('#scHist'), /4구·마무리/);
  // 다시 읽어도 룰 표시가 남음(정리 함수가 버리지 않음)
  await p.reload(); await p.waitForSelector('#scHist table');
  assert.match(await p.textContent('#scHist'), /4구·마무리/);
  // 3쿠션으로 돌아가면 옵션은 숨고, 경기에도 들어가지 않음
  await p.click('#scNew');
  await p.click('#scType [data-v="3c"]');
  assert.equal(await p.isVisible('#scOptFin'), false);
  await p.click('#scStart');
  assert.equal(await p.isVisible('#scFoul'), false);
  assert.equal(await p.textContent('#scHit'), '+1 득점');
  noErr(p); await p.context().close();
});
test('E2E 71: 파이브앤하프 그림 — 코너 50이면 굴린 길과 앱 계산, 다른 수구는 안내만, 시스템 표로 보기', async () => {
  const p = await open({ hash: '#tips', noWait: true, w: 360 });
  await p.fill('#fhCue', '50'); await p.fill('#fhArr', '20');
  assert.equal(await p.textContent('#fhOut'), '30');
  const pts = await p.$eval('#fhSvg polyline.fh-path', e => e.getAttribute('points').trim().split(/\s+/).map(s => s.split(',').map(Number)));
  assert.equal(pts.length, 4); // 수구 → 1·2·3쿠션
  assert.ok(pts[1][1] < pts[0][1] && pts[3][1] > pts[2][1], JSON.stringify(pts)); // 위 장쿠션 갔다가 아래 장쿠션으로
  const m = (await p.textContent('#fhApp')).match(/^앱 계산: 코너 50 → 30 겨냥 → 3쿠션 (\d+) \(시스템 20\)$/);
  assert.ok(m && +m[1] >= 14 && +m[1] <= 26, await p.textContent('#fhApp'));
  // 위·아래 장쿠션 숫자와 코너 표시
  const txt = await p.$$eval('#fhSvg text', e => e.map(x => x.textContent));
  for (const w of ['1쿠션 수', '3쿠션 수', '수구 수', '(코너=50)']) assert.ok(txt.includes(w), w);
  assert.equal(txt.filter(t => t === '80').length, 2);
  // 다른 수구 값이면 길은 그리지 않고 안내
  await p.fill('#fhCue', '45');
  assert.equal(await p.$$eval('#fhSvg polyline', e => e.length), 0);
  assert.equal(await p.textContent('#fhApp'), '그림 경로는 코너 50일 때만 계산해요');
  // 내 수구 자리로 시스템 표
  await p.click('#fhSys');
  assert.equal(await p.isVisible('#tabFind'), true); assert.equal(await p.isVisible('#tabTips'), false);
  assert.equal(await p.getAttribute('#mSys', 'aria-pressed'), 'true');
  assert.equal(await p.isVisible('#sysPanel'), true);
  assert.equal(await p.$$eval('#sysTable tr[data-k]', e => e.length), 17);
  noErr(p); await p.context().close();
});
