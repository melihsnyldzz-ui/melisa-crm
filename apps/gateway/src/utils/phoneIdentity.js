import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

const languageByCountry = {
  AE: 'Arapca', AM: 'Ermenice', AT: 'Almanca', AZ: 'Azerbaycanca',
  BE: 'Fransizca / Flamanca', BG: 'Bulgarca', CH: 'Almanca / Fransizca',
  DE: 'Almanca', DZ: 'Arapca / Fransizca', EG: 'Arapca', ES: 'Ispanyolca',
  FR: 'Fransizca', GB: 'Ingilizce', GE: 'Gurcuce', GR: 'Yunanca',
  IQ: 'Arapca / Kurtce', IL: 'Ibranice / Arapca', IT: 'Italyanca',
  JO: 'Arapca', KW: 'Arapca', KZ: 'Kazakca / Rusca', LB: 'Arapca / Fransizca',
  LY: 'Arapca', MA: 'Arapca / Fransizca', MD: 'Romence', NL: 'Felemenkce',
  OM: 'Arapca', PS: 'Arapca', QA: 'Arapca', RO: 'Romence', RS: 'Sirpca',
  RU: 'Rusca', SA: 'Arapca', SI: 'Slovence', SY: 'Arapca', TN: 'Arapca / Fransizca',
  TR: 'Turkce', UA: 'Ukraynaca', US: 'Ingilizce', UZ: 'Ozbekce',
};

const countryNames = new Intl.DisplayNames(['tr'], { type: 'region' });

function toFlagEmoji(countryCode = '') {
  if (!/^[A-Z]{2}$/.test(countryCode)) return '';
  return [...countryCode].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('');
}

function normalizePhone(value = '') {
  const raw = String(value || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) digits = `90${digits}`;
  return digits;
}

export function resolvePhoneIdentity(value = '') {
  const digits = normalizePhone(value);
  const unknown = {
    normalizedPhone: digits,
    countryCode: '',
    countryName: 'Bilinmiyor',
    flag: '',
    language: 'Bilinmiyor',
    languageSource: 'unknown',
    verified: false,
  };

  if (digits.length < 7 || digits.length > 15) return unknown;

  const parsed = parsePhoneNumberFromString(`+${digits}`);
  const countryCode = parsed?.country || '';
  if (!countryCode || !parsed.isPossible()) return unknown;

  return {
    normalizedPhone: parsed.number.replace(/^\+/, ''),
    countryCode,
    countryName: countryNames.of(countryCode) || countryCode,
    flag: toFlagEmoji(countryCode),
    language: languageByCountry[countryCode] || 'Bilinmiyor',
    languageSource: languageByCountry[countryCode] ? 'country-default' : 'unknown',
    verified: parsed.isValid(),
  };
}

