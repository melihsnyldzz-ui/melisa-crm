import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import { App } from "./App.jsx";
import "./styles.css";
import "./experience.css";
import "./whatsapp.css";

const CustomerProductRequestPage = React.lazy(() => import("./customerProductRequest/CustomerProductRequestPage.jsx"));
function RootView() {
  if (/^\/katalog\/?$/.test(window.location.pathname)) return <React.Suspense fallback={<div role="status" style={{padding:24}}>Katalog açılıyor…</div>}><CustomerProductRequestPage /></React.Suspense>;
  return <App />;
}

class AppBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="login-gate"><section className="login-card" role="alert"><span className="eyebrow">MELİSA BABY CRM</span><h1>Ekran açılamadı</h1><p>Konuşmalarınız sunucuda korunuyor. Sayfayı yeniden açarak devam edebilirsiniz.</p><button className="primary-button login-button" onClick={() => window.location.reload()}>CRM’yi yeniden aç</button></section></div>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppBoundary><RootView /></AppBoundary>
  </React.StrictMode>,
);
