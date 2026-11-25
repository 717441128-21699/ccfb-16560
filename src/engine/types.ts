// 模拟引擎共用类型定义（纯数据结构，主线程与 Web Worker 共用）

/** 茧种定义 */
export interface CocoonType {
  id: string;
  name: string;
  /** 茧层可缫丝长（米） */
  filamentLength: number;
  /** 单粒茧丝平均纤度（旦尼尔 denier = g/9000m） */
  meanDenier: number;
  /** 外层起始纤度（x=0） */
  outerDenier: number;
  /** 膨大部峰值纤度（公开测定数据中茧层前 10~20% 处的小峰） */
  peakDenier: number;
  /** 峰值位置（占茧层比例 0~1） */
  peakAt: number;
  /** 内层陡降起点（占茧层比例） */
  innerDropAt: number;
  /** 内层最终纤度（x→1） */
  innerEndDenier: number;
  /** 适宜煮熟度下限（低于此值丝胶未软化，抽不动、断头） */
  cookMin: number;
  /** 适宜煮熟度上限（高于此值煮过头，茧层散乱、废丝多） */
  cookMax: number;
  /** 温度效率系数：每摄氏度对煮熟速率的影响 */
  tempEfficiency: number;
  /** 生丝目标在缫粒数（该茧种配 21 旦尼尔生丝的参考粒数） */
  targetCount: number;
  color: string;
}

/** 煮茧锅中的单粒茧状态 */
export interface CookingCocoon {
  id: number;
  typeId: string;
  /** 煮熟度 0~1.3（1.0 为恰好煮透） */
  cook: number;
  /** 索绪完成，丝头已找到 */
  brushed: boolean;
  /** 理绪完成，外层乱丝已去掉，可添绪 */
  trimmed: boolean;
  /** 已产生的废丝（克） */
  waste: number;
}

/** 煮茧锅 */
export interface CookPot {
  id: number;
  /** 当前水温（摄氏度） */
  temperature: number;
  /** 目标温度 */
  targetTemp: number;
  cocoons: CookingCocoon[];
}

/** 正在缫丝的一粒茧 */
export interface ReelingCocoon {
  id: number;
  typeId: string;
  /** 已抽出丝长（米） */
  drawn: number;
  /** 总可缫丝长（米） */
  length: number;
  /** 入锅时煮熟度（决定断头/废丝倾向） */
  cookScore: number;
}

/** 单绪状态 */
export interface ReelingEnd {
  id: number;
  cocoons: ReelingCocoon[];
  /** 停机（无茧可缫，等待添绪） */
  idle: boolean;
  /** 断头后等待接绪 */
  broken: boolean;
  /** 断绪持续的游戏时间（秒） */
  brokenTime: number;
  /** 累计断头次数 */
  breaks: number;
  /** 接绪不良造成的疙瘩数 */
  slubs: number;
  /** 当前疙瘩剩余影响时间（秒），期间纤度虚高 */
  slubTimer: number;
  /** 累计出丝质量（克） */
  outputMass: number;
  /** 累计废丝（克） */
  wasteMass: number;
  /** 累计有效缫丝时长（秒，用于算效率） */
  activeTime: number;
  /** 当前纤度（旦尼尔），引擎每 tick 更新 */
  currentDenier: number;
  /** 纤度历史环形缓冲（采样值，断头记 NaN） */
  history: Float64Array;
  /** 历史写入位置 */
  historyHead: number;
  /** 历史已写入条数 */
  historyCount: number;
  /** 纤度在线统计（Welford） */
  meanAcc: number;
  m2Acc: number;
  sampleCount: number;
  /** 偏细累计时间（秒，低于目标带下限） */
  thinTime: number;
  /** 事件标记（最近一次，供 UI 闪提示）：break | slub | exhaust | feed */
  lastEvent: string;
  lastEventTimer: number;
}

/** 引擎配置 */
export interface EngineConfig {
  endCount: number;
  potCount: number;
  potCapacity: number;
  /** 一个班的游戏时长（秒，8 小时 = 28800） */
  shiftLength: number;
  /** 历史缓冲采样数（每 4 游戏秒一个点） */
  historySamples: number;
}

/** 单绪快照（主线程渲染用，普通对象可结构化克隆） */
export interface EndSnapshot {
  id: number;
  count: number;
  denier: number;
  idle: boolean;
  broken: boolean;
  breaks: number;
  slubs: number;
  outputMass: number;
  wasteMass: number;
  thinTime: number;
  warnLevel: number; // 0 正常 1 注意 2 告警（茧将尽/粒数不足）3 断头/停机
  event: string;
  eventTimer: number;
  /** 各在缫茧的剩余比例 0~1，用于单绪监看页 */
  remain: number[];
  types: string[];
  /** 纤度历史（采样点，断头/停机为 NaN），按时间正序 */
  history: Float64Array;
}

export interface PotSnapshot {
  id: number;
  temperature: number;
  targetTemp: number;
  /** 锅内累计废丝（克） */
  waste: number;
  cocoons: {
    typeId: string;
    cook: number;
    brushed: boolean;
    trimmed: boolean;
    ready: boolean;
    overcooked: boolean;
  }[];
  readyCount: number;
}

export interface EngineSnapshot {
  gameTime: number;
  shiftLength: number;
  running: boolean;
  dayOver: boolean;
  speed: number;
  timeScale: number;
  totalOutput: number;
  totalWaste: number;
  totalBreaks: number;
  totalSlubs: number;
  meanDenier: number;
  denierCV: number;
  thinRatio: number;
  activeEnds: number;
  readyCocoons: number;
  ends: EndSnapshot[];
  pots: PotSnapshot[];
  events: GameEvent[];
}

export interface GameEvent {
  t: number;
  endId: number;
  kind: 'break' | 'slub' | 'exhaust' | 'feed' | 'tie';
  message: string;
}

/** 工钱结算结果 */
export interface PayrollResult {
  outputMass: number;
  wasteMass: number;
  breaks: number;
  slubs: number;
  meanDenier: number;
  cv: number;
  thinRatio: number;
  efficiency: number;
  grade: string;
  pieceWage: number;
  qualityBonus: number;
  breakPenalty: number;
  wastePenalty: number;
  totalWage: number;
}

/** 主线程 → Worker 的指令 */
export type EngineCommand =
  | { kind: 'tick'; dtReal: number }
  | { kind: 'setSpeed'; speed: number }
  | { kind: 'setScale'; scale: number }
  | { kind: 'setPaused'; paused: boolean }
  | { kind: 'loadCocoons'; potId: number; typeId: string; n: number }
  | { kind: 'setTemp'; potId: number; temp: number }
  | { kind: 'brush'; potId: number }
  | { kind: 'trim'; potId: number }
  | { kind: 'feed'; endId: number }
  | { kind: 'feedAll' }
  | { kind: 'tie'; endId: number }
  | { kind: 'reset' };

export type WorkerOut =
  | { kind: 'snapshot'; snapshot: EngineSnapshot }
  | { kind: 'payroll'; result: PayrollResult };
