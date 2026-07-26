/**
 * {{BRAND_NAME}} — Capture App (§4.1–4.4)
 * Guided photo walkthrough — defines the required and optional photos
 * for a complete property condition assessment.
 */

import type { PhotoRequirement } from './types.ts';

/**
 * The standard photo walkthrough. Covers everything the Vision module
 * needs to score condition accurately.
 *
 * Order matters — this is the sequence presented to the user in the capture UI.
 */
export const PHOTO_WALKTHROUGH: readonly PhotoRequirement[] = [
  // Exterior (4 required, 1 optional)
  {
    key: 'exterior_front',
    label: 'Front of house',
    category: 'exterior',
    required: true,
    instruction: 'Stand at the curb. Capture the full front of the property including roof line, siding, windows, and landscaping.',
  },
  {
    key: 'exterior_left',
    label: 'Left side',
    category: 'exterior',
    required: true,
    instruction: 'Walk to the left side. Capture the full side including foundation, siding, and windows.',
  },
  {
    key: 'exterior_right',
    label: 'Right side',
    category: 'exterior',
    required: true,
    instruction: 'Walk to the right side. Capture the full side including foundation, siding, and windows.',
  },
  {
    key: 'exterior_rear',
    label: 'Rear of house',
    category: 'exterior',
    required: true,
    instruction: 'Capture the full rear of the property including deck/patio, siding, and roof.',
  },
  {
    key: 'exterior_roof',
    label: 'Roof close-up',
    category: 'exterior',
    required: false,
    instruction: 'If accessible, capture the roof condition — shingles, flashing, gutters. From ground level is fine.',
  },

  // Interior — Kitchen (3 required)
  {
    key: 'kitchen_overview',
    label: 'Kitchen overview',
    category: 'interior',
    required: true,
    instruction: 'Stand in the doorway. Capture cabinets, countertops, and appliances in one wide shot.',
  },
  {
    key: 'kitchen_appliances',
    label: 'Kitchen appliances',
    category: 'interior',
    required: true,
    instruction: 'Capture the stove/oven, refrigerator, and dishwasher. Show the brand and condition.',
  },
  {
    key: 'kitchen_counters',
    label: 'Countertops & sink',
    category: 'interior',
    required: true,
    instruction: 'Close-up of countertop material and sink/faucet condition.',
  },

  // Interior — Bathrooms (2 required)
  {
    key: 'bathroom_primary',
    label: 'Primary bathroom',
    category: 'interior',
    required: true,
    instruction: 'Capture the full bathroom — vanity, toilet, tub/shower, tile, and flooring.',
  },
  {
    key: 'bathroom_secondary',
    label: 'Secondary bathroom',
    category: 'interior',
    required: false,
    instruction: 'If there is a second bathroom, capture it the same way.',
  },

  // Interior — Living spaces (3 required)
  {
    key: 'living_room',
    label: 'Living room',
    category: 'interior',
    required: true,
    instruction: 'Wide shot of the main living area. Show flooring, walls, ceiling, and windows.',
  },
  {
    key: 'primary_bedroom',
    label: 'Primary bedroom',
    category: 'interior',
    required: true,
    instruction: 'Wide shot showing flooring, walls, closet door, and windows.',
  },
  {
    key: 'flooring_detail',
    label: 'Flooring close-up',
    category: 'interior',
    required: true,
    instruction: 'Close-up of the most common flooring type. Show wear, scratches, or damage.',
  },

  // Systems (2 optional but valuable)
  {
    key: 'hvac_unit',
    label: 'HVAC / furnace',
    category: 'systems',
    required: false,
    instruction: 'Photo of the HVAC unit, furnace, or heat pump. Show the data plate if accessible.',
  },
  {
    key: 'electrical_panel',
    label: 'Electrical panel',
    category: 'systems',
    required: false,
    instruction: 'Open the panel cover (if safe). Capture the breaker layout and panel brand/amp rating.',
  },
  {
    key: 'water_heater',
    label: 'Water heater',
    category: 'systems',
    required: false,
    instruction: 'Photo of the water heater showing the data plate (age, capacity).',
  },

  // Damage documentation (all optional)
  {
    key: 'damage_1',
    label: 'Damage area 1',
    category: 'damage',
    required: false,
    instruction: 'If there is visible damage (water stains, cracks, rot, mold), photograph it closely.',
  },
  {
    key: 'damage_2',
    label: 'Damage area 2',
    category: 'damage',
    required: false,
    instruction: 'Additional damage documentation.',
  },
  {
    key: 'damage_3',
    label: 'Damage area 3',
    category: 'damage',
    required: false,
    instruction: 'Additional damage documentation.',
  },
] as const;

/**
 * Get the required photos only.
 */
export function requiredPhotos(): PhotoRequirement[] {
  return PHOTO_WALKTHROUGH.filter((p) => p.required);
}

/**
 * Get photos by category.
 */
export function photosByCategory(category: PhotoRequirement['category']): PhotoRequirement[] {
  return PHOTO_WALKTHROUGH.filter((p) => p.category === category);
}

/**
 * Check capture completeness — returns missing required photos.
 */
export function missingRequired(capturedKeys: Set<string>): PhotoRequirement[] {
  return PHOTO_WALKTHROUGH.filter((p) => p.required && !capturedKeys.has(p.key));
}

/**
 * Progress calculation for the capture UI.
 */
export function captureProgress(capturedKeys: Set<string>): {
  total: number;
  captured: number;
  required: number;
  requiredCaptured: number;
  percent: number;
  complete: boolean;
} {
  const required = PHOTO_WALKTHROUGH.filter((p) => p.required);
  const requiredCaptured = required.filter((p) => capturedKeys.has(p.key)).length;
  const captured = PHOTO_WALKTHROUGH.filter((p) => capturedKeys.has(p.key)).length;

  return {
    total: PHOTO_WALKTHROUGH.length,
    captured,
    required: required.length,
    requiredCaptured,
    percent: Math.round((requiredCaptured / required.length) * 100),
    complete: requiredCaptured === required.length,
  };
}
