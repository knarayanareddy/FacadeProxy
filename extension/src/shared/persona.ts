import type { Persona, ValidationResult } from './types';

const TIMEZONES_BY_GEO: Record<string, string[]> = {
  NL: ['Europe/Amsterdam'],
  DE: ['Europe/Berlin'],
  FR: ['Europe/Paris'],
  ES: ['Europe/Madrid'],
  IT: ['Europe/Rome'],
  GB: ['Europe/London'],
  UK: ['Europe/London'],
  US: [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu'
  ],
  CA: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Halifax'],
  JP: ['Asia/Tokyo'],
  IN: ['Asia/Kolkata'],
  BR: ['America/Sao_Paulo'],
  AU: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Brisbane']
};

const LANGS_BY_GEO: Record<string, string[]> = {
  NL: ['nl'],
  DE: ['de'],
  FR: ['fr'],
  ES: ['es'],
  IT: ['it'],
  GB: ['en'],
  UK: ['en'],
  US: ['en'],
  CA: ['en'],
  AU: ['en'],
  JP: ['ja'],
  IN: ['hi', 'en'],
  BR: ['pt']
};

const COMMON_RESOLUTIONS = new Set([
  '1024x768',
  '1280x720',
  '1280x800',
  '1366x768',
  '1440x900',
  '1536x864',
  '1600x900',
  '1680x1050',
  '1920x1080',
  '1920x1200',
  '2560x1440',
  '3840x2160'
]);

export function validatePersona(persona: Persona, strict = false): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const warnOrError = (message: string): void => {
    if (strict) errors.push(message);
    else warnings.push(message);
  };

  if (!persona.id?.trim()) errors.push('persona.id must not be empty');
  if (!persona.user_agent?.trim()) errors.push('persona.user_agent must not be empty');
  if (!persona.accept_lang?.trim()) errors.push('persona.accept_lang must not be empty');
  if (!persona.timezone?.trim()) errors.push('persona.timezone must not be empty');
  if (!persona.geo_region?.trim()) errors.push('persona.geo_region must not be empty');
  if (!persona.screen_width || !persona.screen_height) errors.push('screen dimensions must be non-zero');

  const geo = persona.geo_region.toUpperCase();
  const allowedZones = TIMEZONES_BY_GEO[geo] ?? [];
  if (allowedZones.length === 0) {
    warnings.push(`CR-01: unknown geo_region ${persona.geo_region}; cannot verify timezone ${persona.timezone}`);
  } else if (!allowedZones.includes(persona.timezone)) {
    errors.push(`CR-01: timezone ${persona.timezone} is not coherent with geo_region ${persona.geo_region}`);
  }

  const expectedLangs = LANGS_BY_GEO[geo] ?? [];
  const primary = primaryLanguage(persona.accept_lang);
  if (expectedLangs.length === 0) {
    warnings.push(`CR-02: unknown geo_region ${persona.geo_region}; cannot verify accept_lang ${persona.accept_lang}`);
  } else if (!expectedLangs.includes(primary)) {
    warnOrError(`CR-02: accept_lang primary language '${primary}' is not typical for geo_region ${persona.geo_region}`);
  }

  if (!platformMatchesUserAgent(persona.platform, persona.user_agent)) {
    errors.push(`CR-03: user_agent platform token is not coherent with platform '${persona.platform}'`);
  }

  const resolution = `${persona.screen_width}x${persona.screen_height}`;
  if (
    persona.screen_width < 800 ||
    persona.screen_height < 600 ||
    persona.screen_width > 8000 ||
    persona.screen_height > 5000
  ) {
    warnOrError(`CR-04: resolution ${resolution} is outside expected desktop ranges`);
  } else if (!COMMON_RESOLUTIONS.has(resolution)) {
    warnOrError(`CR-04: resolution ${resolution} is not in the known-common resolution set`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function primaryLocale(acceptLang: string): string {
  return acceptLang.split(',')[0]?.split(';')[0]?.trim() || 'en-US';
}

export function primaryLanguage(acceptLang: string): string {
  return primaryLocale(acceptLang).split('-')[0]?.toLowerCase() || 'en';
}

export function languageList(acceptLang: string): string[] {
  return acceptLang
    .split(',')
    .map((part) => part.split(';')[0]?.trim())
    .filter((part): part is string => Boolean(part));
}

export function timezoneOffsetFor(persona: Persona): number {
  if (typeof persona.timezone_offset_minutes === 'number') return persona.timezone_offset_minutes;
  switch (persona.timezone) {
    case 'Europe/Amsterdam':
    case 'Europe/Berlin':
    case 'Europe/Paris':
    case 'Europe/Madrid':
    case 'Europe/Rome':
      return -120;
    case 'Europe/London':
      return -60;
    case 'America/New_York':
    case 'America/Toronto':
      return 240;
    case 'America/Chicago':
      return 300;
    case 'America/Denver':
      return 360;
    case 'America/Los_Angeles':
    case 'America/Vancouver':
      return 420;
    case 'Pacific/Honolulu':
      return 600;
    case 'Asia/Tokyo':
      return -540;
    case 'Asia/Kolkata':
      return -330;
    case 'Australia/Sydney':
    case 'Australia/Melbourne':
      return -600;
    default:
      return new Date().getTimezoneOffset();
  }
}

function platformMatchesUserAgent(platform: string, userAgent: string): boolean {
  const p = platform.toLowerCase();
  const ua = userAgent.toLowerCase();
  if (p.includes('linux')) return ua.includes('linux') || ua.includes('x11');
  if (p.includes('win')) return ua.includes('windows');
  if (p.includes('mac') || p.includes('darwin')) return ua.includes('macintosh') || ua.includes('mac os');
  if (p.includes('android')) return ua.includes('android');
  return true;
}
