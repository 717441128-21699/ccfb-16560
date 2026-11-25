import type { EngineCommand, EngineSnapshot, PayrollResult, WorkerOut } from './types';

/** Web Worker 客户端：主线程只发指令、收快照，所有逐 tick 计算在 Worker 内 */
export class SimClient {
  private worker: Worker;
  private snapshotCb: ((s: EngineSnapshot) => void) | null = null;
  private payrollCb: ((p: PayrollResult) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data;
      if (msg.kind === 'snapshot') this.snapshotCb?.(msg.snapshot);
      else if (msg.kind === 'payroll') this.payrollCb?.(msg.result);
    };
  }

  send(cmd: EngineCommand): void {
    this.worker.postMessage(cmd);
  }

  onSnapshot(cb: (s: EngineSnapshot) => void): void {
    this.snapshotCb = cb;
  }

  onPayroll(cb: (p: PayrollResult) => void): void {
    this.payrollCb = cb;
  }
}
