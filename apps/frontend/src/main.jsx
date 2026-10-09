import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import {isCatalogPath,readCatalogToken} from './customerCatalog/model.js';
import "./styles.css";
import "./experience.css";
import "./whatsapp.css";

class AppBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="login-gate"><section className="login-card" role="alert"><span className="eyebrow">MELİSA BABY CRM</span><h1>Ekran açılamadı</h1><p>Konuşmalarınız sunucuda korunuyor. Sayfayı yeniden açarak devam edebilirsiniz.</p><button className="primary-button login-button" onClick={() => window.location.reload()}>CRM’yi yeniden aç</button></section></div>;
    return this.props.children;
  }
}

const customerCatalog = isCatalogPath(window.location.pathname);
const catalogToken = customerCatalog ? readCatalogToken() : '';
const App=React.lazy(()=>import('./App.jsx').then(module=>({default:module.App})));
const CustomerCatalog=React.lazy(()=>import('./customerCatalog/CustomerCatalog.jsx'));
if(customerCatalog)document.body.classList.add('customer-catalog-body');

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppBoundary><React.Suspense fallback={<p style={{padding:24}} role="status">Ekran açılıyor…</p>}>{customerCatalog ? <CustomerCatalog token={catalogToken}/> : <App />}</React.Suspense></AppBoundary>
  </React.StrictMode>,
);
