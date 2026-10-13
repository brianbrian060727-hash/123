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
  await p.fill('#scLimit', '2'); await p.click('#scStart');
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
  await p.click('#scClockSeg [data-v="30"]'); await p.click('#scStart');
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
  await p.click('#scCopy');
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /선수 A {2}1\/20점/);
  await p.click('#scBig'); assert.equal(await p.isVisible('.tabs'), true);
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
  await p.check('#scTeam');
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
  await p.click('#scClockSeg [data-v="30"]');
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('1'); await t[1].fill('5');
  await p.click('#scStart'); await p.click('#scHit'); await p.click('#scMiss');
  assert.match(await p.textContent('#scMine'), /선수 A vs 선수 B/);
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
  const store = new Map(), subs = [];
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
  const doc = path => ({ id: path.split('/').pop(), path, get: async () => snapDoc(path),
    set: async d => { store.set(path, JSON.parse(JSON.stringify(d))); window.__writes = (window.__writes || 0) + 1; notify(); },
    update: async d => { store.set(path, Object.assign({}, store.get(path), d)); notify(); }, delete: async () => { store.delete(path); notify(); },
    onSnapshot(next) { const s = { fire: () => next(snapDoc(path)) }; subs.push(s); setTimeout(s.fire, 0); return () => {}; } });
  const db = { doc, collection: p => Object.assign(query(p), { path: p, doc: id => doc(p + '/' + (id || Math.random().toString(36).slice(2))) }) };
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
  await p.click('#scKeyLearn');
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
  assert.match(await q.textContent('#toast'), /백업 파일이 아니에요/);
  noErr(q); await q.context().close();
});
test('E2E 28: 클럽 기록 — 경기 끝나면 공유 기록에 올라가고 실시간 중계가 보임', async () => {
  const p = await openMock({ hash: '#score', noWait: true });
  await p.waitForSelector('#clubPanel:not([hidden])');
  assert.equal(await p.isVisible('#scLiveRow'), true);
  await p.check('#scLive');
  const t = await p.$$('#scPlayers input[data-k="target"]'); await t[0].fill('2'); await t[1].fill('2');
  await p.click('#scStart'); await p.click('#scHit');
  await p.waitForSelector('#clubLive .live-card');
  await p.click('#clubLive [data-watch]'); await p.waitForSelector('#clubWatch .sc-p');
  await p.click('#scHit'); await p.click('#scMiss');
  await p.waitForFunction(() => /선수 A/.test(document.querySelector('#clubStats').textContent));
  assert.match(await p.textContent('#clubHist'), /선수 A 승/);
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
