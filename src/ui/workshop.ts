import type { EngineSnapshot } from '../engine/types';
import {
  denierColor,
  drawPanelTitle,
  fmtClock,
  HitRegion,
  roundRect,
  snapshotKpi,
  statusColor,
} from './drawutil';

/** 缫丝车间页：一排 40 绪（两列布局），点击绪体添绪/接绪 */
export function drawWorkshop(
  ctx: CanvasRenderingContext2D,
  s: EngineSnapshot,
  w: number,
  h: number,
  regions: HitRegion[],
): void {
  ctx.clearRect(0, 0, w, h);
  drawPanelTitle(ctx, `缫丝车间 · ${fmtClock(s.gameTime)}（车速 ${s.speed.toFixed(1)} m/s）`, w);

  // 顶部 KPI 条
  const kpis = snapshotKpi(s);
  const kw = (w - 36) / kpis.length;
  ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
  kpis.forEach((k, i) => {
    const x = 18 + i * kw;
    ctx.fillStyle = '#a89578';
    ctx.textAlign = 'left';
    ctx.fillText(k.label, x, 62);
    ctx.fillStyle = k.color;
    ctx.font = '600 15px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(k.value, x, 82);
    ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
  });

  // 40 绪：2 行 × 20 列
  const cols = 20;
  const rows = 2;
  const top = 100;
  const bottom = h - 92;
  const cellW = (w - 36) / cols;
  const cellH = (bottom - top) / rows;

  s.ends.forEach((end, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 18 + col * cellW + 3;
    const y = top + row * cellH + 6;
    const ew = cellW - 6;
    const eh = cellH - 12;
    const color = statusColor(end.warnLevel, end.broken, end.idle);

    // 绪台背景
    roundRect(ctx, x, y, ew, eh, 6);
    ctx.fillStyle = '#2c2218';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = end.eventTimer > 0 ? 2.2 : 1.2;
    ctx.stroke();

    // 缫丝锅（热水）
    const potY = y + eh - 30;
    ctx.fillStyle = end.broken ? '#5a3a34' : '#4f7d8c';
    roundRect(ctx, x + 5, potY, ew - 10, 20, 4);
    ctx.fill();
    // 锅中茧粒
    ctx.fillStyle = '#e8d9a8';
    const visibleCocoons = Math.min(end.count, 9);
    for (let i = 0; i < visibleCocoons; i++) {
      ctx.beginPath();
      ctx.arc(x + 9 + i * ((ew - 18) / Math.max(1, visibleCocoons - 1 || 1)), potY + 11, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 丝道：锅 → 上方小䈅（丝片卷绕），粗细按当前纤度映射
    const reelY = y + 14;
    const denierW = end.denier > 0 ? Math.max(0.8, (end.denier / 22) * 3.2) : 0;
    if (!end.broken && end.count > 0) {
      ctx.strokeStyle = end.slubs ? '#e8c270' : '#f2ead6';
      ctx.lineWidth = denierW;
      ctx.beginPath();
      ctx.moveTo(x + ew / 2, potY);
      ctx.lineTo(x + ew / 2, reelY + 8);
      ctx.stroke();
      if (end.slubs) {
        // 疙瘩：丝道上的鼓包
        ctx.fillStyle = '#e8c270';
        ctx.beginPath();
        ctx.arc(x + ew / 2, reelY + 22, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (end.broken) {
      // 断头：断开的两截丝
      ctx.strokeStyle = '#c85a4a';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x + ew / 2, potY);
      ctx.lineTo(x + ew / 2, potY - 16);
      ctx.moveTo(x + ew / 2, reelY + 8);
      ctx.lineTo(x + ew / 2, reelY + 24);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 小䈅
    ctx.fillStyle = '#6b5638';
    ctx.beginPath();
    ctx.ellipse(x + ew / 2, reelY, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a7048';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 编号与纤度/粒数
    ctx.textAlign = 'center';
    ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#a89578';
    ctx.fillText(`${idx + 1}`, x + 6, y + 12);
    ctx.font = '600 11px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = denierColor(end.denier);
    ctx.fillText(end.broken ? '断头' : end.idle ? '空绪' : `${end.denier.toFixed(1)}D`, x + ew / 2, potY - 6);
    ctx.fillStyle = '#e8dcc4';
    ctx.fillText(`${end.count}粒`, x + ew / 2, potY - 19);

    regions.push({
      x,
      y,
      w: ew,
      h: eh,
      action: end.broken ? 'tie' : 'feed',
      payload: end.id,
      label: end.broken ? `接绪 #${end.id + 1}` : `添绪 #${end.id + 1}`,
    });
  });

  // 底部操作条与图例
  const by = h - 70;
  regions.push({ x: 18, y: by, w: 120, h: 34, action: 'feedAll', label: '一键添绪（不足绪）' });
  ctx.fillStyle = '#5a4322';
  roundRect(ctx, 18, by, 120, 34, 6);
  ctx.fill();
  ctx.strokeStyle = '#d9a441';
  ctx.stroke();
  ctx.fillStyle = '#e8c270';
  ctx.font = '600 13px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('一键添绪', 78, by + 21);

  ctx.textAlign = 'left';
  ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
  const legend: [string, string][] = [
    ['#7fae5a', '正常'],
    ['#d9c041', '注意（粒少）'],
    ['#d97f3a', '告警（偏细/茧将尽）'],
    ['#c85a4a', '断头（点击接绪）'],
  ];
  let lx = 160;
  for (const [c, t] of legend) {
    ctx.fillStyle = c;
    ctx.fillRect(lx, by + 8, 12, 12);
    ctx.fillStyle = '#a89578';
    ctx.fillText(t, lx + 17, by + 18);
    lx += ctx.measureText(t).width + 34;
  }

  // 最近事件流
  const recent = s.events.slice(0, 3);
  ctx.textAlign = 'right';
  ctx.font = '11.5px "PingFang SC","Microsoft YaHei",sans-serif';
  recent.forEach((ev, i) => {
    ctx.fillStyle = ev.kind === 'break' ? '#e89a8e' : ev.kind === 'feed' || ev.kind === 'tie' ? '#9fc27a' : '#d9c041';
    ctx.fillText(ev.message, w - 20, by + 14 + i * 17);
  });
}
