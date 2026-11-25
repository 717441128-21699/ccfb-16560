// 通过 Chrome DevTools Protocol 驱动 headless Edge，真实等待 rAF 渲染后截图
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5277';
const PORT = 9333;
const PAGES = ['workshop', 'cooking', 'monitor', 'payroll'];

const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\Users\\Administrator\\AppData\\Local\\Temp\\edge-cdp-profile',
  '--window-size=1600,950',
  'about:blank',
]);

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await res.json();
      return j.webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Edge CDP 未就绪');
}

const browserWs = await getWsUrl();
const ws = new WebSocket(browserWs);
await new Promise((r) => (ws.onopen = r));
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
};
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
function psend(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
await psend('Page.enable');
await psend('Runtime.enable');

mkdirSync('shots', { recursive: true });

async function evalJs(expr) {
  const r = await psend('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

for (const page of PAGES) {
  await psend('Page.navigate', { url: `${BASE}/#/${page}` });
  // 真实等待 4 秒，让 rAF 主循环与 Worker 快照充分运转
  await sleep(4000);
  const state = await evalJs(
    `(() => ({ ready: !!document.querySelector('canvas') && document.querySelector('canvas').width > 0, body: document.body.innerText.slice(0,60) }))()`,
  );
  const { data } = await psend('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`shots/${page}.png`, Buffer.from(data, 'base64'));
  console.log(page, JSON.stringify(state));
}

// 再跑久一点截一张车间运行态
await psend('Page.navigate', { url: `${BASE}/#/workshop` });
await sleep(10000);
const hud = await evalJs(`document.getElementById('hud-clock').textContent`);
const { data } = await psend('Page.captureScreenshot', { format: 'png' });
writeFileSync('shots/workshop-running.png', Buffer.from(data, 'base64'));
console.log('workshop-running HUD:', hud);

edge.kill();
process.exit(0);
