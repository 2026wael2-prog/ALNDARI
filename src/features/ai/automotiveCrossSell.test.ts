import { describe, it, expect } from 'vitest';
import {
  getLocalCrossSellSuggestions,
  analyzeAutomotiveQuery,
  extractVehicleTokens,
  buildGoogleSearchUrl,
} from './automotiveCrossSell';

describe('automotiveCrossSell', () => {
  it('returns empty array when cart is empty', () => {
    expect(getLocalCrossSellSuggestions([])).toEqual([]);
  });

  it('suggests oil filter and air filter when engine oil is in cart', () => {
    const suggestions = getLocalCrossSellSuggestions(['زيت محرك تويوتا 5W-30']);
    expect(suggestions).toContain('فلتر زيت محرك');
    expect(suggestions).toContain('فلتر هواء محرك');
  });

  it('suggests rotors and brake fluid when brake pads are in cart', () => {
    const suggestions = getLocalCrossSellSuggestions(['قماشات فرامل أمامية كورولا']);
    expect(suggestions).toContain('هوبات فرامل أمامية');
    expect(suggestions).toContain('زيت فرامل DOT4');
  });

  it('does not suggest an item that is already in the cart', () => {
    const suggestions = getLocalCrossSellSuggestions(['زيت محرك 5W30', 'فلتر زيت محرك أصلي']);
    expect(suggestions).not.toContain('فلتر زيت محرك');
    expect(suggestions).toContain('فلتر هواء محرك');
  });

  it('returns universal fallback maintenance items when cart contains generic or unmapped item', () => {
    const suggestions = getLocalCrossSellSuggestions(['قطعة غير معرفة 123']);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions).toContain('فلتر زيت محرك');
  });

  it('detects CV axle system and vehicle context for راس عكس هايلوكس 2016', () => {
    const result = analyzeAutomotiveQuery('راس عكس هايلوكس 2016');
    expect(result.primarySystemLabel).toBe('منظومة العكوس والدفع');
    expect(result.companionChips).toContain('ربلات عكس');
    expect(result.companionChips).toContain('ركب ذراع');
    expect(result.companionChips).toContain('ربلات شريم');
    expect(result.companionChips).toContain('صليب عكس داخلي');
    expect(result.vehicleTokens).toContain('هايلوكس');
    expect(result.vehicleTokens).toContain('2016');
  });

  it('detects control arm bushing system for بوش مقص كامري', () => {
    const result = analyzeAutomotiveQuery('بوش مقص كامري');
    expect(result.primarySystemLabel).toBe('منظومة المقصات والتعليق الأمامي');
    expect(result.companionChips).toContain('جوزة مقص فوق');
    expect(result.companionChips).toContain('جوزة مقص تحت');
    expect(result.vehicleTokens).toContain('كامري');
  });

  it('normalizes ة/ه and detects leaf spring shackle system for لعابه شاص', () => {
    const result = analyzeAutomotiveQuery('لعابه شاص');
    expect(result.primarySystemLabel).toBe('منظومة اللعابات والسست');
    expect(result.companionChips).toContain('ربلات لعابة');
    expect(result.companionChips).toContain('ربلات سست');
    expect(extractVehicleTokens('لعابه شاص 2020')).toEqual(['شاص', '2020']);
  });

  it('builds a properly encoded Google search URL for spare parts', () => {
    const url = buildGoogleSearchUrl({
      partNumber: '43460-09A36',
      brand: 'Toyota',
      name: 'راس عكس هايلوكس',
    });
    expect(url).toContain('https://www.google.com/search?q=');
    expect(decodeURIComponent(url)).toContain('43460-09A36 Toyota راس عكس هايلوكس');
  });
});
