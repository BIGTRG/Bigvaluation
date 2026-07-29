/**
 * ValueProof — Material Intelligence (§4.3 add-on)
 * Public API surface.
 */

export {
  analyzeMaterials,
  interpolateArv,
  scoreMaterial,
  DeterministicReasoner,
} from './analyst.ts';
export type {
  MaterialLine,
  AnalysisSubject,
  TierValues,
  AnalyzeOptions,
  MaterialAnalysis,
  LineReadout,
  Reasoner,
  ReasonerInput,
} from './analyst.ts';

export { MATERIAL_MATRIX, resolveMatrix, findCategory } from './matrix.ts';
export type { MatrixCategory, MaterialSignal, MatrixOverrides, FinishScore } from './matrix.ts';

export { parseMaterialText } from './parse.ts';
