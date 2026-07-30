import { wordmarkImg } from './brandAssets.ts';

/**
 * ValueProof — Report Builder
 * Brand tokens (build brief §12). Everything name/logo/color lives here so the
 * whole report re-skins in one pass when the name and {{LOGO}} are chosen.
 */

export interface Branding {
  /** Product name. Placeholder until chosen (§0). */
  brandName: string;
  /** Primary domain shown in the footer, e.g. "reports.example.com". */
  brandDomain: string;
  /**
   * Logo mark. Either an inline SVG/`<img>` HTML string, a data URI, or null to
   * fall back to a clean text wordmark (§12 "leave a clean text wordmark").
   */
  logoHtml: string | null;
  colors: {
    navy: string;
    gold: string;
    green: string;
    /** Condition-tier accents (§12). */
    tierLight: string;
    tierMedium: string;
    tierHigh: string;
    /** Derived surface/text tokens. */
    ink: string;
    surface: string;
    surfaceAlt: string;
    line: string;
    mutedText: string;
  };
}

/** §12 concept palette. Swap when the brand is set. */
export const DEFAULT_BRANDING: Branding = {
  brandName: 'ValueProof',
  brandDomain: 'valueproof.net',
  logoHtml: wordmarkImg(40),
  colors: {
    navy: '#0D1B2A',
    gold: '#C8A15A',
    green: '#1F6F54',
    tierLight: '#3F9C6D',
    tierMedium: '#2F7FB0',
    tierHigh: '#8A5CC0',
    ink: '#16202B',
    surface: '#FFFFFF',
    surfaceAlt: '#F4F6F8',
    line: '#E2E7EC',
    mutedText: '#5C6B79',
  },
};

export function resolveBranding(overrides?: Partial<Branding>): Branding {
  if (!overrides) return DEFAULT_BRANDING;
  return {
    ...DEFAULT_BRANDING,
    ...overrides,
    colors: { ...DEFAULT_BRANDING.colors, ...overrides.colors },
  };
}

/** The tier accent color for a given tier. */
export function tierColor(branding: Branding, tier: 'light' | 'medium' | 'high'): string {
  return tier === 'light'
    ? branding.colors.tierLight
    : tier === 'medium'
      ? branding.colors.tierMedium
      : branding.colors.tierHigh;
}
