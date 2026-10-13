const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, Vision, Core } = require('./load');
const SC = Core.score;

// 재현 가능한 난수
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
function layout(table) {
  const t = Engine.TABLES[table], m = Engine.R * 2.5, out = [];
  while (out.length < 3) {
    const p = { x: m + rnd() * (t.W - 2 * m), y: m + rnd() * (t.H - 2 * m) };
    if (out.every(o => Math.hypot(o.x - p.x, o.y - p.y) > 0.2)) out.push(p);
  }
  return { table, cue: out[0], objs: [out[1], out[2]], decel: 0.15 };
}

// ---------- 엔진: 무작위 배치 20개 ----------
for (let k = 0; k < 20; k++) {
  const table = k % 4 === 3 ? 'jungdae' : 'daedae';
  const o = layout(table);
  test(`엔진 #${k + 1} (${table}) 추천 길은 다시 굴려도 득점`, () => {
    const r = Engine.solve(o, { N: 1600 });
    const C = Engine.makeCtx(o);
    for (const s of r.list) {
      const re = Engine.sim(C, s.theta, s.E, s.vk, true);
      assert.equal(re.success, true);
      assert.equal(re.sig, s.sig);
      assert.ok(re.cushions >= 3, 'cushions');
      assert.ok(s.V0 > 0 && s.V0 <= 7, 'V0');
      assert.ok(s.tolMM > 0, 'tol');
      assert.equal(s.pw, Engine.powerLevel(s.V0));
      // 실제 속도로 굴려도 2적구까지 감
      const rv = Engine.sim(C, s.theta, s.E, s.vk, true, s.V0 * 1.001);
      assert.equal(rv.success, true, 'reaches with V0');
    }
    for (let i = 1; i < r.list.length; i++) assert.ok(r.list[i - 1].score >= r.list[i].score, 'sorted');
  });
}

// ---------- 엔진: 물리 성질 ----------
test('엔진: 좌우 대칭 배치는 회전만 반대인 대칭 길', () => {
  const o = { table: 'daedae', cue: { x: 0.8, y: 0.7 }, objs: [{ x: 1.6, y: 0.4 }, { x: 2.2, y: 1.0 }] };
  const W = 2.844, mir = { table: 'daedae', cue: { x: W - 0.8, y: 0.7 }, objs: [{ x: W - 1.6, y: 0.4 }, { x: W - 2.2, y: 1.0 }] };
  const C1 = Engine.makeCtx(o), C2 = Engine.makeCtx(mir);
  for (const th of [0.3, 1.0, 2.0, -0.7]) {
    const a = Engine.sim(C1, th, 1, 0, true), b = Engine.sim(C2, Math.PI - th, -1, 0, true);
    assert.equal(a.success, b.success); assert.equal(a.cushions, b.cushions);
  }
});
test('엔진: 상하 대칭도 대칭 길', () => {
  const H = 1.422;
  const o = { table: 'daedae', cue: { x: 0.8, y: 0.5 }, objs: [{ x: 1.6, y: 0.3 }, { x: 2.2, y: 0.9 }] };
  const m = { table: 'daedae', cue: { x: 0.8, y: H - 0.5 }, objs: [{ x: 1.6, y: H - 0.3 }, { x: 2.2, y: H - 0.9 }] };
  const a = Engine.sim(Engine.makeCtx(o), 0.5, 2, 1, true), b = Engine.sim(Engine.makeCtx(m), -0.5, -2, 1, true);
  assert.equal(a.cushions, b.cushions); assert.equal(a.success, b.success);
});
test('엔진: 무회전으로 쿠션에 수직이면 반발계수만큼 되돌아옴', () => {
  const C = Engine.makeCtx({ table: 'daedae', cue: { x: 1.4, y: 0.7 }, objs: [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 1.2 }] });
  const r = Engine.sim(C, 0, 0, 2, true);
  assert.equal(r.evs[0].type, 'c'); assert.equal(r.evs[0].rail, 1);
  assert.ok(Math.abs(r.ratios[0] - Engine.P.eC) < 1e-9);
});
for (const th of [0.4, 2.6, -1.2]) test(`엔진: railHit 은 쿠션선 위 (θ=${th})`, () => {
  const C = Engine.makeCtx({ table: 'daedae', cue: { x: 1, y: 0.6 }, objs: [{ x: 2, y: 0.3 }, { x: 2.5, y: 1 }] });
  const h = Engine.railHit(C, th), R = Engine.R;
  const onRail = [Math.abs(h.y - R), Math.abs(h.x - (C.W - R)), Math.abs(h.y - (C.H - R)), Math.abs(h.x - R)][h.rail];
  assert.ok(onRail < 1e-9);
});
test('엔진: 느린 테이블일수록 필요한 힘이 큼', () => {
  const o = { table: 'daedae', cue: { x: 0.75, y: 0.95 }, objs: [{ x: 1.55, y: 0.62 }, { x: 2.35, y: 1.15 }] };
  const r = Engine.solve(o, { N: 1600 }); const s = r.list[0];
  const slow = Engine.needSpeed(s.rec, Engine.makeCtx({ ...o, decel: 0.2 })), fast = Engine.needSpeed(s.rec, Engine.makeCtx({ ...o, decel: 0.11 }));
  assert.ok(slow > fast);
});
test('엔진: 타임라인 끝 위치 = 경로 마지막 점', () => {
  const o = { table: 'daedae', cue: { x: 0.75, y: 0.95 }, objs: [{ x: 1.55, y: 0.62 }, { x: 2.35, y: 1.15 }] };
  const r = Engine.solve(o, { N: 1600 }); const s = r.list[0]; const C = Engine.makeCtx(o);
  const rk = Engine.riskCheck(C, s.rec, s.V0);
  const end = Engine.posAt(rk.cueTl, rk.cueTl.end + 1, C.a), last = s.rec.path[s.rec.path.length - 1];
  assert.ok(Math.hypot(end.x - last.x, end.y - last.y) < 1e-6);
});
test('엔진: 적구 맞는 시각은 수구 첫 구간 끝', () => {
  const o = { table: 'daedae', cue: { x: 0.75, y: 0.95 }, objs: [{ x: 1.55, y: 0.62 }, { x: 2.35, y: 1.15 }] };
  const r = Engine.solve(o, { N: 1600 }); const s = r.list.find(x => x.rec.evs[0].type === 'b');
  const C = Engine.makeCtx(o), rk = Engine.riskCheck(C, s.rec, s.V0);
  assert.ok(Math.abs(rk.tContact - rk.cueTl[0].t1) < 1e-12);
  const pc = Engine.posAt(rk.cueTl, rk.tContact, C.a);
  assert.ok(Math.hypot(pc.x - s.rec.contact.x, pc.y - s.rec.contact.y) < 1e-6);
});
test('엔진: 힘이 모자라면 short 로 멈춤', () => {
  const C = Engine.makeCtx({ table: 'daedae', cue: { x: 0.3, y: 0.7 }, objs: [{ x: 2.5, y: 0.2 }, { x: 2.5, y: 1.2 }] });
  const r = Engine.sim(C, 0, 0, 2, true, 0.3);
  assert.equal(r.reason, 'short');
});
test('엔진: 시그니처 해독은 쿠션·공 순서를 그대로', () => {
  const C = Engine.makeCtx({ table: 'daedae', cue: { x: 0.75, y: 0.95 }, objs: [{ x: 1.55, y: 0.62 }, { x: 2.35, y: 1.15 }] });
  const r = Engine.solve({ table: 'daedae', cue: { x: 0.75, y: 0.95 }, objs: [{ x: 1.55, y: 0.62 }, { x: 2.35, y: 1.15 }] }, { N: 1600 });
  const s = r.list[0], d = Engine.decodeSig(s.sig);
  const ev = s.rec.evs.filter(e => e.type !== 'b2').map(e => e.type === 'c' ? e.rail + 1 : 5 + e.idx);
  assert.equal(JSON.stringify(d), JSON.stringify(ev));
});

// ---------- 비전 ----------
for (const q of [[[10, 20], [310, 15], [300, 180], [5, 170]], [[50, 40], [600, 60], [620, 400], [30, 380]], [[0, 0], [100, 0], [100, 50], [0, 50]]]) {
  test(`비전: 호모그래피 왕복 ${q[0]}`, () => {
    const T = [[0, 0], [2.844, 0], [2.844, 1.422], [0, 1.422]];
    const H = Vision.homography(T, q), Hi = Vision.homography(q, T);
    for (const p of [[0.3, 0.2], [1.4, 0.7], [2.7, 1.3]]) {
      const a = Vision.apply(H, p[0], p[1]), b = Vision.apply(Hi, a[0], a[1]);
      assert.ok(Math.hypot(b[0] - p[0], b[1] - p[1]) < 1e-6);
    }
  });
}
test('비전: 가로로 긴 사진은 순서 그대로', () => {
  const q = [[0, 0], [200, 0], [200, 100], [0, 100]];
  assert.equal(JSON.stringify(Vision.tableCornerMap(q, 2.844, 1.422).img), JSON.stringify(q));
});
test('비전: 세로로 찍은 사진은 긴 변을 가로로 돌림', () => {
  const q = [[0, 0], [100, 0], [100, 200], [0, 200]];
  assert.equal(JSON.stringify(Vision.tableCornerMap(q, 2.844, 1.422).img), JSON.stringify([q[3], q[0], q[1], q[2]]));
});
function synth(w, h, balls, frame) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const inside = !frame || (x >= frame[0] && x < frame[2] && y >= frame[1] && y < frame[3]);
    let c = inside ? [33, 88, 184] : [74, 47, 30];
    for (const b of balls) if ((x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r) c = b.c;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}
for (const [k, pos] of [[1, { w: [200, 150], y: [600, 80], r: [420, 230] }], [2, { w: [80, 250], y: [820, 300], r: [450, 60] }], [3, { w: [450, 220], y: [480, 220], r: [100, 100] }]]) {
  test(`비전: 합성 사진에서 세 공 찾기 #${k}`, () => {
    const gw = 900, gh = 450, ppm = gw / 2.844, r = Engine.R * ppm;
    const im = synth(gw, gh, [{ x: pos.w[0], y: pos.w[1], r, c: [245, 243, 235] }, { x: pos.y[0], y: pos.y[1], r, c: [240, 189, 34] }, { x: pos.r[0], y: pos.r[1], r, c: [207, 36, 48] }]);
    const d = Vision.detectBalls(im, 2.844, 1.422, Engine.R);
    for (const [key, p] of [['white', pos.w], ['yellow', pos.y], ['red', pos.r]]) {
      assert.ok(d[key], key);
      assert.ok(Math.hypot(d[key].x - p[0] / ppm, d[key].y - p[1] / ppm) < 0.015, key + ' within 15mm');
    }
  });
}
test('비전: 합성 테이블 사진에서 천 모서리 찾기', () => {
  const im = synth(480, 320, [], [60, 50, 420, 270]);
  const a = Vision.autoCorners(im);
  assert.ok(a);
  const exp = [[60, 50], [419, 50], [419, 269], [60, 269]];
  a.quad.forEach((p, i) => assert.ok(Math.hypot(p[0] - exp[i][0], p[1] - exp[i][1]) < 3));
});
test('비전: 천이 없는 사진은 null', () => {
  const im = { width: 100, height: 80, data: new Uint8ClampedArray(100 * 80 * 4).fill(128) };
  assert.equal(Vision.autoCorners(im), null);
});
// 기울어진 천(가로 L, 세로 S, deg도 회전)과 실제 꼭짓점
function rotSynth(w, h, L, S, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = w / 2, cy = h / 2;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, u = dx * c + dy * s, v = -dx * s + dy * c;
    const col = Math.abs(u) <= L / 2 && Math.abs(v) <= S / 2 ? [33, 88, 184] : [74, 47, 30];
    const i = (y * w + x) * 4; data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = 255;
  }
  const corners = [[-L / 2, -S / 2], [L / 2, -S / 2], [L / 2, S / 2], [-L / 2, S / 2]].map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c]);
  return { im: { width: w, height: h, data }, corners };
}
const convex = q => {
  const cr = q.map((p, i) => { const b = q[(i + 1) % 4], c = q[(i + 2) % 4]; return Math.sign((b[0] - p[0]) * (c[1] - b[1]) - (b[1] - p[1]) * (c[0] - b[0])); });
  return cr.every(v => v === cr[0] && v !== 0);
};
// 결과 꼭짓점마다 가장 가까운 실제 꼭짓점까지의 거리 중 최댓값
const cornerErr = (q, real) => Math.max(...real.map(t => Math.min(...q.map(p => Math.hypot(p[0] - t[0], p[1] - t[1])))));
for (const deg of [45, 135]) test(`비전: ${deg}° 돌아간 천은 엉뚱한 사각형 대신 null이거나 맞는 볼록 사각형`, () => {
  const { im, corners } = rotSynth(480, 360, 300, 150, deg);
  const a = Vision.autoCorners(im);
  if (a) { assert.ok(convex(a.quad), JSON.stringify(a.quad)); assert.ok(cornerErr(a.quad, corners) < 20, JSON.stringify(a.quad)); }
});
test('비전: 조금 돌아간 천(10°·30°)은 그대로 찾음', () => {
  for (const deg of [10, 30]) {
    const { im, corners } = rotSynth(480, 360, 300, 150, deg);
    const a = Vision.autoCorners(im);
    assert.ok(a, String(deg));
    assert.ok(convex(a.quad) && cornerErr(a.quad, corners) < 6, `${deg}: ${JSON.stringify(a.quad)}`);
  }
});
test('비전: 꼭짓점이 셋뿐인 천(변 하나가 너무 짧음)은 null', () => {
  const w = 480, h = 360, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // (240,30)-(450,330)-(30,330) 삼각형
    const inside = y >= 30 && y <= 330 && Math.abs(x - 240) <= (y - 30) * 0.7;
    const col = inside ? [33, 88, 184] : [74, 47, 30];
    const i = (y * w + x) * 4; data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = 255;
  }
  assert.equal(Vision.autoCorners({ width: w, height: h, data }), null);
});
test('비전: 펴기 결과 크기와 불투명', () => {
  const src = synth(300, 200, [], null);
  const out = Vision.warp(src, [[10, 10], [290, 10], [290, 190], [10, 190]], 2.844, 1.422, 90, 45);
  assert.equal(out.width, 90); assert.equal(out.data.length, 90 * 45 * 4);
  for (let i = 3; i < out.data.length; i += 4) assert.equal(out.data[i], 255);
});

// ---------- 배치 코드 ----------
for (let k = 0; k < 5; k++) test(`배치 코드 왕복 #${k + 1}`, () => {
  const table = k % 2 ? 'jungdae' : 'daedae', o = layout(table), my = k % 3 ? 'white' : 'yellow';
  const balls = { white: o.cue, yellow: o.objs[0], red: o.objs[1] };
  const c = Core.encodeLayout(table, my, balls), d = Core.decodeLayout(c);
  assert.equal(d.table, table); assert.equal(d.myBall, my);
  for (const key of ['white', 'yellow', 'red']) assert.ok(Math.abs(d.balls[key].x - balls[key].x) <= 0.0005 && Math.abs(d.balls[key].y - balls[key].y) <= 0.0005);
  assert.equal(Core.encodeLayout(d.table, d.myBall, d.balls), c);
});
for (const bad of ['', 'hello', '3C-X-W-0001-0002-0003-0004-0005-0006', '3C-D-W-1-2-3-4-5-6']) test(`배치 코드: 잘못된 코드 거부 "${bad}"`, () => assert.equal(Core.decodeLayout(bad), null));
test('배치 코드: 소문자·앞뒤 글자 섞여도 읽음', () => {
  const d = Core.decodeLayout('이 배치 어떻게 쳐요? 3c-j-y-0500-0400-1000-0600-2000-0300 부탁');
  assert.equal(d.table, 'jungdae'); assert.equal(d.myBall, 'yellow'); assert.equal(d.balls.red.x, 2.0);
});
test('배치 코드: 테이블 밖 좌표는 안으로', () => {
  const d = Core.decodeLayout('3C-J-W-9999-9999-0000-0000-1000-0600');
  assert.ok(d.balls.white.x <= 2.540 - Engine.R + 1e-9 && d.balls.white.y <= 1.270 - Engine.R + 1e-9 && d.balls.yellow.x >= Engine.R);
});

// ---------- 길 이름 ----------
const ev = (...xs) => ({ evs: xs.map(x => typeof x === 'number' ? { type: 'c', rail: x } : { type: x }) });
for (const [rec, name] of [
  [ev('b', 2, 3, 0, 'b2'), '돌리기'], [ev('b', 0, 2, 1, 'b2'), '횡단샷'], [ev('b', 1, 2, 3, 'b2'), '대회전'],
  [ev('b', 3, 0, 1, 'b2'), '대회전'], [ev('b', 1, 2, 'b2'), '비껴치기'], [ev(2, 'b', 3, 0, 'b2'), '빈쿠션 1쿠션'],
  [ev(2, 3, 'b', 0, 'b2'), '빈쿠션 2쿠션'], [ev(2, 3, 0, 'b', 'b2'), '빈쿠션 3쿠션'],
  // 장·단이 번갈아야 대회전: 단-단-장, 장-단-단-장은 대회전이 아님
  [ev('b', 1, 1, 2, 'b2'), '비껴치기'], [ev('b', 0, 1, 1, 2, 'b2'), '쿠션 길'],
  [ev('b', 1, 2, 3, 0, 'b2'), '대회전'], [ev('b', 0, 1, 2, 3, 'b2'), '대회전'], [ev('b', 1, 0, 'b2'), '비껴치기'],
  [ev(0, 1, 2, 3, 'b', 'b2'), '빈쿠션 4쿠션']
]) test(`길 이름: ${name} (${rec.evs.map(e => e.type === 'c' ? e.rail : e.type).join(',')})`, () => assert.equal(Core.routeName(rec).name, name));

// ---------- 점수 규칙 ----------
const P = (...ts) => ts.map((t, i) => ({ name: 'P' + i, target: t }));
const play = (g, s) => { for (const c of s) c === 'h' ? SC.hit(g) : SC.miss(g); return g; };
test('점수: 혼자 연습은 목표 도달 즉시 끝', () => { const g = play(SC.create(P(3)), 'hhmh'); assert.ok(g.done); assert.equal(g.players[0].inn, 2); });
test('점수: 혼자 이닝 제한', () => { const g = play(SC.create(P(99), { limit: 3 }), 'hmmhm'); assert.ok(g.done); assert.equal(g.reason, 'limit'); assert.equal(g.players[0].inn, 3); assert.equal(g.players[0].score, 2); });
test('점수: 혼자 이닝마다 이닝 수 증가', () => { const g = play(SC.create(P(99)), 'mmmm'); assert.equal(g.players[0].inn, 5); assert.equal(g.round, 5); });
test('점수: 선구가 먼저 끝내면 후구에게 같은 이닝', () => { const g = play(SC.create(P(2, 2)), 'hh'); assert.ok(!g.done); assert.equal(g.turn, 1); assert.ok(g.closing); });
test('점수: 후구가 마지막 이닝에 못 따라오면 선구 승', () => { const g = play(SC.create(P(2, 2)), 'hhm'); assert.ok(g.done); assert.equal(SC.result(g), 'P0 승'); });
test('점수: 후구가 마지막 이닝에 따라오면 무승부', () => { const g = play(SC.create(P(2, 2)), 'hhhh'); assert.ok(g.done); assert.match(SC.result(g), /무승부/); });
test('점수: 후구가 먼저 끝내면 바로 끝', () => { const g = play(SC.create(P(5, 2)), 'mhh'); assert.ok(g.done); assert.equal(SC.result(g), 'P1 승'); assert.equal(g.players[0].inn, g.players[1].inn); });
test('점수: 3명 중 가운데가 끝내면 마지막 선수까지', () => {
  const g = play(SC.create(P(5, 1, 5)), 'mh'); assert.ok(!g.done); assert.equal(g.turn, 2);
  SC.miss(g); assert.ok(g.done); assert.equal(SC.result(g), 'P1 승');
});
test('점수: 3명 같은 이닝 수 보장', () => {
  const g = play(SC.create(P(1, 9, 9)), 'h'); assert.equal(g.turn, 1); play(g, 'mm'); assert.ok(g.done);
  assert.equal(JSON.stringify(g.players.map(p => p.inn)), '[1,1,1]');
});
test('점수: 6명까지, 7명째는 버림', () => { const g = SC.create(P(1, 1, 1, 1, 1, 1, 1)); assert.equal(g.players.length, 6); });
test('점수: 6명 한 바퀴 돌면 2이닝', () => { const g = play(SC.create(P(9, 9, 9, 9, 9, 9)), 'mmmmmm'); assert.equal(g.round, 2); assert.equal(g.turn, 0); assert.equal(g.players[0].inn, 2); });
test('점수: 다인 이닝 제한', () => { const g = play(SC.create(P(9, 9, 9), { limit: 2 }), 'mmmmmm'); assert.ok(g.done); assert.equal(g.reason, 'limit'); });
test('점수: 이닝 제한 끝나면 달성률 높은 사람 승 (핸디)', () => {
  const g = SC.create(P(10, 4), { limit: 1 }); play(g, 'hhhm' + 'hhm'); assert.ok(g.done); assert.equal(SC.result(g), 'P1 승');
});
test('점수: 하이런과 연속', () => { const g = play(SC.create(P(99, 99)), 'hhhm' + 'hm' + 'hhhhh'); assert.equal(g.players[0].high, 5); assert.equal(g.run, 5); });
test('점수: 에버리지 = 점수 ÷ 이닝', () => { const g = play(SC.create(P(99, 99)), 'hhm' + 'm' + 'hm' + 'm'); assert.equal(SC.avg(g.players[0]), 3 / 3); assert.equal(SC.avg(g.players[1]), 0); });
test('점수: 이닝별 기록 합 = 점수', () => {
  const g = SC.create(P(15, 15, 15)); let s = 7;
  for (let i = 0; i < 300 && !g.done; i++) { s = (s * 31 + 11) % 97; s % 3 ? SC.hit(g) : SC.miss(g); }
  for (const p of g.players) { assert.equal(p.log.reduce((a, b) => a + b, 0), p.score); assert.equal(p.log.length, p.inn); }
});
test('점수: 끝난 뒤 득점·공타 무시', () => { const g = play(SC.create(P(1)), 'h'); const j = JSON.stringify(g); play(g, 'hmhm'); assert.equal(JSON.stringify(g), j); });
test('점수: 목표·이름 기본값과 범위', () => {
  const g = SC.create([{ name: '  ', target: 'x' }, { name: '김', target: 9999 }, { name: 'a', target: -3 }]);
  assert.equal(g.players[0].name, '선수 1'); assert.equal(g.players[0].target, 20); assert.equal(g.players[1].target, 500); assert.equal(g.players[2].target, 1);
});
test('점수: 빈 선수 목록은 오류', () => assert.throws(() => SC.create([])));
test('점수: 첫 차례는 1이닝 시작 상태', () => { const g = SC.create(P(5, 5)); assert.equal(JSON.stringify(g.players.map(p => p.inn)), '[1,0]'); assert.equal(g.round, 1); });
test('점수: 순위는 달성 → 달성률 → 에버', () => {
  const g = play(SC.create(P(10, 10, 10), { limit: 1 }), 'hhm' + 'hhm' + 'hm');
  const st = SC.standings(g).map(s => s.i); assert.equal(st[2], 2);
});
test('길 이름: 빈쿠션 3쿠션 이상도 쿠션 순서를 함께 줌', () => {
  const r = Core.routeName(ev(2, 3, 0, 'b', 1, 'b2')); assert.equal(r.name, '빈쿠션 3쿠션'); assert.equal(r.seq, '단');
});
test('점수: 핸디 경기에서 달성률이 같으면 무승부 (점수가 많아도)', () => {
  const g = SC.create([{ name: 'A', target: 20 }, { name: 'B', target: 30 }], { limit: 1 });
  play(g, 'h'.repeat(10) + 'm' + 'h'.repeat(15) + 'm');
  assert.ok(g.done); assert.equal(g.players[0].score, 10); assert.equal(g.players[1].score, 15);
  assert.match(SC.result(g), /^무승부 \(/); assert.match(SC.result(g), /A/); assert.match(SC.result(g), /B/);
});
test('점수: 핸디 경기에서 달성률이 높으면 점수가 적어도 승', () => {
  const g = SC.create([{ name: 'A', target: 20 }, { name: 'B', target: 30 }], { limit: 1 });
  play(g, 'h'.repeat(11) + 'm' + 'h'.repeat(15) + 'm');
  assert.equal(SC.result(g), 'A 승'); assert.equal(SC.standings(g)[0].i, 0);
});
test('점수: 혼자 연습 결과 문구', () => { const g = play(SC.create(P(2)), 'hmh'); assert.match(SC.result(g), /목표 2점 달성 · 2이닝 · 에버 1\.000/); });
test('점수: 혼자 이닝 제한 결과 문구', () => { const g = play(SC.create(P(9), { limit: 2 }), 'hmm'); assert.match(SC.result(g), /2이닝 동안 1점/); });
test('점수: 진행 중 결과는 빈 문자열', () => assert.equal(SC.result(SC.create(P(3, 3))), ''));
test('점수: 무작위 1000경기 규칙 불변식', () => {
  let s = 1;
  for (let k = 0; k < 1000; k++) {
    const n = 1 + (k % 6), g = SC.create(Array.from({ length: n }, (_, i) => ({ name: 'p' + i, target: 1 + ((k + i) % 7) })), { limit: k % 5 === 0 ? 4 : 0 });
    for (let i = 0; i < 2000 && !g.done; i++) { s = (s * 1103515245 + 12345) % 2147483648; (s >> 8) % 3 ? SC.hit(g) : SC.miss(g); }
    assert.ok(g.done, 'finished');
    const inn = g.players.map(p => p.inn);
    assert.ok(Math.max(...inn) - Math.min(...inn) === 0, `equal innings ${inn}`);
    for (const p of g.players) assert.ok(p.score <= p.target);
  }
});

// ---------- 팀전 ----------
test('팀전: 팀원이 이닝마다 번갈아 침', () => {
  const g = SC.create([{ name: '철수, 영희', target: 9 }, { name: '민수·지은', target: 9 }], { team: true });
  assert.equal(SC.shooter(g.players[0]), '철수');
  play(g, 'mm'); assert.equal(SC.shooter(g.players[0]), '영희');
  play(g, 'mm'); assert.equal(SC.shooter(g.players[0]), '철수');
  assert.equal(SC.shooter(g.players[1]), '지은');
});
test('팀전: 개인전에서는 칠 사람 = 이름', () => { const g = SC.create(P(3, 3)); assert.equal(SC.shooter(g.players[1]), 'P1'); });
test('팀전: 팀원 이름이 없으면 팀 이름', () => { const g = SC.create([{ name: '', target: 3 }], { team: true }); assert.equal(SC.shooter(g.players[0]), '선수 1'); });

// ---------- 시스템 표 · 4구 ----------
test('시스템 표: 17칸(반 포인트), 위 장쿠션 겨냥은 1쿠션이 위', () => {
  const rows = Engine.sysTable({ table: 'daedae', cue: { x: 2.7, y: 1.3 }, objs: [{ x: 1, y: 1 }, { x: 2, y: 0.5 }] }, { rail: 2 });
  assert.equal(rows.length, 17);
  assert.ok(rows.filter(r => r.ok).length >= 5);
  for (const r of rows.filter(r => r.ok)) assert.ok(r.third.pt >= -0.01 && r.third.pt <= 8.01);
});
test('시스템 표: 코너(50)에서 1쿠션 3포인트 → 3쿠션 약 2포인트 (파이브앤하프 기준 샷)', () => {
  const rows = Engine.sysTable({ table: 'daedae', cue: { x: 2.75, y: 1.33 }, objs: [{ x: 1, y: 1 }, { x: 2, y: 0.5 }] }, { rail: 2, E: 2, auto: true });
  const r = rows.find(x => x.aim === 3);
  // 겨냥을 쿠션 지점에서 다이아몬드 줄로 바꾼 뒤 약 2.2 → 1.6으로 옮겨 감(범위 안)
  assert.ok(r.E < 0, '오른쪽 아래 코너에서 위 장쿠션 왼쪽을 겨냥하면 순회전은 왼쪽 당점');
  assert.ok(r.ok && r.third.rail === 0 && r.third.pt > 1.4 && r.third.pt < 2.6, JSON.stringify(r.third));
  const run = rows.filter(x => x.ok && x.third.rail === 0 && x.aim >= 1.5 && x.aim <= 3.5);
  for (let i = 1; i < run.length; i++) assert.ok(run[i].third.pt < run[i - 1].third.pt, 'monotonic');
});
test('시스템 표: 적구는 무시됨 (적구가 길을 막아도 쿠션 길)', () => {
  const rows = Engine.sysTable({ table: 'daedae', cue: { x: 1.4, y: 0.4 }, objs: [{ x: 1.4, y: 0.8 }, { x: 1.4, y: 1.1 }] }, { rail: 2 });
  assert.ok(rows[8].path.length >= 3);
});
test('4구: 한 번 득점에 10점, 목표에서 멈춤', () => {
  const g = SC.create([{ name: 'a', target: 30 }, { name: 'b', target: 30 }], { step: 10 });
  play(g, 'hh'); assert.equal(g.players[0].score, 20); assert.equal(g.players[0].high, 20);
  play(g, 'h'); assert.equal(g.players[0].score, 30); assert.equal(g.turn, 1);
});
test('4구: 목표를 넘는 득점은 기록·하이런에 넣지 않음', () => {
  const g = SC.create([{ name: 'a', target: 155 }, { name: 'b', target: 155 }], { step: 10 });
  play(g, 'h'.repeat(16));
  const p = g.players[0];
  assert.equal(p.score, 155); assert.equal(p.log[p.log.length - 1], 155); assert.equal(p.high, 155);
  assert.notEqual(p.high, 160); assert.equal(p.log.reduce((a, b) => a + b, 0), p.score); assert.equal(g.turn, 1);
});
test('4구: 목표 범위 5000까지', () => { const g = SC.create([{ name: 'a', target: 3000 }], { step: 10 }); assert.equal(g.players[0].target, 3000); });
test('4구: 혼자 연습 결과 문구의 에버는 소수 한 자리', () => { const g = play(SC.create([{ name: 'a', target: 20 }], { step: 10 }), 'hmh'); assert.match(SC.result(g), /목표 20점 달성 · 2이닝 · 에버 10\.0$/); });

// ---------- 4구 하우스 룰: 마무리 3쿠션 · 파울 ----------
const play4 = (g, s) => { for (const c of s) c === 'h' ? SC.hit(g) : c === 'f' ? SC.foul(g) : SC.miss(g); return g; };
test('4구 마무리: 목표에 닿아도 끝나지 않고 차례를 이어 마무리, 한 번 더 득점하면 끝', () => {
  const g = play4(SC.create([{ name: 'a', target: 30 }], { step: 10, finish3c: true }), 'hhh');
  const p = g.players[0];
  assert.ok(!g.done); assert.ok(p.fin); assert.ok(!g.closing); assert.equal(p.score, 30); assert.equal(g.turn, 0);
  assert.match(SC.result(play4(SC.create([{ name: 'a', target: 30 }], { step: 10, finish3c: true, limit: 1 }), 'hhhm')), /1이닝 동안 30점 \(마무리 전\)/);
  play4(g, 'h'); assert.ok(g.done); assert.equal(g.reason, 'target'); assert.equal(p.score, 30); assert.equal(p.high, 30);
  assert.match(SC.result(g), /목표 30점 달성 · 1이닝/);
});
test('4구 마무리: 실패하면 차례가 넘어가고, 다음 차례에 성공하면 같은 이닝 규칙', () => {
  const g = play4(SC.create(P(30, 30), { step: 10, finish3c: true }), 'hhhm');
  assert.equal(g.turn, 1); assert.ok(g.players[0].fin); assert.ok(!g.closing);
  play4(g, 'm'); assert.equal(g.turn, 0); assert.equal(g.round, 2);
  play4(g, 'h'); assert.ok(g.closing); assert.ok(!g.done); assert.equal(g.turn, 1); assert.ok(!g.players[0].fin);
  play4(g, 'm'); assert.ok(g.done); assert.equal(SC.result(g), 'P0 승');
});
test('4구 마무리: 둘 다 목표 점수여도 마무리에 성공한 사람이 승', () => {
  const g = play4(SC.create(P(10, 10), { step: 10, finish3c: true }), 'hm' + 'hh');
  assert.ok(g.done); assert.equal(g.players[0].score, 10); assert.ok(g.players[0].fin);
  assert.equal(SC.result(g), 'P1 승'); assert.equal(SC.standings(g)[0].i, 1);
});
test('4구 파울: 20점에서 10점이 되고 차례가 넘어감, 기록 합 = 점수', () => {
  const g = play4(SC.create(P(30, 30), { step: 10, foul: true }), 'hh');
  assert.equal(g.players[0].score, 20); assert.equal(g.turn, 0);
  SC.foul(g);
  const p = g.players[0];
  assert.equal(p.score, 10); assert.equal(g.turn, 1); assert.equal(p.log[0], 10); assert.equal(p.high, 20);
  play4(g, 'f'); assert.equal(g.players[1].score, 0); assert.equal(g.players[1].log[0], 0); assert.equal(g.turn, 0);
  for (const q of g.players) assert.equal(q.log.reduce((a, b) => a + b, 0), q.score);
});
test('4구 파울: 마무리 차례에 파울하면 목표 아래로 내려가 마무리가 풀림', () => {
  const g = play4(SC.create(P(20, 20), { step: 10, finish3c: true, foul: true }), 'hhf');
  assert.equal(g.players[0].score, 10); assert.ok(!g.players[0].fin); assert.equal(g.turn, 1);
  play4(g, 'm' + 'h'); assert.ok(g.players[0].fin); assert.ok(!g.done);
});
test('4구 하우스 룰은 3쿠션(1점 단위)에서는 꺼짐, 기본도 꺼짐', () => {
  const g = SC.create(P(3, 3), { finish3c: true, foul: true });
  assert.equal(g.finish3c, false); assert.equal(g.foulOn, false);
  const g4 = SC.create(P(30, 30), { step: 10 });
  assert.equal(g4.finish3c, false); assert.equal(g4.foulOn, false);
  play4(g4, 'hhh'); assert.ok(g4.closing); assert.equal(g4.turn, 1);
});
test('4구 하우스 룰: 무작위 500경기 규칙 불변식', () => {
  let s = 7;
  for (let k = 0; k < 500; k++) {
    const n = 1 + (k % 6), g = SC.create(Array.from({ length: n }, (_, i) => ({ name: 'p' + i, target: 10 * (1 + ((k + i) % 6)) })), { step: 10, finish3c: k % 3 !== 1, foul: k % 3 !== 2, limit: k % 5 === 0 ? 4 : 0 });
    for (let i = 0; i < 20000 && !g.done; i++) { s = (s * 1103515245 + 12345) % 2147483648; const r = (s >> 8) % 6; r < 3 ? SC.hit(g) : r < 5 || !g.foulOn ? SC.miss(g) : SC.foul(g); }
    assert.ok(g.done, 'finished');
    const inn = g.players.map(p => p.inn);
    assert.ok(Math.max(...inn) - Math.min(...inn) === 0, `equal innings ${inn}`);
    for (const p of g.players) {
      assert.ok(p.score >= 0 && p.score <= p.target);
      assert.equal(p.log.reduce((a, b) => a + b, 0), p.score); assert.equal(p.log.length, p.inn);
    }
    if (g.reason === 'target') assert.ok(g.players.some(p => p.score >= p.target && (!g.finish3c || p.made)));
  }
});

test('시스템 표: 순회전은 겨냥 방향에 따라 당점 좌우가 바뀜', () => {
  const rows = Engine.sysTable({ table: 'daedae', cue: { x: 1.4, y: 1.0 }, objs: [{ x: 1, y: 1 }, { x: 2, y: 0.5 }] }, { rail: 2, E: 2, auto: true });
  assert.ok(rows[2].E < 0 && rows[14].E > 0);
  const flip = Engine.sysTable({ table: 'daedae', cue: { x: 1.4, y: 1.0 }, objs: [{ x: 1, y: 1 }, { x: 2, y: 0.5 }] }, { rail: 2, E: 2, auto: true, flip: true });
  assert.ok(flip[2].E > 0 && flip[14].E < 0);
});

// ---------- 엔진 신뢰도: 붙은 공 · 미스큐 · 다이아몬드 · 쿠션 반발 · 순회전 ----------
const DH = Engine.TABLES.daedae.H, DW = Engine.TABLES.daedae.W, BR = Engine.R;
const solved = new Map();
function solveOnce(o) {
  const k = JSON.stringify(o);
  if (!solved.has(k)) solved.set(k, Engine.solve(o, { N: 1600 }));
  return solved.get(k);
}
// 화면 좌표(y 아래쪽)로 쿠션에 딱 붙은 수구: 아래·위·왼쪽 쿠션
const FROZEN = [
  { table: 'daedae', cue: { x: 1.0, y: DH - BR }, objs: [{ x: 1.6, y: 0.7 }, { x: 2.3, y: 0.4 }] },
  { table: 'daedae', cue: { x: 0.5, y: BR }, objs: [{ x: 1.6, y: 0.7 }, { x: 2.3, y: 0.4 }] },
  { table: 'daedae', cue: { x: BR, y: 0.6 }, objs: [{ x: 1.2, y: 0.5 }, { x: 2.0, y: 1.0 }] }
];
test('엔진: 쿠션에 붙은 수구는 그 쿠션으로 0mm 1쿠션을 만들지 않음', () => {
  for (const o of FROZEN) {
    const r = solveOnce(o);
    assert.ok(r.list.length > 0, '길이 하나는 있어야 함');
    for (const s of r.list) {
      assert.ok(!(s.rec.evs[0].type === 'c' && s.rec.segLens[0] < 0.004), JSON.stringify(s.rec.evs[0]));
    }
  }
  // 붙은 쿠션 쪽으로 곧장 치면 frozen
  const C = Engine.makeCtx(FROZEN[0]);
  const rec = Engine.sim(C, -Math.PI / 2, 0, 2, true);
  assert.equal(rec.success, false); assert.equal(rec.reason, 'frozen');
  assert.equal(Engine.sim(C, -Math.PI / 3, 1, 1, false), 0);
});
test('엔진: 미스큐 당점(±3팁+상단/하단)은 추천하지 않음', () => {
  assert.equal(Engine.TIPMAX, 0.62);
  const top = Engine.VERT.findIndex(v => v.key === 'top'), low = Engine.VERT.findIndex(v => v.key === 'low');
  const midtop = Engine.VERT.findIndex(v => v.key === 'midtop');
  for (const E of [-3, 3]) { assert.ok(!Engine.tipOK(E, top)); assert.ok(!Engine.tipOK(E, low)); assert.ok(Engine.tipOK(E, midtop)); }
  assert.ok(Engine.tipOK(2, top) && Engine.tipOK(-2, low) && Engine.tipOK(0, top));
  seed = 777;
  const layouts = [layout('daedae'), layout('daedae'), layout('jungdae'), ...FROZEN];
  for (const o of layouts) {
    for (const s of solveOnce(o).list) {
      assert.ok(Engine.tipOK(s.E, s.vk), `E ${s.E} vk ${s.vk}`);
      assert.ok(s.tolMM >= 1, 'tol ≥ 1mm');
      assert.ok(s.ease > 0 && s.ease <= s.width / 1.2 + 1e-9 && s.ease <= s.tolMM / 14 + 1e-9, 'ease');
    }
  }
});
test('엔진: 다이아몬드 겨냥점은 쿠션 지점보다 바깥 다이아몬드 줄', () => {
  const C = Engine.makeCtx({ table: 'daedae', cue: { x: 1.0, y: DH - 0.5 }, objs: [{ x: 2, y: 1 }, { x: 2.5, y: 1 }] });
  const th = 1.2, dh = Engine.diamondHit(C, th), rh = Engine.railHit(C, th);
  assert.equal(dh.rail, 2); assert.equal(rh.rail, 2);
  assert.equal(dh.y, C.H);
  assert.ok(dh.x - C.cue.x > rh.x - C.cue.x + 0.01, `${dh.x} vs ${rh.x}`);
  assert.ok(Math.abs(dh.x - (C.cue.x + (C.H + Engine.DIA - C.cue.y) / Math.tan(th))) < 1e-9);
  // 코너 근처: 쿠션은 위 장쿠션에 닿아도 다이아몬드 줄은 오른쪽 단쿠션에 먼저 걸림
  const p = { x: DW - BR - 0.01, y: DH - BR }, th2 = Math.atan2(p.y - C.cue.y, p.x - C.cue.x);
  const C2 = Object.assign({}, C, { cue: { x: p.x - 2 * 0.3, y: p.y - 0.3 } });
  assert.equal(Engine.railHit(C2, th2).rail, 2);
  const d2 = Engine.diamondHit(C2, th2);
  assert.equal(d2.rail, 1); assert.equal(d2.x, DW); assert.ok(d2.y >= 0 && d2.y <= DH);
  // 앱이 다이아몬드를 그리는 자리와 같은 값
  const m = require('./load').html.match(/const RAILV = ([\d.]+), CUSH = ([\d.]+);/);
  assert.ok(m && Math.abs((+m[1] + +m[2]) / 2 + 0.005 - Engine.DIA) < 1e-9);
});
test('엔진: 쿠션 반발계수(eC)를 바꾸면 같은 샷의 3쿠션 지점이 달라짐', () => {
  const o = { table: 'daedae', cue: { x: 2.6, y: 1.2 }, objs: [{ x: -5, y: -5 }, { x: -6, y: -6 }] };
  assert.equal(Engine.makeCtx(o).eC, Engine.P.eC);
  const third = eC => {
    const rec = Engine.sim(Engine.makeCtx(Object.assign({}, o, { eC })), 2.6, -2, 1, true);
    return rec.evs.filter(e => e.type === 'c')[2];
  };
  const a = third(0.7), b = third(0.9);
  assert.ok(a && b);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.02, `${JSON.stringify(a)} ${JSON.stringify(b)}`);
  // 적구 경로도 같은 값을 씀
  const ob = { x: 1.4, y: 0.7, vx: 0.6, vy: 0.8 };
  const p1 = Engine.objectPath(Engine.makeCtx(Object.assign({}, o, { eC: 0.7 })), ob, 3).pts;
  const p2 = Engine.objectPath(Engine.makeCtx(Object.assign({}, o, { eC: 0.9 })), ob, 3).pts;
  assert.ok(Math.hypot(p1[2].x - p2[2].x, p1[2].y - p2[2].y) > 0.01);
});
test('엔진: 순회전 기록은 당점 좌우를 바꾸면 뒤집힘', () => {
  const C = Engine.makeCtx({ table: 'daedae', cue: { x: 1.0, y: DH - 0.5 }, objs: [{ x: -5, y: -5 }, { x: -6, y: -6 }] });
  const first = (th, E) => Engine.sim(C, th, E, 1, true).evs[0];
  const r = first(1.0, 2), l = first(1.0, -2);
  assert.equal(r.type, 'c'); assert.equal(r.rail, 2); assert.equal(l.rail, 2);
  assert.equal(r.run, true); assert.equal(l.run, false);
  // 왼쪽으로 가는 길에서는 왼쪽 당점이 순회전
  assert.equal(first(Math.PI - 1.0, -2).run, true);
  assert.equal(first(Math.PI - 1.0, 2).run, false);
});
test('시스템 표: 다이아몬드 줄을 겨냥하고 1쿠션 지점·모양·실패 사유를 줌', () => {
  const o = { table: 'daedae', cue: { x: 2.75, y: 1.33 }, objs: [{ x: 1, y: 1 }, { x: 2, y: 0.5 }] };
  const C = Engine.makeCtx(o);
  const rows = Engine.sysTable(o, { rail: 2, E: 2, auto: true });
  for (const [k, r] of rows.entries()) {
    assert.ok(Math.abs(r.theta - Math.atan2(C.H + Engine.DIA - C.cue.y, k * C.W / 16 - C.cue.x)) < 1e-12);
    if (r.ok) { assert.equal(r.why, null); assert.equal(r.shape.split('-')[0], '장'); assert.ok(r.contact >= 0 && r.contact <= 8); }
    else assert.ok(['side', 'stop'].includes(r.why));
  }
  assert.equal(rows.find(x => x.aim === 3).shape, '장-단-장');
  // 수구가 위 장쿠션에 붙어 있으면 그 쿠션 겨냥은 전부 frozen
  const fz = Engine.sysTable({ table: 'daedae', cue: { x: 1.4, y: BR }, objs: o.objs }, { rail: 2, E: 2, auto: true });
  assert.ok(fz.every(r => !r.ok && r.why === 'frozen'));
});
