/**
 * ValueProof — Report Builder
 * Public API. Consumes a `Valuation` from @flip-master/valuation-engine and
 * returns a self-contained HTML report (web + PDF source).
 */

export { renderReport } from './report.ts';
export type {
  RenderReportInput,
  ReportMeta,
  ReportOptions,
  Certification,
} from './report.ts';
export { DEFAULT_BRANDING, resolveBranding, tierColor } from './branding.ts';
export type { Branding } from './branding.ts';
export { reportCss } from './styles.ts';
