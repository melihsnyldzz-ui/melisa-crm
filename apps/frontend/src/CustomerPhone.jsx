import { useEffect, useRef, useState } from "react";
import { Check, ClipboardText, Globe, Phone } from "@phosphor-icons/react";
import { phoneUnavailableLabel, resolveContactIdentity } from "./contactIdentity.js";

export default function CustomerPhone({ customer: source }) {
  const customer = source.phoneStatus ? source : { ...source, ...resolveContactIdentity(source) };
  const context = useRef(null), copyAttempt = useRef(null), mounted = useRef(true);
  if (!context.current || context.current.id !== customer.id || context.current.phone !== customer.phone) {
    context.current = { id: customer.id, phone: customer.phone };
  }
  const [feedback, setFeedback] = useState(null);
  const copyStatus = feedback?.context === context.current ? feedback.status : "";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; copyAttempt.current = null; }; }, []);
  useEffect(() => { setFeedback(null); }, [customer.id, customer.phone]);
  useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setFeedback(current => current === feedback ? null : current), 2500);
    return () => clearTimeout(timer);
  }, [feedback, copyStatus]);
  const copyPhone = async () => {
    const ownContext = context.current, attempt = {};
    copyAttempt.current = attempt;
    setFeedback(null);
    const isCurrent = () => mounted.current && context.current === ownContext && copyAttempt.current === attempt;
    try { await navigator.clipboard.writeText(customer.phone); if (isCurrent()) setFeedback({ context: ownContext, status: "copied" }); }
    catch { if (isCurrent()) setFeedback({ context: ownContext, status: "failed" }); }
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
