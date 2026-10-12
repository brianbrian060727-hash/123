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
  if (!opts.noWait) await p.waitForSelector('.chip', { timeout: 30000 });
  return p;
}
const noErr = p => assert.deepEqual(p.errors, []);

test('E2E 1: 첫 화면에 추천 길과 길 이름이 뜨고 오류 없음', async () => {
  const p = await open();
  const t = await p.$$eval('.chip .t', e => e.map(x => x.textContent));
  assert.ok(t.length >= 1 && t.every(x => x.length > 0));
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
