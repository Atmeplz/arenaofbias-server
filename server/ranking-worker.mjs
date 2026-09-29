import { parentPort, workerData } from 'node:worker_threads';
import { effortKey, entityKey, modelKey } from './catalog.mjs';
import { rankEntries } from './ranking.mjs';

const keyOf = workerData.by === 'model' ? (work) => work.modelKey ?? modelKey(work) : (work) => work.configKey ?? entityKey(work);
parentPort.postMessage(rankEntries(workerData.votes, keyOf, workerData.limits));
