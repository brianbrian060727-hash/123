// index.html 안의 스크립트를 노드에서 불러오기
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m => ({ attrs: m[1], src: m[2] }));
function load(pred) {
  const s = scripts.find(pred);
  const mod = { exports: {} };
  vm.runInNewContext(s.src, { module: mod, Math, Float64Array, Float32Array, Uint8Array, Uint8ClampedArray, Infinity, Map, JSON, String, Number, Array, Object, Error });
  return mod.exports;
}
module.exports = {
  html,
  Engine: load(s => /id="engine-src"/.test(s.attrs)),
  Vision: load(s => /const Vision =/.test(s.src)),
  Core: load(s => /id="core-src"/.test(s.attrs))
};
