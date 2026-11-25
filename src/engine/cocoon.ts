import type { CocoonType } from './types';

/**
 * 茧种参数（本游戏虚构，但其纤度—茧层关系按公开测定的茧丝纤度曲线走势标定）。
 * 公开测定的典型走势（定粒缫丝工艺资料中的"茧丝纤度曲线"）：
 *   1. 最外层纤度略低，随即上升，在茧层约 10~20% 处达到最大值（外层膨大部）；
 *   2. 中段（20%~70%）近似线性缓慢变细；
 *   3. 进入内层后下降加快，至蛹衬附近纤度陡降，最内层仅为外层的 40~55%。
 * calib 为均值标定系数，模块加载时数值迭代求出，使全粒积分均值恰好等于 meanDenier。
 */
export interface CalibratedCocoonType extends CocoonType {
  calib: number;
}

const RAW_TYPES: CocoonType[] = [
  {
    id: 'spring',
    name: '春茧（多丝量品种）',
    filamentLength: 1350,
    meanDenier: 2.72,
    outerDenier: 2.8,
    peakDenier: 3.4,
    peakAt: 0.13,
    innerDropAt: 0.72,
    innerEndDenier: 1.5,
    cookMin: 0.82,
    cookMax: 1.08,
    // 92℃ 标准水温下约 6~7 游戏分钟煮熟（cook≈1.0）
    tempEfficiency: 0.0025,
    targetCount: 8,
    color: '#e8d9a8',
  },
  {
    id: 'summer',
    name: '夏秋茧（中丝量品种）',
    filamentLength: 1050,
    meanDenier: 2.28,
    outerDenier: 2.35,
    peakDenier: 2.85,
    peakAt: 0.15,
    innerDropAt: 0.7,
    innerEndDenier: 1.2,
    cookMin: 0.85,
    cookMax: 1.06,
    tempEfficiency: 0.0029,
    targetCount: 9,
    color: '#dcc98f',
  },
  {
    id: 'late',
    name: '晚秋茧（粗纤度品种）',
    filamentLength: 1200,
    meanDenier: 3.05,
    outerDenier: 3.15,
    peakDenier: 3.8,
    peakAt: 0.12,
    innerDropAt: 0.74,
    innerEndDenier: 1.7,
    cookMin: 0.8,
    cookMax: 1.1,
    tempEfficiency: 0.0023,
    targetCount: 7,
    color: '#f0e3bb',
  },
];

function baselineAt(type: CocoonType, x: number): number {
  return type.outerDenier + (type.innerEndDenier - type.outerDenier) * x;
}

/**
 * 茧丝瞬时纤度（旦尼尔），x = 已抽丝长 / 茧层总丝长 ∈ [0,1]。
 * 三项叠加：
 *   A. 线性基线：outerDenier → innerEndDenier，体现由外到内整体变细；
 *   B. 外层膨大峰：高斯钟形，复刻测定曲线开头的小峰；
 *   C. 内层陡降：sigmoid 形下凹，复刻蛹衬前的加速变细。
 * 最后乘标定系数 calib 把全粒均值拉到 meanDenier（曲线形状不变）。
 */
export function filamentDenier(type: CocoonType, x: number): number {
  const t = type as CalibratedCocoonType;
  const xc = Math.min(1, Math.max(0, x));
  const baseline = baselineAt(t, xc);
  const sigma = 0.075;
  const gauss =
    (t.peakDenier - baselineAt(t, t.peakAt)) *
    Math.exp(-((xc - t.peakAt) ** 2) / (2 * sigma * sigma));
  const dropDepth = 0.32 * (t.outerDenier - t.innerEndDenier);
  const k = 14;
  const innerDrop = -dropDepth / (1 + Math.exp(-k * (xc - t.innerDropAt)));
  const calib = t.calib ?? 1;
  return Math.max(0.4, (baseline + gauss + innerDrop) * calib);
}

/** 数值积分求全粒平均纤度，用于校验与标定 */
export function averageFilamentDenier(type: CocoonType, steps = 240): number {
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    sum += filamentDenier(type, (i + 0.5) / steps);
  }
  return sum / steps;
}

/** 迭代标定：让积分均值精确等于设定 meanDenier */
function calibrate(type: CocoonType): CalibratedCocoonType {
  const calibrated: CalibratedCocoonType = { ...type, calib: 1 };
  for (let i = 0; i < 12; i++) {
    const avg = averageFilamentDenier(calibrated);
    calibrated.calib *= type.meanDenier / avg;
  }
  return calibrated;
}

export const COCOON_TYPES: CalibratedCocoonType[] = RAW_TYPES.map(calibrate);

export function cocoonType(id: string): CalibratedCocoonType {
  const t = COCOON_TYPES.find((c) => c.id === id);
  if (!t) throw new Error(`未知茧种: ${id}`);
  return t;
}

/** 生丝目标纤度带（21 旦尼尔厂丝，允许 ±1.5 旦尼尔波动） */
export const TARGET_DENIER = 21;
export const TARGET_BAND_LOW = 19.5;
export const TARGET_BAND_HIGH = 22.5;

/** 旦尼尔 → 每米质量（克） */
export function denierToGramsPerMeter(denier: number): number {
  return denier / 9000;
}
