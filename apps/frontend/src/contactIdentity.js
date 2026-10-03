import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const regionNames = new Intl.DisplayNames(["tr"], { type: "region" });
const lidPattern = /^\d+(?::\d+)?@lid$/i;
const phoneJidPattern = /^(\d{7,15})(?::\d+)?@(c\.us|s\.whatsapp\.net)$/i;

// An opaque WhatsApp identity is never a phone number. No default country:
// local-only numbers must not silently become Turkish or another country's.
function parseInternationalPhone(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (lidPattern.test(text)) return null;
  const jid = text.match(phoneJidPattern);
  const input = jid ? `+${jid[1]}` : text.replace(/^00(?=\d)/, "+");
  if (!/^\+[\d\s().-]+$/.test(input)) return null;
  const parsed = parsePhoneNumberFromString(input, { extract: false });
  return parsed?.isPossible() ? parsed : null;
}

export function resolveContactIdentity(row = {}) {
  const contact = row.contact || row.sender || row.meta?.sender || {};
  // Prefer dedicated phone fields over the legacy mixed identity field.
  const phones = [row.phone, row.phoneNumber, row.phone_number, contact.phone,
    contact.phone_number, contact.phoneNumber, row.phoneIdentity];
  const identities = [...phones, row.whatsappLid, row.chatId, contact.identifier];
  const whatsappLid = identities.find((value) => typeof value === "string" && lidPattern.test(value.trim()))?.trim() || "";
  const parsed = phones.map(parseInternationalPhone).find(Boolean);
  const hasPhoneValue = phones.some((value) => typeof value === "string" && value.trim());
  const phoneCountryCode = parsed?.country || "";
  return {
    phone: parsed?.number || "",
    phoneDisplay: parsed?.formatInternational() || "",
    phoneNational: parsed?.nationalNumber || "",
    phoneCountryCode,
    phoneCountry: phoneCountryCode ? regionNames.of(phoneCountryCode) : "",
    countryCallingCode: parsed ? `+${parsed.countryCallingCode}` : "",
    phoneCountryStatus: phoneCountryCode ? "identified" : parsed?.isNonGeographic() ? "nonGeographic" : parsed ? "ambiguous" : "unavailable",
    phoneStatus: parsed ? "available" : whatsappLid ? "unresolved" : hasPhoneValue ? "incomplete" : "missing",
    whatsappLid,
  };
}

export function phoneUnavailableLabel(customer) {
  return customer.phoneStatus === "unresolved" ? "Telefon numarası henüz alınamadı"
    : customer.phoneStatus === "incomplete" ? "Uluslararası numara gerekli"
      : "Telefon bilgisi yok";
}

export function matchesContactSearch(customer, value, includePreview = false) {
  const query = value.trim().toLocaleLowerCase("tr-TR");
  if (!query) return true;
  const text = [customer.name, customer.country, customer.phoneCountry, customer.phone,
    customer.phoneDisplay, customer.language, customer.owner, includePreview ? customer.preview : ""].join(" ").toLocaleLowerCase("tr-TR");
  if (text.includes(query)) return true;
  // Formatting must not affect phone searches, but mixed text is not a number.
  if (!/^[+\d\s().-]+$/.test(query)) return false;
  let digits = query.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  const international = String(customer.phone || "").replace(/\D/g, "");
  const national = String(customer.phoneNational || "");
  return digits.length >= 3 && Boolean(international) &&
    (international.includes(digits) || Boolean(national) && (`0${national}`.includes(digits)));
}
