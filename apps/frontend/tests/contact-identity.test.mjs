import test from "node:test";
import assert from "node:assert/strict";
import { resolveContactIdentity, matchesContactSearch } from "../src/contactIdentity.js";
import { normalizeConversation } from "../src/liveApi.js";

test("real contact phone wins over a legacy LID without changing provider identity", () => {
  const row = { id: 77, phoneIdentity: "123456789012345@lid", contact: { phone_number: "+905321234567" }, language: "İngilizce" };
  const customer = normalizeConversation(row);
  assert.equal(customer.phone, "+905321234567");
  assert.equal(customer.whatsappLid, row.phoneIdentity);
  assert.equal(customer.phoneIdentity, row.phoneIdentity);
  assert.equal(customer.code, "TR");
  assert.equal(customer.language, "İngilizce");
  assert.equal(row.phoneIdentity, "123456789012345@lid");
});

test("opaque LIDs and national-only numbers cannot become international phones or countries", () => {
  for (const phoneIdentity of ["123456789012345@lid", "905321234567@lid", "123456789012345", "05321234567", "5321234567", "+90", "120363123456789@g.us"]) {
    const customer = normalizeConversation({ phoneIdentity });
    assert.equal(customer.phone, "", phoneIdentity);
    assert.equal(customer.code, "—", phoneIdentity);
    assert.equal(customer.language, "Belirtilmedi");
  }
  assert.equal(resolveContactIdentity({ phoneIdentity: "905321234567@lid" }).phoneStatus, "unresolved");
});

test("full numbering metadata distinguishes countries sharing +1 and +7", () => {
  for (const [phone, country] of [["+74951234567", "RU"], ["+77011234567", "KZ"], ["+14165551234", "CA"], ["+12133734253", "US"], ["+38344123456", "XK"], ["+40722123456", "RO"]]) {
    assert.equal(resolveContactIdentity({ phone }).phoneCountryCode, country, phone);
  }
  assert.equal(resolveContactIdentity({ phone: "+71111111111" }).phoneCountryStatus, "ambiguous");
  assert.equal(resolveContactIdentity({ phone: "+80012345678" }).phoneCountryStatus, "nonGeographic");
});

test("international prefixes and phone JIDs normalize while embedded prose is rejected", () => {
  for (const phone of ["+90 (532) 123-45-67", "0090 532 123 45 67", "905321234567@c.us", "905321234567@s.whatsapp.net"]) {
    assert.equal(resolveContactIdentity({ phone }).phone, "+905321234567");
  }
  assert.equal(resolveContactIdentity({ phone: "Beni +90 532 123 45 67 ara" }).phone, "");
});

test("contact searches accept formatted and national numbers without matching LIDs", () => {
  const customer = normalizeConversation({ contactName: "Test", phone: "+905321234567", language: "Fransızca" });
  for (const query of ["+90 (532) 123-45-67", "00905321234567", "0532 123 45 67", "4567", "Türkiye", "fransızca"]) {
    assert.ok(matchesContactSearch(customer, query), query);
  }
  assert.equal(matchesContactSearch(customer, "yanlış1234"), false);
  assert.equal(matchesContactSearch(customer, "---"), false);
  assert.equal(matchesContactSearch(normalizeConversation({ phoneIdentity: "123456789012345@lid" }), "123456789012345"), false);
});
