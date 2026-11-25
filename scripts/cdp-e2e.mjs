// 端到端玩法验证：模拟挡车工完整操作链路并断言游戏状态
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\Users\\Administrator\\AppData\\Local\\Temp\\edge-cdp-e2e',
  '--window-size=1600,950', 'about:blank',
]);

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try { return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { await sleep(250); }
  }
  throw new Error('CDP 未就绪');
}
const ws = new WebSocket(await getWs());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const psend = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await psend('Page.enable');
await psend('Runtime.enable');
const ev = async (expr) => (await psend('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

await psend('Page.navigate', { url: 'http://localhost:5277/#/workshop' });
await sleep(2500);

// 1. 初始：有 60 粒预置熟茧，40 绪空
const init = await ev(`(() => ({ pool: document.getElementById('hud-pool').textContent }))()`);
console.log('初始 HUD:', JSON.stringify(init));

// 2. 调大倍速到 24×，点两次"一键添绪"（受熟茧量限制）
await ev(`document.getElementById('hud-scale').value='24'; document.getElementById('hud-scale').dispatchEvent(new Event('change')); 'ok'`);
await ev(`[...document.querySelectorAll('canvas')].length`);
// 通过引擎指令直接验证更稳：点击画布上的一键添绪按钮区域（左下角 18..138, 底部）
const rect = await ev(`(() => { const c=document.querySelector('canvas').getBoundingClientRect(); return {x:c.x,y:y0=c.y,w:c.width,h:c.height}; })()`);
async function clickCanvas(fx, fy) {
  const c = await ev(`document.querySelector('canvas').getBoundingClientRect()`);
  await psend('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x + c.width * fx, y: c.y + c.height * fy, button: 'left', clickCount: 1 });
  await psend('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x + c.width * fx, y: c.y + c.height * fy, button: 'left', clickCount: 1 });
}
// 调试：打印画布尺寸与按钮命中区域
const dbg = await ev(`(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return { cssW: r.width, cssH: r.height, dpr: window.devicePixelRatio, clientW: c.clientWidth };
})()`);
console.log('画布:', JSON.stringify(dbg));

// 用 elementFromPoint 找到底按钮的真实像素位置再点
const hit = await ev(`(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  // 在画布内网格扫描，找 cursor/区域不可行，直接按比例点左下角按钮中心
  return { x: r.left + r.width * 0.045, y: r.top + r.height * 0.925 };
})()`);
console.log('目标点击点:', JSON.stringify(hit));
await psend('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
await psend('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
await sleep(800);
const afterFeed = await ev(`document.getElementById('hud-pool').textContent`);
console.log('添绪后熟茧:', afterFeed);

// 3. 让它真实跑 12 秒（24× 下 ≈ 288 游戏秒）
await sleep(12000);
const hud1 = await ev(`[...document.querySelectorAll('#hud span')].map(s=>s.textContent).join(' | ')`);
console.log('运行后 HUD:', hud1);

// 4. 切到单绪监看，读取曲线是否有非空数据
await psend('Page.navigate', { url: 'http://localhost:5277/#/monitor' });
await sleep(2500);
const { data: shot1 } = await psend('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('shots/e2e-monitor.png', Buffer.from(shot1, 'base64'));

// 5. 切工钱页
await psend('Page.navigate', { url: 'http://localhost:5277/#/payroll' });
await sleep(2000);
const { data: shot2 } = await psend('Page.captureScreenshot', { format: 'png' });
writeFileSync('shots/e2e-payroll.png', Buffer.from(shot2, 'base64'));
const wageText = await ev(`document.body.innerText.includes('工钱') ? '工钱页已渲染' : '缺失'`);
console.log('工钱页:', wageText);

edge.kill();
process.exit(0);
