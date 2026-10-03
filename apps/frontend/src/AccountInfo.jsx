import { normalizeAccountIdentity } from './accountIdentity.js';

export default function AccountInfo({ identity }) {
  // Select the allowlist again at the rendering boundary; never enumerate a session.
  const account = normalizeAccountIdentity(identity);
  return <section className="data-card settings-card" aria-label="Hesap bilgileri">
    <div className="data-card-heading"><div><strong>Hesap bilgileri</strong><span>CRM oturumunun bildirdiği kullanıcı</span></div></div>
    {[["CRM kullanıcı ID", account.id], ["Kullanıcı adı", account.username], ["Sunucu rolü", account.role]].map(([label, value]) => <div className="setting-row" key={label}><span>{label}</span><strong>{value || 'Sunucu bildirmedi'}</strong></div>)}
  </section>;
}
