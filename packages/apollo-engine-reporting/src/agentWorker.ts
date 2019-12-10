import { parentPort } from 'worker_threads';
import {
  Trace,
} from 'apollo-engine-reporting-protobuf';

parentPort!!.on('message', trace => Trace.encode(trace).finish());
