import { resolve } from 'path';

require('ts-node').register();
require(resolve(__dirname, './agentWorker.ts'));
