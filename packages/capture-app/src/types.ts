/**
 * ValueProof — Capture App (§4.1–4.4)
 * Types for the mobile property capture web app.
 */

import type { PropertyPhoto } from '../../vision/src/types.ts';

/** Photo requirement for the guided walkthrough. */
export interface PhotoRequirement {
  /** Unique key: 'exterior_front', 'kitchen_overview', etc. */
  key: string;
  /** Human label shown in the capture UI. */
  label: string;
  /** Category for grouping in the UI. */
  category: 'exterior' | 'interior' | 'systems' | 'damage';
  /** Whether this photo is required or optional. */
  required: boolean;
  /** Brief instruction shown to the user. */
  instruction: string;
}

/** A captured photo with metadata. */
export interface CapturedPhoto {
  /** Matches PhotoRequirement.key. */
  requirementKey: string;
  /** Base64-encoded image data. */
  data: string;
  /** MIME type. */
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Capture timestamp ISO. */
  capturedAt: string;
  /** File size in bytes (original). */
  sizeBytes: number;
}

/** State of a capture session. */
export type CaptureStatus = 'created' | 'in_progress' | 'photos_complete' | 'scoring' | 'complete' | 'expired';

/** A capture session tied to a subject property. */
export interface CaptureSession {
  id: string;
  /** Token for mobile access (URL parameter). */
  token: string;
  /** Account that created the session. */
  accountId: string;
  /** Subject property info. */
  subject: {
    address: string;
    sqft?: number;
    beds?: number;
    baths?: number;
    yearBuilt?: number;
  };
  status: CaptureStatus;
  /** Photos captured so far. */
  photos: CapturedPhoto[];
  /** Condition score result (set after vision scoring). */
  conditionScore?: number;
  /** Full vision assessment (set after scoring). */
  visionAssessment?: unknown;
  /** Valuation job id (set when valuation is triggered). */
  valuationJobId?: string;
  createdAt: number;
  updatedAt: number;
  /** Session expires after this timestamp. */
  expiresAt: number;
}

/** Request to submit photos and trigger scoring. */
export interface SubmitPhotosRequest {
  sessionId: string;
  token: string;
  photos: CapturedPhoto[];
}

/** Result after photos are submitted and scored. */
export interface SubmitPhotosResult {
  sessionId: string;
  status: CaptureStatus;
  photosAccepted: number;
  conditionScore?: number;
  assessment?: unknown;
  valuationJobId?: string;
}
