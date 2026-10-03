import { useEffect, useState } from "react";
import { Check, ClipboardText, Globe, Phone } from "@phosphor-icons/react";
import { phoneUnavailableLabel, resolveContactIdentity } from "./contactIdentity.js";

export default function CustomerPhone({ customer: source }) {
  const customer = source.phoneStatus ? source : { ...source, ...resolveContactIdentity(source) };
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => { setCopyStatus(""); }, [customer.id, customer.phone]);
  useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setCopyStatus(""), 2500);
    return () => clearTimeout(timer);
  }, [copyStatus]);
  const copyPhone = async () => {
    try { await navigator.clipboard.writeText(customer.phone); setCopyStatus("copied"); }
    catch { setCopyStatus("failed"); }
  };
  return <section className="contact-identity" aria-label="Telefon ve ülke bilgisi">
    <div className="contact-phone-row"><Phone size={19}/><div><span>Telefon</span><strong dir="ltr">{customer.phoneDisplay || customer.phone || phoneUnavailableLabel(customer)}</strong></div>
      {customer.phone ? <button type="button" onClick={copyPhone} aria-label="Telefon numarasını kopyala" title="Numarayı kopyala">{copyStatus === "copied" ? <Check size={20}/> : <ClipboardText size={20}/>}</button> : null}
    </div>
    {customer.phone ? <div className="phone-country-row"><Globe size={19}/><div><span>Numaranın ülkesi / bölgesi</span><strong>{customer.phoneCountry || (customer.phoneCountryStatus === "nonGeographic" ? "Uluslararası servis numarası" : "Ülke kesinleşmedi")}{customer.countryCallingCode ? <em>{customer.countryCallingCode}</em> : null}</strong><small>Telefon koduna göre; müşterinin konumunu belirtmez.</small></div></div>
      : <p className="identity-note">{customer.phoneStatus === "unresolved" ? "WhatsApp kimliği (LID) mevcut. Ülke için gerçek numara gerekiyor." : "Ülke tespiti için ülke koduyla birlikte telefon numarası gerekli."}</p>}
    <span className="copy-feedback" role="status">{copyStatus === "copied" ? "Numara kopyalandı" : copyStatus === "failed" ? "Kopyalanamadı. Numarayı seçip kopyalayabilirsiniz." : ""}</span>
  </section>;
}
