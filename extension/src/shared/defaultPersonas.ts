import type { Persona } from './types';

export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'nl_chrome_linux',
    display_name: 'Netherlands / Chrome on Linux',
    user_agent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    accept_lang: 'nl-NL,nl;q=0.9,en;q=0.8',
    timezone: 'Europe/Amsterdam',
    geo_region: 'NL',
    screen_width: 1920,
    screen_height: 1080,
    color_depth: 24,
    platform: 'Linux x86_64',
    timezone_offset_minutes: -120,
    hardware_concurrency: 8,
    device_memory: 8,
    max_touch_points: 0,
    vendor: 'Google Inc.'
  },
  {
    id: 'us_chrome_windows',
    display_name: 'US East / Chrome on Windows',
    user_agent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    accept_lang: 'en-US,en;q=0.9',
    timezone: 'America/New_York',
    geo_region: 'US',
    screen_width: 1366,
    screen_height: 768,
    color_depth: 24,
    platform: 'Win32',
    timezone_offset_minutes: 240,
    hardware_concurrency: 8,
    device_memory: 8,
    max_touch_points: 0,
    vendor: 'Google Inc.'
  },
  {
    id: 'de_firefox_windows',
    display_name: 'Germany / Firefox on Windows',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    accept_lang: 'de-DE,de;q=0.9,en;q=0.8',
    timezone: 'Europe/Berlin',
    geo_region: 'DE',
    screen_width: 1536,
    screen_height: 864,
    color_depth: 24,
    platform: 'Win32',
    timezone_offset_minutes: -120,
    hardware_concurrency: 8,
    device_memory: 8,
    max_touch_points: 0,
    vendor: ''
  }
];
