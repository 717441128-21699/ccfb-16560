/// <reference lib="webworker" />
import { ReelingEngine } from './ReelingEngine';
import type { EngineCommand, WorkerOut } from './types';

const engine = new ReelingEngine();
const EMIT_INTERVAL = 0.1; // 快照节流：最多 10 次/秒，降低主线程克隆压力
let emitTimer = 0;
let payrollSent = false;

function emitSnapshot(): void {
  const out: WorkerOut = { kind: 'snapshot', snapshot: engine.snapshot() };
  (self as unknown as Worker).postMessage(out);
}

self.onmessage = (ev: MessageEvent<EngineCommand>) => {
  const cmd = ev.data;
  engine.command(cmd);

  if (cmd.kind === 'tick') {
    emitTimer += cmd.dtReal;
    if (emitTimer >= EMIT_INTERVAL) {
      emitTimer = 0;
      emitSnapshot();
    }
  } else {
    // 操作类指令立即回传，保证点击反馈及时
    emitSnapshot();
  }

  if (!payrollSent) {
    const payroll = engine.getPayroll();
    if (payroll) {
      payrollSent = true;
      const pay: WorkerOut = { kind: 'payroll', result: payroll };
      (self as unknown as Worker).postMessage(pay);
    }
  }
  if (cmd.kind === 'reset') payrollSent = false;
};
