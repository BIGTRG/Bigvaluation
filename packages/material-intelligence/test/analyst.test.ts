import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMaterials,
  interpolateArv,
  scoreMaterial,
  parseMaterialText,
  MATERIAL_MATRIX,
  findCategory,
  resolveMatrix,
} from '../src/index.ts';

const ARV = { light: 420_000, medium: 460_000, high: 520_000 };

// The concept-package example: luxury kitchen/floors/siding, premium bath,
// but architectural shingle roof + standard vinyl windows → capped upper-medium.
const CONCEPT_SCOPE = [
  { category: 'counters', material: 'Granite / quartz' },
  { category: 'flooring', material: 'Solid hardwood' },
  { category: 'siding', material: 'LP SmartSide' },
  { category: 'windows', material: 'Vinyl, energy-rated' },
  { category: 'roof', material: 'Architectural shingle' },
  { category: 'bath', material: 'Tiled shower + double vanity' },
  { category: 'systems', material: 'New HVAC' },
];

describe('material matrix', () => {
  it('scores high-end keywords before medium (premium quartz vs quartz)', () => {
    const counters = findCategory(MATERIAL_MATRIX, 'counters')!;
    assert.equal(scoreMaterial(counters, 'premium quartz waterfall').score, 3);
    assert.equal(scoreMaterial(counters, 'standard quartz').score, 2);
    assert.equal(scoreMaterial(counters, 'laminate').score, 1);
    assert.equal(scoreMaterial(counters, 'mystery material').score, 0);
  });

  it('finds categories by id, label, and fuzzy match', () => {
    assert.equal(findCategory(MATERIAL_MATRIX, 'counters')?.id, 'counters');
    assert.equal(findCategory(MATERIAL_MATRIX, 'Kitchen counters')?.id, 'counters');
    assert.equal(findCategory(MATERIAL_MATRIX, 'Bathrooms')?.id, 'bath');
    assert.equal(findCategory(MATERIAL_MATRIX, 'nope-nothing'), undefined);
  });

  it('supports per-market overrides', () => {
    const custom = { ...MATERIAL_MATRIX[0], weight: 9 };
    const matrix = resolveMatrix({ categories: [custom] });
    assert.equal(matrix.find((c) => c.id === 'counters')?.weight, 9);
    assert.equal(matrix.length, MATERIAL_MATRIX.length);
  });
});

describe('analyzeMaterials', () => {
  it('reads the concept scope as luxury-leaning capped upper-medium', () => {
    const a = analyzeMaterials(CONCEPT_SCOPE, { sqft: 1800 }, { arv: ARV });
    assert.equal(a.capped, true);
    assert.equal(a.detectedTier, 'high');
    assert.match(a.detectedLabel, /capped upper-medium/i);
    assert.ok(a.finishScore > 2.45 && a.finishScore < 3, `score ${a.finishScore}`);
    // True-scope ARV sits between medium and high, materials-driven.
    assert.ok(a.trueScopeArv! > ARV.medium && a.trueScopeArv! < ARV.high, `arv ${a.trueScopeArv}`);
    assert.ok(a.pricePerSqft! > 0);
    assert.match(a.reasoning, /high-end signal/i);
    assert.match(a.reasoning, /held below full luxury/i);
  });

  it('uncaps when the capping categories are luxury too', () => {
    const a = analyzeMaterials(
      CONCEPT_SCOPE.map((l) =>
        l.category === 'roof'
          ? { ...l, material: 'Standing seam metal' }
          : l.category === 'windows'
            ? { ...l, material: 'Marvin fiberglass' }
            : l.category === 'systems'
              ? { ...l, material: 'Multi-zone mini split system' }
              : l,
      ),
      {},
      { arv: ARV },
    );
    assert.equal(a.capped, false);
    assert.equal(a.detectedTier, 'high');
    assert.ok(a.trueScopeArv! > interpolateArv(ARV, 2.55));
  });

  it('reads an all-cosmetic scope as light', () => {
    const a = analyzeMaterials(
      [
        { category: 'counters', material: 'Laminate' },
        { category: 'flooring', material: 'Carpet' },
        { category: 'bath', material: 'Reglaze tub' },
        { category: 'fixtures', material: 'Keep fixtures' },
      ],
      {},
      { arv: ARV },
    );
    assert.equal(a.detectedTier, 'light');
    assert.equal(a.capped, false);
    assert.ok(a.trueScopeArv! < ARV.medium);
  });

  it('infers categories from bare material text', () => {
    const a = analyzeMaterials([{ material: 'solid hardwood floors' }, { material: 'granite counters' }]);
    const cats = a.lines.map((l) => l.category).sort();
    assert.deepEqual(cats, ['counters', 'flooring']);
  });

  it('excludes unmatched lines from the score but reports them', () => {
    const a = analyzeMaterials([
      { category: 'counters', material: 'granite' },
      { category: 'other stuff', material: 'unicorn dust' },
    ]);
    assert.equal(a.matchedCount, 1);
    assert.equal(a.unmatchedCount, 1);
    assert.match(a.reasoning, /could not be matched/i);
  });

  it('works without tier values (no ARV, still a tier + reasoning)', () => {
    const a = analyzeMaterials([{ category: 'counters', material: 'granite' }]);
    assert.equal(a.trueScopeArv, undefined);
    assert.equal(a.detectedTier, 'medium');
    assert.ok(a.reasoning.length > 20);
  });

  it('throws on empty or fully-unmatched input', () => {
    assert.throws(() => analyzeMaterials([]));
    assert.throws(() => analyzeMaterials([{ material: 'unicorn dust' }]));
  });

  it('accepts a custom reasoner (the Claude slot)', () => {
    const a = analyzeMaterials(CONCEPT_SCOPE, {}, { arv: ARV }, { reasoner: { explain: () => 'LLM prose.' } });
    assert.equal(a.reasoning, 'LLM prose.');
  });
});

describe('interpolateArv', () => {
  it('hits the anchors and interpolates linearly', () => {
    assert.equal(interpolateArv(ARV, 1), ARV.light);
    assert.equal(interpolateArv(ARV, 2), ARV.medium);
    assert.equal(interpolateArv(ARV, 3), ARV.high);
    assert.equal(interpolateArv(ARV, 2.5), (ARV.medium + ARV.high) / 2);
    assert.equal(interpolateArv(ARV, 0.5), ARV.light); // clamped
    assert.equal(interpolateArv(ARV, 3.5), ARV.high); // clamped
  });
});

describe('parseMaterialText', () => {
  it('parses labeled, csv, bulleted, and bare lines', () => {
    const lines = parseMaterialText(`
# scope of work
Kitchen counters: Granite / quartz
Flooring - Solid hardwood
siding,LP SmartSide
- Windows: Vinyl, energy-rated
Solid hardwood throughout upstairs
`);
    assert.equal(lines.length, 5);
    assert.deepEqual(lines[0], { category: 'Kitchen counters', material: 'Granite / quartz' });
    assert.deepEqual(lines[1], { category: 'Flooring', material: 'Solid hardwood' });
    assert.deepEqual(lines[2], { category: 'siding', material: 'LP SmartSide' });
    assert.deepEqual(lines[3], { category: 'Windows', material: 'Vinyl, energy-rated' });
    assert.deepEqual(lines[4], { material: 'Solid hardwood throughout upstairs' });
  });

  it('parses straight into the analyst', () => {
    const lines = parseMaterialText('counters: granite\nflooring: LVP\nroof: architectural shingle');
    const a = analyzeMaterials(lines, {}, { arv: ARV });
    assert.equal(a.detectedTier, 'medium');
  });
});
