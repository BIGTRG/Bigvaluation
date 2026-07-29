/**
 * ValueProof — Compliance layer (§4.7, §10)
 * Investor-only scope lock: every valuation-producing request must carry an
 * explicit business-purpose / non-owner-occupied attestation. The platform is
 * for business-purpose real-estate investment and lending decisions ONLY —
 * never consumer-purpose credit on a borrower's principal dwelling. This keeps
 * the product outside the federal AVM Quality Control Rule (12 CFR, eff.
 * 2025-10-01), which covers AVMs used to value a consumer's principal dwelling.
 *
 * The attestation is recorded on the job/scope for the audit trail (§10).
 */

export interface Attestation {
  /** The requester attests the loan/decision is business-purpose. */
  businessPurpose: true;
  /** The requester attests the subject is not and will not be the borrower's principal dwelling. */
  nonOwnerOccupied: true;
  /** Optional identifier of the person/system attesting (email, user id). */
  attestedBy?: string;
  /** Server timestamp when the attestation was accepted (ms epoch). */
  attestedAt: number;
}

export interface AttestationError {
  error: 'attestation_required';
  detail: string;
}

const DETAIL =
  'This platform is for business-purpose, non-owner-occupied real estate only. ' +
  'Include attestation: { businessPurpose: true, nonOwnerOccupied: true } confirming the subject ' +
  "is not and will not be the borrower's principal dwelling and the decision is business-purpose. " +
  'Reports may not be used for consumer-purpose credit decisions.';

/**
 * Parse and validate the attestation block of a request body.
 * Returns a stamped Attestation on success, or an AttestationError to send
 * back as HTTP 422.
 */
export function requireAttestation(body: Record<string, unknown> | undefined, now: number): Attestation | AttestationError {
  const raw = body?.attestation;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'attestation_required', detail: DETAIL };
  }
  const a = raw as Record<string, unknown>;
  if (a.businessPurpose !== true || a.nonOwnerOccupied !== true) {
    return { error: 'attestation_required', detail: DETAIL };
  }
  return {
    businessPurpose: true,
    nonOwnerOccupied: true,
    attestedBy: typeof a.attestedBy === 'string' && a.attestedBy.trim() ? a.attestedBy.trim() : undefined,
    attestedAt: now,
  };
}

export function isAttestationError(v: Attestation | AttestationError): v is AttestationError {
  return 'error' in v;
}

/** One-line business-purpose notice for report footers and API docs. */
export const BUSINESS_PURPOSE_NOTICE =
  'Prepared for business-purpose real estate investment and lending use only; not for consumer mortgage lending or any credit decision on a consumer\u2019s principal dwelling.';
