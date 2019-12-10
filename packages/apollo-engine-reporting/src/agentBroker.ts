import { Worker } from 'worker_threads';
import { EngineReportingOptions, AddTraceArgs } from './agent';
import { EngineReportingExtension } from './extension';

export class EngineReportingAgentBroker<TContext = any> {
  private worker: Worker;
  private options: EngineReportingOptions<TContext>;

  public constructor(options: EngineReportingOptions<TContext> = {}) {
    this.worker = new Worker('./workerBridge.js', {
      workerData: { options }
    })
    this.options = options;
  }

  public newExtension(schemaHash: string): EngineReportingExtension<TContext> {
    return new EngineReportingExtension<TContext>(
      this.options,
      this.addTrace.bind(this),
      schemaHash,
    );
  }

  public async addTrace(args: AddTraceArgs): Promise<void> {
    this.worker.postMessage({ kind: 'addTrace', payload: args });
  }

  public async sendAllReports(): Promise<void> {
    this.worker.postMessage({ kind: 'sendAllReports' });
  }

  public stop() {
    this.worker.postMessage({ kind: 'stop' });
    this.worker.once('message', (message) => {
      if (message === { kind: "ack", payload: "stop" }) {
        this.worker.terminate();
      }
    });
  }
}
