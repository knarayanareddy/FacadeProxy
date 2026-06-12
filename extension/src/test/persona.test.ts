import { describe, expect, it } from 'vitest';
import { DEFAULT_PERSONAS } from '../shared/defaultPersonas';
import { languageList, primaryLanguage, primaryLocale, validatePersona } from '../shared/persona';

const nl = DEFAULT_PERSONAS.find((persona) => persona.id === 'nl_chrome_linux')!;

describe('persona validation', () => {
  it('validates default personas', () => {
    for (const persona of DEFAULT_PERSONAS) {
      expect(validatePersona(persona).valid, persona.id).toBe(true);
    }
  });

  it('rejects timezone mismatch', () => {
    const result = validatePersona({ ...nl, timezone: 'America/New_York' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('CR-01'))).toBe(true);
  });

  it('warns for language mismatch in non-strict mode', () => {
    const result = validatePersona({ ...nl, accept_lang: 'en-US,en;q=0.9' }, false);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('CR-02'))).toBe(true);
  });

  it('parses accept-language', () => {
    expect(primaryLocale('nl-NL,nl;q=0.9,en;q=0.8')).toBe('nl-NL');
    expect(primaryLanguage('nl-NL,nl;q=0.9,en;q=0.8')).toBe('nl');
    expect(languageList('nl-NL,nl;q=0.9,en;q=0.8')).toEqual(['nl-NL', 'nl', 'en']);
  });
});
