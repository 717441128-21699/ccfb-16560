import type { EngineSnapshot, PayrollResult } from '../engine/types';
import { drawPanelTitle, fmtClock, HitRegion, roundRect, snapshotKpi } from './drawutil';

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  label: string,
  value: number,
  max: number,
  color: string,
  unit: string,
): void {
  ctx.fillStyle = '#a89578';
  ctx.font = '12.5px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y + 12);
  const bx = x + 110;
  const bw = w - 230;
  ctx.fillStyle = '#1c1712';
  ctx.fillRect(bx, y, bw, 16);
  ctx.fillStyle = color;
  ctx.fillRect(bx, y, bw * Math.min(1, value / max), 16);
  ctx.fillStyle = '#e8dcc4';
  ctx.textAlign = 'right';
  ctx.fillText(`${value.toFixed(1)}${unit}`, x + w, y + 12);
}

export function drawPayroll(
  ctx: CanvasRenderingContext2D,
  s: EngineSnapshot,
  w: number,
  h: number,
  payroll: PayrollResult | null,
  regions: HitRegion[],
): void {
  ctx.clearRect(0, 0, w, h);
  drawPanelTitle(ctx, `工钱结算 · ${fmtClock(s.gameTime)}（${s.dayOver ? '本班已结束' : '本班进行中，以下为实时预估'}）`, w);

  // 顶部 KPI
  const kpis = snapshotKpi(s);
  const kw = (w - 36) / kpis.length;
  kpis.forEach((k, i) => {
    const x = 18 + i * kw;
    ctx.fillStyle = '#a89578';
    ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(k.label, x, 64);
    ctx.fillStyle = k.color;
    ctx.font = '600 15px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(k.value, x, 84);
  });

  const colW = (w - 36 - 24) / 2;
  const top = 108;

  // 左：计件与质量
  const lx = 18;
  roundRect(ctx, lx, top, colW, h - top - 30, 8);
  ctx.fillStyle = '#241c13';
  ctx.fill();
  ctx.strokeStyle = '#4a3a28';
  ctx.stroke();
  ctx.fillStyle = '#e8c270';
  ctx.font = '600 15px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('一、产量与匀度', lx + 16, top + 28);

  bar(ctx, lx + 16, top + 52, colW - 32, '生丝产量', s.totalOutput, 2600, '#9fc27a', ' g');
  bar(ctx, lx + 16, top + 86, colW - 32, '废丝量', s.totalWaste, 120, '#c85a4a', ' g');
  bar(ctx, lx + 16, top + 120, colW - 32, '纤度CV（越低越匀）', s.denierCV * 100, 25, '#d9a441', '%');
  bar(ctx, lx + 16, top + 154, colW - 32, '偏细时间占比', s.thinRatio * 100, 40, '#d97f3a', '%');
  bar(ctx, lx + 16, top + 188, colW - 32, '断头次数', s.totalBreaks, 200, '#c85a4a', ' 次');
  bar(ctx, lx + 16, top + 222, colW - 32, '疙瘩数', s.totalSlubs, 120, '#d9a441', ' 个');

  ctx.fillStyle = '#a89578';
  ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left'; // 右栏工钱账用过 right 对齐，这里必须重置
  const gradeHint =
    s.denierCV < 0.06
      ? '匀度 AAA：曲线紧贴目标带，添绪接绪都很及时'
      : s.denierCV < 0.1
        ? '匀度 AA：整体匀净，少量添绪延迟'
        : s.denierCV < 0.15
          ? '匀度 A：合格线附近，偏细缺口偏多'
          : '匀度 B：忽粗忽细，定粒管理需要加强';
  ctx.textAlign = 'left';
  ctx.fillText(gradeHint, lx + 16, top + 268);
  ctx.fillStyle = '#7a6a55';
  ctx.fillText('添绪越慢，曲线“细腰”越深，CV 越高、工钱越低。', lx + 16, top + 290);

  // 右：工钱账
  const rx = lx + colW + 24;
  roundRect(ctx, rx, top, colW, h - top - 30, 8);
  ctx.fillStyle = '#241c13';
  ctx.fill();
  ctx.strokeStyle = '#4a3a28';
  ctx.stroke();
  ctx.fillStyle = '#e8c270';
  ctx.font = '600 15px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('二、工钱账（计件 + 质量奖 − 扣罚）', rx + 16, top + 28);

  // 实时预估：用当前快照现算一份（与结束时引擎口径一致）
  const p: PayrollResult = payroll ?? estimatePayroll(s);
  const lines: [string, number, string][] = [
    ['计件工资（0.08 元/克生丝）', p.pieceWage, 'pos'],
    ['匀度质量奖', p.qualityBonus, 'pos'],
    ['断头扣罚（1.2 元/次）', -p.breakPenalty, 'neg'],
    ['废丝扣罚（0.5 元/克）', -p.wastePenalty, 'neg'],
  ];
  ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
  lines.forEach(([label, val, kind], i) => {
    const yy = top + 64 + i * 34;
    ctx.fillStyle = '#a89578';
    ctx.textAlign = 'left';
    ctx.fillText(label, rx + 16, yy);
    ctx.fillStyle = kind === 'pos' ? '#9fc27a' : '#e89a8e';
    ctx.textAlign = 'right';
    ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(2)} 元`, rx + colW - 16, yy);
  });

  ctx.strokeStyle = '#4a3a28';
  ctx.beginPath();
  ctx.moveTo(rx + 16, top + 196);
  ctx.lineTo(rx + colW - 16, top + 196);
  ctx.stroke();

  ctx.fillStyle = '#a89578';
  ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`匀度评定：${p.grade}`, rx + 16, top + 226);
  ctx.fillText(`设备运转效率：${(p.efficiency * 100).toFixed(0)}%`, rx + 16, top + 252);

  ctx.fillStyle = '#e8c270';
  ctx.font = '600 16px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('本班应得工钱', rx + 16, top + 300);
  ctx.fillStyle = '#f2ead6';
  ctx.font = '700 30px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${p.totalWage.toFixed(2)} 元`, rx + colW - 16, top + 304);

  // 重新开班
  regions.push({ x: rx + 16, y: h - 92, w: colW - 32, h: 36, action: 'reset', label: '重新开班' });
  roundRect(ctx, rx + 16, h - 92, colW - 32, 36, 6);
  ctx.fillStyle = '#5a4322';
  ctx.fill();
  ctx.strokeStyle = '#d9a441';
  ctx.stroke();
  ctx.fillStyle = '#e8c270';
  ctx.font = '600 14px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(s.dayOver ? '重新开班（清零再来一个班）' : '本班未结束 · 重新开班', rx + 16 + (colW - 32) / 2, h - 69);
}

/** 与引擎 computePayroll 同口径的实时预估 */
function estimatePayroll(s: EngineSnapshot): PayrollResult {
  let grade: string;
  let qualityBonus: number;
  if (s.denierCV < 0.06) {
    grade = 'AAA（优等匀度）';
    qualityBonus = 120;
  } else if (s.denierCV < 0.1) {
    grade = 'AA（良好）';
    qualityBonus = 70;
  } else if (s.denierCV < 0.15) {
    grade = 'A（合格）';
    qualityBonus = 25;
  } else {
    grade = 'B（匀度不合格）';
    qualityBonus = 0;
  }
  const pieceWage = s.totalOutput * 0.08;
  const breakPenalty = s.totalBreaks * 1.2;
  const wastePenalty = s.totalWaste * 0.5;
  const totalWage = Math.max(0, pieceWage + qualityBonus - breakPenalty - wastePenalty);
  return {
    outputMass: s.totalOutput,
    wasteMass: s.totalWaste,
    breaks: s.totalBreaks,
    slubs: s.totalSlubs,
    meanDenier: s.meanDenier,
    cv: s.denierCV,
    thinRatio: s.thinRatio,
    efficiency: s.activeEnds / 40,
    grade,
    pieceWage,
    qualityBonus,
    breakPenalty,
    wastePenalty,
    totalWage,
  };
}
