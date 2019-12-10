import { parentPort, workerData } from 'worker_threads';
import { EngineReportingAgent } from './agent';

if (!workerData.options) {
  throw new Error(`no options in workerData: ${workerData}`);
}

if (!parentPort) {
  throw new Error(`parentPort is null/undefined.`);
}

const agent = new EngineReportingAgent(workerData.options);

parentPort.on('message', (message) => {
  switch (message.kind) {
    case 'addTrace':
      agent.addTrace(message.payload);
      break;
    case 'sendAllReports':
      agent.sendAllReports();
      break;
    case 'stop':
      agent.stop();
      if (parentPort) parentPort.postMessage({ kind: "ack", payload: "stop" });
      break;
    default:
      throw new Error(`Unknown message kind ${message}`)
  }
});
