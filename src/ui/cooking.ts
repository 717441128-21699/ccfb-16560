import { COCOON_TYPES } from '../engine/cocoon';
import type { EngineSnapshot, PotSnapshot } from '../engine/types';
import { drawPanelTitle, fmtClock, HitRegion, roundRect } from './drawutil';

function cookStatus(c: PotSnapshot['cocoons'][number]): { text: string; color: string } {
  if (c.ready) return { text: '熟茧可添', color: '#9fc27a' };
  if (c.overcooked) return { text: '过熟！', color: '#c85a4a' };
  if (c.trimmed) return { text: '已理绪', color: '#e8c270' };
  if (c.brushed) return { text: '已索绪', color: '#d9c041' };
  if (c.cook < 0.82) return { text: '生煮中', color: '#a89578' };
  return { text: '待索绪', color: '#7fb8c9' };
}

export function drawCooking(
  ctx: CanvasRenderingContext2D,
  s: EngineSnapshot,
  w: number,
  h: number,
  regions: HitRegion[],
): void {
  ctx.clearRect(0, 0, w, h);
  drawPanelTitle(ctx, `煮茧车间 · ${fmtClock(s.gameTime)}（熟茧库存 ${s.readyCocoons} 粒）`, w);

  ctx.font = '12.5px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#a89578';
  ctx.textAlign = 'left';
  ctx.fillText(
    '工艺要点：92℃ 标准水温约 7 游戏分钟煮透；欠熟（煮熟度 < 0.82）索绪不动只出废丝；过熟（> 1.08）茧层溃散、废丝与断头增多。先索绪找丝头，再理绪剥乱丝，完成后茧才进入熟茧库存。',
    18,
    60,
  );

  const cols = 3;
  const cardW = (w - 36 - 20 * (cols - 1)) / cols;
  const cardH = 250;
  const top = 84;

  s.pots.forEach((pot, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 18 + col * (cardW + 20);
    const y = top + row * (cardH + 70);

    roundRect(ctx, x, y, cardW, cardH, 8);
    ctx.fillStyle = '#2a2118';
    ctx.fill();
    ctx.strokeStyle = '#4a3a28';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 标题行
    ctx.fillStyle = '#e8c270';
    ctx.font = '600 14px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`煮茧锅 ${idx + 1}`, x + 14, y + 24);
    ctx.fillStyle = pot.temperature > 96 ? '#e89a8e' : '#7fb8c9';
    ctx.textAlign = 'right';
    ctx.fillText(`${pot.temperature.toFixed(0)}℃ / 目标 ${pot.targetTemp}℃`, x + cardW - 14, y + 24);

    // 锅体（剖面）
    const potBodyY = y + 38;
    const bodyW = cardW - 28;
    ctx.fillStyle = '#3a2d1e';
    roundRect(ctx, x + 14, potBodyY, bodyW, 78, 10);
    ctx.fill();
    // 水面
    const waterH = 56 + Math.sin(s.gameTime / 300 + idx) * 2;
    ctx.fillStyle = 'rgba(93,143,160,0.55)';
    roundRect(ctx, x + 18, potBodyY + 70 - waterH, bodyW - 8, waterH, 8);
    ctx.fill();
    // 茧（最多画 24 个示意点）
    const shown = pot.cocoons.slice(0, 24);
    shown.forEach((c, i) => {
      const px = x + 28 + (i % 12) * ((bodyW - 28) / 12);
      const py = potBodyY + 22 + Math.floor(i / 12) * 22 + Math.sin(s.gameTime / 200 + i) * 1.5;
      const st = cookStatus(c);
      ctx.fillStyle = c.overcooked ? '#b08a5a' : st.color === '#9fc27a' ? '#e8d9a8' : '#d8c490';
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      if (c.ready) {
        ctx.strokeStyle = '#9fc27a';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    });
    if (pot.cocoons.length === 0) {
      ctx.fillStyle = '#7a6a55';
      ctx.textAlign = 'center';
      ctx.fillText('空锅', x + cardW / 2, potBodyY + 44);
    } else if (pot.cocoons.length > 24) {
      ctx.fillStyle = '#a89578';
      ctx.textAlign = 'right';
      ctx.fillText(`…共 ${pot.cocoons.length} 粒`, x + cardW - 22, potBodyY + 20);
    }

    // 煮熟度分布条
    const barY = y + 128;
    ctx.textAlign = 'left';
    ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#a89578';
    ctx.fillText('煮熟度（欠熟 ← → 过熟）', x + 14, barY);
    const barX = x + 14;
    const barW = cardW - 28;
    ctx.fillStyle = '#1c1712';
    ctx.fillRect(barX, barY + 6, barW, 8);
    // 适宜区间 0.82~1.08
    const goodX = barX + barW * 0.62;
    const goodW = barW * (1.08 - 0.82) / 1.3;
    ctx.fillStyle = 'rgba(127,174,90,0.35)';
    ctx.fillRect(goodX, barY + 6, goodW, 8);
    const avgCook = pot.cocoons.length
      ? pot.cocoons.reduce((a, c) => a + Math.min(1.3, c.cook), 0) / pot.cocoons.length
      : 0;
    ctx.fillStyle = avgCook > 1.08 ? '#c85a4a' : avgCook >= 0.82 ? '#9fc27a' : '#d9c041';
    ctx.fillRect(barX + barW * (avgCook / 1.3) - 2, barY + 4, 4, 12);

    // 状态统计
    const ready = pot.readyCount;
    const brushed = pot.cocoons.filter((c) => c.brushed && !c.trimmed).length;
    const over = pot.cocoons.filter((c) => c.overcooked).length;
    ctx.fillStyle = '#a89578';
    ctx.font = '11.5px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(
      `在锅 ${pot.cocoons.length} 粒｜熟茧 ${ready}｜待理绪 ${brushed}｜过熟 ${over}｜废丝 ${pot.waste.toFixed(2)}g`,
      x + 14,
      y + 158,
    );

    // 控件：温度 +/-、装茧（三茧种）、索绪、理绪
    const btnY = y + 174;
    const bw = (cardW - 28 - 8 * 2) / 3;
    const mkBtn = (bx: number, label: string, action: string, primary = false) => {
      regions.push({ x: bx, y: btnY, w: bw, h: 28, action, payload: idx, label });
      roundRect(ctx, bx, btnY, bw, 28, 5);
      ctx.fillStyle = primary ? '#5a4322' : '#362a1d';
      ctx.fill();
      ctx.strokeStyle = primary ? '#d9a441' : '#4a3a28';
      ctx.stroke();
      ctx.fillStyle = primary ? '#e8c270' : '#e8dcc4';
      ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + bw / 2, btnY + 18);
    };
    mkBtn(x + 14, '降温 −5℃', 'tempDown');
    mkBtn(x + 14 + bw + 8, '升温 +5℃', 'tempUp', true);
    mkBtn(x + 14 + 2 * (bw + 8), '索绪（刷）', 'brush');
    const btn2Y = btnY + 36;
    const bw2 = (cardW - 28 - 8) / 2;
    regions.push({ x: x + 14, y: btn2Y, w: bw2, h: 28, action: 'trim', payload: idx });
    roundRect(ctx, x + 14, btn2Y, bw2, 28, 5);
    ctx.fillStyle = '#362a1d';
    ctx.strokeStyle = '#4a3a28';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8dcc4';
    ctx.textAlign = 'center';
    ctx.fillText('理绪（剥乱丝）', x + 14 + bw2 / 2, btn2Y + 18);
    regions.push({ x: x + 22 + bw2, y: btn2Y, w: bw2, h: 28, action: 'loadMenu', payload: idx });
    roundRect(ctx, x + 22 + bw2, btn2Y, bw2, 28, 5);
    ctx.fillStyle = '#5a4322';
    ctx.fill();
    ctx.strokeStyle = '#d9a441';
    ctx.stroke();
    ctx.fillStyle = '#e8c270';
    ctx.fillText('装生茧 ▾', x + 22 + bw2 * 1.5, btn2Y + 18);
  });

  // 茧种图例
  ctx.textAlign = 'left';
  ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
  let lx = 18;
  const ly = h - 52;
  COCOON_TYPES.forEach((t) => {
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(lx + 6, ly - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a89578';
    ctx.fillText(`${t.name}（丝长 ${t.filamentLength}m · 均值 ${t.meanDenier}D · 定粒 ${t.targetCount}）`, lx + 16, ly);
    lx += ctx.measureText(`${t.name}（丝长 ${t.filamentLength}m · 均值 ${t.meanDenier}D · 定粒 ${t.targetCount}）`).width + 30;
  });
}
