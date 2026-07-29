/**
 * ValueProof — Capture App (§4.1–4.4)
 * Public API surface.
 */

export { CaptureManager, CaptureError } from './session.ts';
export type { CaptureSessionStore, VisionScorer, ValuationTrigger, CaptureManagerConfig } from './session.ts';

export { InMemoryCaptureStore } from './store.ts';

export {
  PHOTO_WALKTHROUGH,
  requiredPhotos,
  photosByCategory,
  missingRequired,
  captureProgress,
} from './walkthrough.ts';

export type {
  CaptureSession,
  CaptureStatus,
  CapturedPhoto,
  PhotoRequirement,
  SubmitPhotosRequest,
  SubmitPhotosResult,
} from './types.ts';

export { renderCaptureHtml } from './render.ts';
