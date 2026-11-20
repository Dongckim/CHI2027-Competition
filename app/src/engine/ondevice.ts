// Wonjune's on-device engine (recsys/) goes here behind the same Engine interface. Until it is wired, every call says so
// instead of answering, so ?engine=ondevice never shows mock results under the real engine's name.
// Model files from Hugging Face go into Cache Storage (MODEL_CACHE) so the conference day works offline.
import type { Engine } from './types';

export const MODEL_CACHE = 'arc-model-v1';
const notYet = async (): Promise<never> => { throw new Error('ondevice engine is not wired yet (recsys/)'); };

export const ondeviceEngine: Engine = { init: notYet, tribeOf: notYet, angleTopics: notYet, buildArc: notYet, suggest: notYet, wildcard: notYet };
