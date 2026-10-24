import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise, ArrowLeft, ArrowRight, Barcode, Bell, BookOpen, Butterfly, CalendarCheck, CaretDown, ChartBar, ChatCircleDots, Clock, Desktop, Info,
  Check, CheckCircle, ClipboardText, DotsThree, DownloadSimple, EnvelopeSimple,
  DeviceMobile, FilePdf, FileText, Gear, Globe, Image, InstagramLogo, Link, MagnifyingGlass, MapPin,
  Minus, MusicNote, NotePencil, Package, Paperclip, PaperPlaneTilt, Phone, PhoneCall, Plus, ShoppingBagOpen,
  SlidersHorizontal, Smiley, Sparkle, Tag, Translate, UserCircle, UserPlus,
  Users, VideoCamera, WhatsappLogo, X,
} from "@phosphor-icons/react";
import {
  applyReadReceipts, canAssignConversation, conversationRevision, effectiveInboxSummary, liveApi,
  mergeInboxConversations, mergeOlderConversation, reconcileBootstrapConversations, sameConversationHistoryScope, saveAccessKey, savedAccessKey, sortInboxByActivity,
} from "./liveApi";
import { matchesContactSearch, phoneUnavailableLabel } from "./contactIdentity.js";
import CustomerPhone from "./CustomerPhone.jsx";
import CrmUserInventory from './CrmUserInventory.jsx';
import { createPermissionRefresh } from "./permissionRefresh.js";
import { POLL_INTERVAL, queueForegroundRead, finishForegroundRead, chatPollingPaused } from "./requestControl.js";
import { ATTACHMENT_ACCEPT, prepareAttachment, validateSendPayload, classifySendFailure, outboundRecoveryState, selectedConversation, attachmentStatusText, attachmentMediaLabel, createSendSessionScope, interruptedSendStates } from "./outboundMedia.js";

import { createPreviewLedger, upsertDraftProduct } from "./orderPreview.js";
import { newRequestId } from "./lib/requestId.js";
import { nextIncomingTranslation } from "./automaticTranslation.js";
import { selectedSaleLines, selectionMessage } from "./catalog/productActions.js";
import ERPOrderDialog from "./ERPOrderDialog.jsx";
import {createNativeOrderStore} from './lib/nativeOrder.js';
import {nativeOrderReceiptCard,restoreNativeOrderHistory} from './lib/nativeOrderHistory.js';
import CatalogWorkspace from "./catalog/CatalogWorkspace.jsx";
import StaffProductRequests from './customerProductRequest/StaffProductRequests.jsx';
import {createCatalogPhotoCache} from './catalog/photoCache.js';
import JitsiPilot from "./video/JitsiPilot.jsx";
import AccountInfo from "./AccountInfo.jsx";
import SalesSuggestion from "./SalesSuggestion.jsx";
import { createSalesDraftFlow, salesDraftContextKey } from "./lib/salesDraft.js";
import SalesRulesSettings from "./SalesRulesSettings.jsx";
import { isMobilePreviewPath, accountIdentityKey } from "./accountIdentity.js";
import { clearCatalogStorage, safeCatalogStorage } from "./catalog/model.js";
import { catalogSource as initialCatalogSource } from "./catalog/source.js";
import { closeCatalogSession } from "./catalog/logout.js";
import { createSessionLoader, createTerminalSessionLoader, sessionReadIsCurrent } from "./sessionLoader.js";
import {linkedTerminalContext} from './terminalSessionIdentity.js';
import { CATALOG_ENABLED, CATALOG_CRM_ONLY_ENABLED, CATALOG_EXISTING_STOCK_ENABLED } from "./releaseCapabilities.js";
import { createTextDraftStorage, textDraftActorScope } from "./lib/textDraftStorage.js";
import { rememberTerminalShare, verifyTerminalShare, clearTerminalShare } from './terminalShareProof.js';
import { terminalEntry, bindTerminalNavigation, bindTerminalSessionNavigation } from './terminalNavigation.js';
import './terminal.css';
import {testAdminAvailable,testRoleLogin,chooseTestRoleLogin,bootstrapTestAdmin} from './testAdmin.js';
import {initialSessionAction,isSemihTestUser} from './browserNormalSession.js';

const team = ["Atanmamış", "Ahmet Yılmaz", "Zeynep Kaya", "Murat Demir", "Merve Demir"];

const conversationsSeed = [
  { id: "lina", initials: "LC", name: "Lina Chahine", country: "Fransa", code: "FR", language: "Fransızca", wait: "14 dk", unread: 3, owner: "Atanmamış", channel: "whatsapp", preview: "Merhaba, 6–24 ay tulumların güncel fiyat listesini alabilir miyim?", foreign: "Bonjour, pouvez-vous m’envoyer la liste de prix actuelle des combinaisons 6–24 mois ?", translation: "Merhaba, 6–24 ay tulumların güncel fiyat listesini gönderebilir misiniz?", phone: "+33 6 12 34 56 78", email: "lina.chahine@example.fr" },
  { id: "mohamed", initials: "MK", name: "Mohamed Khaled", country: "Mısır", code: "EG", language: "İngilizce", wait: "32 dk", unread: 1, owner: "Ahmet Yılmaz", channel: "email", preview: "These colors look great. Can you share MOQ and delivery time?", foreign: "These colors look great. Can you share MOQ and delivery time?", translation: "Bu renkler harika görünüyor. Minimum sipariş ve teslim süresini paylaşabilir misiniz?", phone: "+20 100 234 81 05", email: "m.khaled@example.com" },
  { id: "sara", initials: "SR", name: "Sara Rossi", country: "İtalya", code: "IT", language: "İtalyanca", wait: "1 sa", unread: 2, owner: "Atanmamış", channel: "instagram", preview: "Do you have the new winter collection catalog?", foreign: "Avete il catalogo della nuova collezione invernale?", translation: "Yeni kış koleksiyonunun kataloğu var mı?", phone: "+39 340 218 72 11", email: "sara.rossi@example.it" },
  { id: "ahmed", initials: "AT", name: "Ahmed Talal", country: "Suudi Arabistan", code: "SA", language: "Arapça", wait: "2 sa", unread: 1, owner: "Zeynep Kaya", channel: "whatsapp", preview: "Fiyat listesi için teşekkürler. Nakliye süresi nedir?", foreign: "شكرًا على قائمة الأسعار. ما هي مدة الشحن؟", translation: "Fiyat listesi için teşekkürler. Nakliye süresi nedir?", phone: "+966 50 281 90 44", email: "ahmed@example.sa" },
  { id: "elena", initials: "EC", name: "Elena Petrova", country: "Bulgaristan", code: "BG", language: "Bulgarca", wait: "3 sa", unread: 4, owner: "Zeynep Kaya", channel: "email", preview: "2–5 yaş takım modellerinde hangi renkler mevcut?", foreign: "Какви цветове са налични за комплектите 2–5 години?", translation: "2–5 yaş takım modellerinde hangi renkler mevcut?", phone: "+359 88 412 09 31", email: "elena@example.bg" },
  { id: "james", initials: "JD", name: "James O’Connor", country: "İngiltere", code: "GB", language: "İngilizce", wait: "5 sa", unread: 1, owner: "Murat Demir", channel: "whatsapp", preview: "We are ready to place an order. What is the next step?", foreign: "We are ready to place an order. What is the next step?", translation: "Sipariş vermeye hazırız. Sonraki adım nedir?", phone: "+44 7700 900 418", email: "james@example.co.uk" },
];

const translations = {
  Profesyonel: { foreign: "Oui, ces modèles sont disponibles en trois coloris : crème, rose poudré et menthe. La quantité minimale est de 24 pièces par modèle (1 série). Je vous envoie le stock actuel, le catalogue et le tableau des tailles.", back: "Evet, bu modeller krem, pudra pembe ve mint olmak üzere üç renkte mevcuttur. Minimum miktar model başına 24 adettir (1 seri). Güncel stok, katalog ve beden tablosunu gönderiyorum." },
  Samimi: { foreign: "Bien sûr Lina ! Nous avons ces modèles en crème, rose poudré et menthe. Le minimum est de 24 pièces par modèle. Je vous partage tout de suite le stock, le catalogue et les tailles.", back: "Tabii Lina! Bu modeller krem, pudra pembe ve mint renklerinde mevcut. Minimum model başına 24 adet. Stok, katalog ve bedenleri hemen paylaşıyorum." },
  Kısa: { foreign: "Oui, disponible en crème, rose poudré et menthe. Minimum : 24 pièces par modèle. Je vous envoie le stock, le catalogue et les tailles.", back: "Evet; krem, pudra pembe ve mint mevcut. Minimum 24 adet/model. Stok, katalog ve bedenleri gönderiyorum." },
};

const languageSamples = {
  mohamed: {
    Profesyonel: "Yes, these models are available in cream, powder pink and mint. The minimum order is 24 pieces per model (1 series). I will send you the current stock, catalog and size chart.",
    Samimi: "Of course! We have these models in cream, powder pink and mint. The minimum is 24 pieces per model. I’ll share the stock, catalog and sizes right away.",
    Kısa: "Available in cream, powder pink and mint. Minimum: 24 pieces per model. I’m sending the stock, catalog and sizes.",
  },
  sara: {
    Profesyonel: "Sì, questi modelli sono disponibili in crema, rosa cipria e menta. L’ordine minimo è di 24 pezzi per modello (1 serie). Le invio lo stock attuale, il catalogo e la tabella taglie.",
    Samimi: "Certo! Abbiamo questi modelli in crema, rosa cipria e menta. Il minimo è di 24 pezzi per modello. Le condivido subito stock, catalogo e taglie.",
    Kısa: "Disponibile in crema, rosa cipria e menta. Minimo: 24 pezzi per modello. Invio stock, catalogo e taglie.",
  },
  ahmed: {
    Profesyonel: "نعم، هذه الموديلات متوفرة بألوان الكريمي والوردي البودرة والنعناعي. الحد الأدنى 24 قطعة لكل موديل. سأرسل لكم المخزون الحالي والكتالوج وجدول المقاسات.",
    Samimi: "بالتأكيد! الموديلات متوفرة بالكريمي والوردي البودرة والنعناعي. الحد الأدنى 24 قطعة لكل موديل، وسأرسل المخزون والكتالوج والمقاسات الآن.",
    Kısa: "متوفر بالكريمي والوردي والنعناعي. الحد الأدنى 24 قطعة لكل موديل. سأرسل المخزون والكتالوج والمقاسات.",
  },
  elena: {
    Profesyonel: "Да, тези модели се предлагат в кремаво, пудрено розово и мента. Минималното количество е 24 броя на модел. Ще Ви изпратя наличностите, каталога и таблицата с размери.",
    Samimi: "Разбира се! Имаме тези модели в кремаво, пудрено розово и мента. Минимумът е 24 броя на модел. Веднага изпращам наличности, каталог и размери.",
    Kısa: "Налични цветове: кремаво, розово и мента. Минимум 24 броя на модел. Изпращам каталога и размерите.",
  },
  james: {
    Profesyonel: "Yes, these models are available in cream, powder pink and mint. The minimum order is 24 pieces per model (1 series). I will send you the current stock, catalog and size chart.",
    Samimi: "Of course! We have these models in cream, powder pink and mint. The minimum is 24 pieces per model. I’ll share the stock, catalog and sizes right away.",
    Kısa: "Available in cream, powder pink and mint. Minimum: 24 pieces per model. I’m sending the stock, catalog and sizes.",
  },
};

const navTop = [
  ["Gelen Kutusu", ChatCircleDots, 12], ["Konuşmalar", ChatCircleDots],
  ["Atanmamışlar", UserPlus], ["Müşteriler", Users], ["Raporlar", ChartBar],
];

const quickActions = [["Video", VideoCamera]];
const UNCERTAIN_SENDS_KEY = "melisa-crm-uncertain-sends";
const READ_RECEIPTS_KEY = "melisa-crm-read-receipts";

function loadUncertainSends() {
  try { return JSON.parse(window.sessionStorage.getItem(UNCERTAIN_SENDS_KEY) || "{}"); }
  catch { return {}; }
}

function loadReadReceipts() {
  try { return JSON.parse(window.sessionStorage.getItem(READ_RECEIPTS_KEY) || "{}"); }
  catch { return {}; }
}

const emptyLiveConversation = {
  id: "", initials: "—", name: "Konuşma seçin", country: "", code: "—", language: "",
  wait: "", unread: 0, owner: "Atanmamış", channel: "whatsapp", preview: "", messages: [],
};

const productSeed = [
  { id: "MB-24018", barcode: "8690124024018", name: "Kapüşonlu Welsoft Tulum", group: "0–24 Ay", colors: ["Krem", "Pudra", "Mint"], price: "€12,90", stock: 184, series: "8'li seri" },
  { id: "MB-24031", barcode: "8690124024031", name: "Triko Örgü Tulum", group: "0–12 Ay", colors: ["Ekru", "Bej"], price: "€14,50", stock: 96, series: "6'lı seri" },
  { id: "MB-25104", barcode: "8690124025104", name: "Üçlü Body Set", group: "0–12 Ay", colors: ["Ekru", "Mavi", "Pembe"], price: "€6,80", stock: 320, series: "12'li seri" },
  { id: "MB-25127", barcode: "8690124025127", name: "Nakışlı Kız Bebek Takım", group: "6–24 Ay", colors: ["Pudra", "Lila"], price: "€11,40", stock: 72, series: "8'li seri" },
  { id: "MB-25142", barcode: "8690124025142", name: "Erkek Bebek Sweat Takım", group: "6–24 Ay", colors: ["Bej", "Yeşil"], price: "€10,90", stock: 128, series: "8'li seri" },
  { id: "MB-25206", barcode: "8690124025206", name: "Pamuklu Pijama Takımı", group: "2–5 Yaş", colors: ["Krem", "Lacivert"], price: "€9,60", stock: 144, series: "8'li seri" },
];

const catalogSeed = [
  { id: "CAT-AW26", title: "2026 Sonbahar–Kış", detail: "184 ürün · TR/EN", updated: "Bugün", link: "katalog.melisababy.com/aw26" },
  { id: "CAT-NEW", title: "Yeni Gelenler", detail: "48 ürün · TR/EN", updated: "2 saat önce", link: "katalog.melisababy.com/yeni" },
  { id: "CAT-0-24", title: "0–24 Ay Bebek", detail: "126 ürün · TR/EN", updated: "Dün", link: "katalog.melisababy.com/0-24" },
  { id: "CAT-2-5", title: "2–5 Yaş Çocuk", detail: "93 ürün · TR/EN", updated: "Dün", link: "katalog.melisababy.com/2-5" },
];

const priceListSeed = { id: "PRICE-EUR-2026", title: "Güncel EUR Fiyat Listesi", detail: "Tüm aktif ürünler · EUR · PDF", updated: "Bugün", link: "fiyat.melisababy.com/eur-2026" };

const notificationSeed = [
  { id: 1, title: "Yeni atanmamış müşteri", detail: "Lina Chahine fiyat ve katalog istedi.", time: "2 dk", type: "customer", unread: true },
  { id: 2, title: "Cevap süresi aşılıyor", detail: "Mohamed Khaled 32 dakikadır yanıt bekliyor.", time: "6 dk", type: "waiting", unread: true },
  { id: 3, title: "Video görüşme talebi", detail: "Sara Rossi yeni koleksiyonu canlı görmek istiyor.", time: "18 dk", type: "video", unread: true },
];

const draftOrderSeed = [
  { id: "TS-260925-014", customer: "James O’Connor", owner: "Murat Demir", total: "€ 2.184,00", lines: 4, updated: "12 dk önce", status: "Kontrol Bekliyor" },
  { id: "TS-260925-013", customer: "Elena Petrova", owner: "Zeynep Kaya", total: "€ 1.148,40", lines: 3, updated: "48 dk önce", status: "Hazırlanıyor" },
  { id: "TS-260924-009", customer: "Mohamed Khaled", owner: "Ahmet Yılmaz", total: "€ 3.920,00", lines: 7, updated: "Dün", status: "Onay Bekliyor" },
];

function ChannelIcon({ channel, size = 17 }) {
  if (channel === "instagram") return <InstagramLogo size={size} weight="fill" />;
  if (channel === "email") return <EnvelopeSimple size={size} weight="fill" />;
  return <WhatsappLogo size={size} weight="fill" />;
}

function Avatar({ initials, compact = false }) {
  return <span className={compact ? "avatar avatar-compact" : "avatar"}>{initials}</span>;
}

function Modal({ title, children, onClose }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const focusable = () => [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]') || [])].filter(node => node.getClientRects().length > 0);
    focusable()[0]?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== "Tab") return;
      const nodes = focusable(); const first = nodes[0]; const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus?.(); };
  }, [title]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header"><div><span className="eyebrow">MELİSA BABY CRM</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Kapat"><X size={20} /></button></header>
        {children}
      </section>
    </div>
  );
}

function LoginGate({ credentials, onChange, onConnect, busy, error, retryAvailable, onRetry, onChangeAccount, extraAction, continueUser, onContinue, terminal = false, linkedTerminal = false }) {
  return (
    <div className={`login-gate${terminal ? " terminal-login" : ""}`}>
      <section className="login-card" aria-label="Melisa CRM güvenli giriş">
        <span className="login-mark"><Butterfly size={34} weight="duotone" /></span>
        {extraAction}
        <span className="eyebrow">{terminal ? "MELİSA · PERSONEL" : import.meta.env?.VITE_CRM_TEST === "1" ? "MELİSA BABY · TEST CRM" : "MELİSA BABY · CANLI CRM"}</span>
        <h1>{terminal ? "Müşterilerim" : "CRM Yönetim Merkezi"}</h1>
        <p>{linkedTerminal ? 'Terminal oturumunuz ve CRM hesabınız doğrulanıyor.' : continueUser ? 'Bu cihazda doğrulanmış Semih TEST hesabınızla devam edebilirsiniz.' : 'Gerçek WhatsApp konuşmalarınıza erişmek için CRM hesabınızla giriş yapın.'}</p>
        {continueUser ? <><button className="primary-button login-button" onClick={onContinue} disabled={busy}>{busy ? 'Bağlantı kuruluyor…' : 'Semih olarak devam et'}</button><button className="secondary-button" onClick={onChangeAccount} disabled={busy}>Farklı hesapla giriş yap</button></> : null}
        {!retryAvailable && !continueUser ? <><label>Kullanıcı adı<input value={credentials.username} onChange={(event) => onChange({ ...credentials, username: event.target.value })} autoComplete="username" placeholder="Kullanıcı adı" autoFocus /></label>
        <label>Parola<input type="password" value={credentials.password} onChange={(event) => onChange({ ...credentials, password: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !busy) onConnect(); }} autoComplete="current-password" placeholder="Parola" /></label></> : continueUser ? null : <p>Kaydedilen CRM oturumunuzla bağlantı kuruluyor.</p>}
        {error ? <div className="login-error">{error}</div> : null}
        {continueUser ? null : retryAvailable ? <><button className="primary-button login-button" onClick={onRetry} disabled={busy}>{busy ? "Bağlantı kuruluyor…" : "Bağlantıyı yeniden dene"}</button>{onChangeAccount?<button className="secondary-button" onClick={onChangeAccount} disabled={busy}>Farklı hesapla giriş yap</button>:null}</> : <button className="primary-button login-button" onClick={onConnect} disabled={busy || !credentials.username.trim() || !credentials.password}>{busy ? "Giriş yapılıyor…" : "CRM’e Giriş Yap"}</button>}
        <small>{continueUser ? 'Yalnız TEST hesabı. Oturumu kapattığınızda bu cihazın devam erişimi iptal edilir.' : 'Parolanız saklanmaz. Oturum sunucuda doğrulanır.'}</small>
      </section>
    </div>
  );
}

function messageClock(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function safeMediaUrl(value) {
  if (!String(value || "").trim()) return "";
  if (/^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(String(value)) && String(value).length <= 8_000_050) return String(value);
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function formatFileSize(value) {
  const bytes = Number(value) || 0;
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function MediaAttachment({ attachment, createdAt, outgoing }) {
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFailed, setViewerFailed] = useState(false);
  const url = safeMediaUrl(attachment.url);
  const thumbnail = safeMediaUrl(attachment.thumbnailUrl) || url;
  const label = attachment.fileName || (attachment.type === "image" ? "Fotoğraf" : attachment.type === "video" ? "Video" : attachment.type === "audio" ? "Sesli mesaj" : attachment.type === "location" ? "Konum" : "Dosya");

  useEffect(() => {
    if (!viewerOpen) return undefined;
    const closeViewer = (event) => { if (event.key === "Escape") setViewerOpen(false); };
    window.addEventListener("keydown", closeViewer);
    return () => window.removeEventListener("keydown", closeViewer);
  }, [viewerOpen]);

  if (attachment.type === "image" && thumbnail && !failed) {
    const viewerUrl = viewerFailed ? thumbnail : (url || thumbnail);
    return <><button className="message-media image-media" onClick={() => setViewerOpen(true)} aria-label={`${label} görselini büyüt`}><img src={thumbnail} alt={label} loading="lazy" onError={() => setFailed(true)} /><span className="message-media-time">{messageClock(createdAt)}{outgoing ? <CheckCircle size={13} weight="fill" /> : null}</span></button>{viewerOpen ? <div className="media-viewer" role="dialog" aria-modal="true" aria-label={`${label} görüntüleyici`} onMouseDown={() => setViewerOpen(false)}><header onMouseDown={(event) => event.stopPropagation()}><strong>{label}</strong><div>{viewerUrl ? <a href={viewerUrl} download={attachment.fileName || "melisa-crm-gorsel"} aria-label="Görseli indir"><DownloadSimple size={22} /></a> : null}<button onClick={() => setViewerOpen(false)} aria-label="Görseli kapat"><X size={24} /></button></div></header><div className="media-viewer-body" onMouseDown={(event) => event.stopPropagation()}><img className={viewerUrl.startsWith("data:image/") ? "preview-only-image" : ""} src={viewerUrl} alt={label} onError={() => setViewerFailed(true)} />{viewerUrl.startsWith("data:image/") ? <span className="media-preview-note">Düşük çözünürlüklü önizleme</span> : null}</div></div> : null}</>;
  }
  if (attachment.type === "video" && url && !failed) {
    return <div className="message-media video-media"><video src={url} controls preload="metadata" playsInline onError={() => setFailed(true)}>{label}</video></div>;
  }
  if (attachment.type === "audio" && url && !failed) {
    return <div className="message-media audio-media"><strong>{label}</strong><audio src={url} controls preload="metadata" onError={() => setFailed(true)} /></div>;
  }
  return <a className="message-media file-media" href={url || undefined} target={url ? "_blank" : undefined} rel={url ? "noreferrer" : undefined} aria-disabled={!url}><span><FileText size={24} weight="duotone" /></span><div><strong>{label}</strong><small>{formatFileSize(attachment.fileSize) || (failed ? "Önizleme açılamadı" : url ? "Dosyayı aç" : "Medya bağlantısı bulunamadı")}</small></div>{url ? <DownloadSimple size={20} /> : null}</a>;
}

function MessageAttachments({ attachments = [], createdAt, outgoing = false }) {
  if (!attachments.length) return null;
  return <div className="message-media-stack">{attachments.map((attachment, index) => <MediaAttachment key={attachment.id || `${attachment.url}-${index}`} attachment={attachment} createdAt={createdAt} outgoing={outgoing} />)}</div>;
}

function OutboundPlaybackPreview({ media }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [media?.dataUrl]);
  if (!media?.dataUrl || !["audio", "video"].includes(media.mediaType)) return null;
  const label = attachmentMediaLabel(media);
  if (failed) return <span role="alert">{label} önizlemesi bu tarayıcıda açılamadı. Dosyayı kaldırıp desteklenen başka bir dosya seçebilirsiniz.</span>;
  const props = { src: media.dataUrl, controls: true, preload: "metadata", "aria-label": `${media.fileName} önizlemesi`, onError: () => setFailed(true), style: { width: "100%", maxWidth: 320, display: "block", marginTop: 8 } };
  return media.mediaType === "audio" ? <audio {...props} /> : <video {...props} playsInline style={{ ...props.style, maxHeight: 180 }} />;
}

export function App() {
  const entry = useMemo(() => terminalEntry(window.location), []);
  const linkedTerminal = useMemo(()=>linkedTerminalContext(window),[]);
  const terminalNavigation = useRef(null);
  const [online, setOnline] = useState(() => window.navigator?.onLine !== false);
  const [translationDisplay, setTranslationDisplay] = useState('both');
  const activateTerminal = () => {
    setActiveView('Gelen Kutusu');
    // Returning from another ERP module keeps the existing conversation/composer.
    // Force fresh permission and selected-conversation reads through their guards.
    conversationPollRef.current.at = 0;
    setRefreshNonce(value => value + 1);
    if (liveKeyRef.current) void permissionRefreshRef.current?.().catch(() => {});
  };
  useEffect(() => {
    if (!entry.enabled) return;
    terminalNavigation.current = linkedTerminal
      ? bindTerminalSessionNavigation({window,entry,sessionLoader:sessionLoaderRef.current,onActivated:activateTerminal,onClose:()=>closeLiveSession('',true)})
      : bindTerminalNavigation({ window, entry, onActivate: activateTerminal, onLogout: () => closeLiveSession('',true) });
    const update = () => setOnline(window.navigator?.onLine !== false);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { terminalNavigation.current?.close(); window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, [entry]);
  const [liveMode] = useState(() => !(import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1"));
  const [activeView, setActiveView] = useState("Gelen Kutusu");
  const [conversations, setConversations] = useState(() => liveMode ? [] : conversationsSeed.map((item) => ({ ...item, waitingForReply: true })));
  const [selectedId, setSelectedId] = useState(() => liveMode ? "" : "lina");
  const [filter, setFilter] = useState("Tüm Konuşmalar");
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [rightTab, setRightTab] = useState("AI Çeviri");
  const [translatedIncoming, setTranslatedIncoming] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [tone, setTone] = useState("Profesyonel");
  const [draftState, setDrafts] = useState({});
  const [draftStorageWarning, setDraftStorageWarning] = useState(false);
  const textDraftStorageRef = useRef(null);
  if (!textDraftStorageRef.current) textDraftStorageRef.current = createTextDraftStorage();
  const drafts = liveMode && textDraftStorageRef.current.isActive() ? textDraftStorageRef.current.visibleDrafts(conversations) : draftState;
  const [attachments, setAttachments] = useState({});
  const [sendStates, setSendStates] = useState({});
  const [salesSuggestion, setSalesSuggestion] = useState({busy:false,preview:null,error:''});
  const salesDraftFlowRef = useRef(null);
  const salesDraftContextRef = useRef(null);
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [chatMenu, setChatMenu] = useState(false);
  const [countryFilterOpen, setCountryFilterOpen] = useState(false);
  const attachmentRef = useRef({});
  const fileInputRef = useRef(null);
  const fileChoiceRef = useRef(null);
  const [fileAccept, setFileAccept] = useState(Object.values(ATTACHMENT_ACCEPT).join(","));
  const pendingAttachment = attachments[selectedId];
  const sendState = sendStates[selectedId];
  const draft = drafts[selectedId] || "";
  const applyStoredDrafts = (result) => { setDrafts(result.drafts); setDraftStorageWarning(!result.persisted); };
  const forgetDraft = (id) => {
    if (textDraftStorageRef.current.isActive()) applyStoredDrafts(textDraftStorageRef.current.forget(id));
    else setDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
  };
  const setDraft = (value) => {
    if (!liveMode || !textDraftStorageRef.current.isActive()) { setDrafts((current) => ({ ...current, [selectedId]: value })); return; }
    applyStoredDrafts(textDraftStorageRef.current.set(selectedConversation(conversationsRef.current, selectedId), value));
  };
  const [compactMode, setCompactMode] = useState(() => { if (isMobilePreviewPath(window.location.pathname)) return true; try { return window.localStorage.getItem("melisa-crm-layout") === "terminal"; } catch { return false; } });
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [smallScreen, setSmallScreen] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [translationReady, setTranslationReady] = useState(false);
  const [incomingTranslations, setIncomingTranslations] = useState({});
  // A previous tab's preference never consents to new paid calls on page opening.
  const [automaticTranslation, setAutomaticTranslation] = useState(false);
  const automaticTranslationRef = useRef(automaticTranslation); automaticTranslationRef.current = automaticTranslation;
  const automaticTranslationBusy = useRef(false);
  const [translationResult, setTranslationResult] = useState(null);
  const [translationBusy, setTranslationBusy] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("auto");
  const [uncertainSends, setUncertainSends] = useState(loadUncertainSends);
  const uncertainSendsRef = useRef(uncertainSends); uncertainSendsRef.current = uncertainSends;
  const [readReceipts, setReadReceipts] = useState(loadReadReceipts);
  const [sentMessages, setSentMessages] = useState([]);
  const [modal, setModal] = useState(null);
  const [catalogSource,setCatalogSource] = useState(initialCatalogSource);
  const catalogSessionRef = useRef(null);
  const catalogContextRef = useRef(null);
  const [toast, setToast] = useState("");
  const [roleMenu, setRoleMenu] = useState(false);
  const [role, setRole] = useState("Müdür");
  const [liveSession, setLiveSession] = useState(null);
  const [manualTestLogin,setManualTestLogin]=useState(testRoleLogin);
  const [semihEntry,setSemihEntry]=useState({checked:false,enabled:false,user:null,error:''});
  const testAdminAvailableHere=!entry.enabled&&testAdminAvailable();
  const testAdminEnabled=testAdminAvailableHere&&semihEntry.checked&&!semihEntry.enabled&&!semihEntry.error;
  const testBootstrapRef=useRef(null);
  const liveSessionRef = useRef(liveSession); liveSessionRef.current = liveSession;
  const [liveKey, setLiveKey] = useState(() => savedAccessKey());
  const [normalResumeAvailable,setNormalResumeAvailable] = useState(false);
  const [permissionCheck, setPermissionCheck] = useState({ busy: false, error: "" });
  const [loginCredentials, setLoginCredentials] = useState({ username: "", password: "" });
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [agents, setAgents] = useState([]);
  const [agentLoadState,setAgentLoadState] = useState({busy:false,error:''});
  const [detailLoadState,setDetailLoadState] = useState({id:'',busy:false,error:''});
  const [olderHistoryState,setOlderHistoryState] = useState({scope:null,busy:false,error:''});
  const [summary, setSummary] = useState({ total: 0, unread: 0, pendingHumanReply: 0, unassigned: 0 });
  const [inboxCapabilities, setInboxCapabilities] = useState(null);
  const inboxCapabilitiesRef = useRef(null);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(productSeed[0].id);
  const [productQuantity, setProductQuantity] = useState(1);
  const [productDrafts, setProductDrafts] = useState({});
  const [erpOrderContext,setErpOrderContext] = useState(null);
  const [erpDraftContexts,setErpDraftContexts]=useState({});
  const pendingProducts = productDrafts[String(selectedId)] || [];
  const setPendingProducts = (update) => {
    const recipient = String(selectedId);
    setProductDrafts(items => ({ ...items, [recipient]: typeof update === 'function' ? update(items[recipient] || []) : update }));
  };
  const orderPreviewLedgerRef = useRef(null);
  if (!orderPreviewLedgerRef.current) orderPreviewLedgerRef.current = createPreviewLedger();
  const [pendingCatalogs, setPendingCatalogs] = useState([]);
  const [notifications, setNotifications] = useState(() => liveMode ? [] : notificationSeed);
  const [draftOrders, setDraftOrders] = useState(() => liveMode ? [] : draftOrderSeed);
  const [draftOrderStorageWarning,setDraftOrderStorageWarning] = useState('');
  const [videoContext, setVideoContext] = useState(null);
  const videoContextRef = useRef(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [statusClock, setStatusClock] = useState(Date.now);
  const [syncError, setSyncError] = useState("");
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [remainingConversationsError, setRemainingConversationsError] = useState("");
  const [nextInboxOffset, setNextInboxOffset] = useState(100);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [desktopInspectorOpen, setDesktopInspectorOpen] = useState(false);
  const [assignmentTargetId, setAssignmentTargetId] = useState(null);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [tabletQueueOpen, setTabletQueueOpen] = useState(false);
  const [tabletInspectorOpen, setTabletInspectorOpen] = useState(false);
  const chatScrollRef = useRef(null);
  const olderHistoryReadRef = useRef(null);
  const olderHistoryAnchorRef = useRef(null);
  const readReceiptsRef = useRef(readReceipts);
  const conversationsRef = useRef(conversations);
  const backgroundPageLoadRef = useRef("");
  const remainingReadRef = useRef(null);
  const bootstrapReconcileRef = useRef(null);
  const olderPageOffsetRef = useRef(100);
  const olderPageCheckedAtRef = useRef(Date.now());
  const inboxPollRef = useRef({ at: 0, inFlight: false });
  const permissionPollRef = useRef({ key: '', at: 0 });
  const conversationPollRef = useRef({ at: 0, id: "" });
  const paginationRef = useRef(null);
  paginationRef.current = { offset: nextInboxOffset, total: summary.total };
  const sendInFlightRef = useRef(false);
  const sendScopeRef = useRef(createSendSessionScope());
  const liveKeyRef = useRef(liveKey);
  liveKeyRef.current = liveKey;
  const permissionRefreshRef = useRef(null);
  const sessionLoaderRef = useRef(null);
  const uiOperationEpochRef = useRef(0);
  const outgoingTranslationRunRef = useRef(0);
  const targetLanguageRef = useRef(targetLanguage); targetLanguageRef.current = targetLanguage;
  const sessionCallbacksRef = useRef(null);
  const previousChatRef = useRef("");
  const nearBottomRef = useRef(true);
  const sessionIdentityRef = useRef("");
  const composerRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const staffMode = liveSession?.role === "personel";
  const terminalMode = entry.enabled || compactMode || staffMode;
  const singlePane = smallScreen || terminalMode;
  const canAssign = !liveSession || canAssignConversation(liveSession,inboxCapabilities);
  const applyInboxCapabilities = (value) => { inboxCapabilitiesRef.current=value||null;setInboxCapabilities(value||null); };
  const roleLabel = liveSession?.testAdmin ? 'TEST ADMIN' : liveSession ? ({ patron: "Patron", mudur: "Müdür", personel: "Personel" }[liveSession.role] || "Personel") : role;
  const userName = liveSession?.name || liveSession?.username || roleLabel;
  const selectedChatVisible = !singlePane || mobileChatOpen;
  const changeLayout = (terminal) => {
    setCompactMode(terminal); try { window.localStorage.setItem("melisa-crm-layout", terminal ? "terminal" : "desktop"); } catch {}
    setActiveView("Gelen Kutusu"); setMobileChatOpen(false); setTabletInspectorOpen(false); setDesktopInspectorOpen(false); setFilter("Tüm Konuşmalar");
  };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setSmallScreen(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateHeight = () => {
      if (!viewport || viewport.scale !== 1) return;
      document.documentElement.style.setProperty("--crm-height", `${viewport.height}px`);
    };
    updateHeight(); viewport?.addEventListener("resize", updateHeight);
    return () => viewport?.removeEventListener("resize", updateHeight);
  }, []);

  const selected = selectedConversation(conversations, selectedId) || emptyLiveConversation;
  const canAssignSelected = !liveSession || Boolean(selected.id && canAssignConversation(liveSession,inboxCapabilities,selected));
  const assignmentTarget = conversations.find(item=>String(item.id)===String(assignmentTargetId));
  const canAssignTarget = !liveSession || Boolean(assignmentTarget && canAssignConversation(liveSession,inboxCapabilities,assignmentTarget));
  useEffect(()=>{
    if(modal==='assign'&&!canAssignTarget){setModal(null);setAssignmentTargetId(null);}
  },[modal,canAssignTarget]);
  const [customerRequestsEnabled,setCustomerRequestsEnabled]=useState(false);
  useEffect(()=>{
    if(import.meta.env?.VITE_CRM_TEST!=='1')return;
    const controller=new AbortController();
    void fetch('/api/customer-product-request-state',{cache:'no-store',signal:controller.signal}).then(response=>response.ok?response.json():null)
      .then(payload=>{if(!controller.signal.aborted)setCustomerRequestsEnabled(payload?.success===true&&payload.data?.enabled===true);}).catch(()=>{});
    return()=>controller.abort();
  },[]);
  const requestPhotoCache=useMemo(()=>createCatalogPhotoCache({fetchPhoto:(id,options)=>liveApi.canonicalCatalogPhoto(liveKey,id,options),isCurrent:()=>liveKeyRef.current===liveKey&&Boolean(liveKey)}),[liveKey]);
  useEffect(()=>()=>requestPhotoCache.clear(),[requestPhotoCache]);
  const loadRequestPhoto=useCallback(item=>requestPhotoCache.load({...item,hasSourceImage:true,photoStatus:'guarded-path'},{variant:'original'}),[requestPhotoCache]);
  const catalogVisible = Boolean(CATALOG_ENABLED && modal === 'catalog-builder' && selected.id && liveSession && catalogContextRef.current?.current() && liveKey === catalogContextRef.current?.key && String(selectedId) === catalogContextRef.current?.recipient);
  const catalogVisibleRef=useRef(catalogVisible);catalogVisibleRef.current=catalogVisible;
  const catalogWasVisible=useRef(false);
  useEffect(()=>{
    if(catalogWasVisible.current&&!catalogVisible){inboxPollRef.current.at=0;conversationPollRef.current.at=0;backgroundPageLoadRef.current='';setRefreshNonce(n=>n+1);}
    catalogWasVisible.current=catalogVisible;
    if(modal==='catalog-builder'&&!catalogVisible){catalogSessionRef.current?.close();catalogContextRef.current=null;setModal(null);}
  },[catalogVisible,modal]);

  const closeVideoPilot = useCallback(() => {
    videoContextRef.current = null; setVideoContext(null); setModal(current => current === "Video" ? null : current);
  }, []);
  const openVideoPilot = (recipientId) => {
    const recipient = selectedConversation(conversationsRef.current, recipientId);
    if (!recipient) return;
    selectConversation(recipient); setActiveView("Gelen Kutusu");
    const context = { recipientId: String(recipient.id), epoch: sendScopeRef.current.capture() };
    videoContextRef.current = context; setVideoContext(context); setChatMenu(false); setModal("Video");
  };
  const isVideoContextCurrent = () => Boolean(videoContext && videoContextRef.current === videoContext && String(selectedIdRef.current) === videoContext.recipientId && sendScopeRef.current.isCurrent(videoContext.epoch) && (!liveMode || liveSessionRef.current));
  const videoContextCurrent = isVideoContextCurrent() && String(selected.id) === videoContext?.recipientId;
  useEffect(() => {
    if (modal !== "Video" || !videoContextCurrent) closeVideoPilot();
  }, [modal, videoContextCurrent, closeVideoPilot]);

  const teamOptions = liveSession ? ["Atanmamış", ...agents.map((item) => item.name)] : team;
  const outgoingTranslation = selected.id === "lina"
    ? translations[tone]
    : { foreign: languageSamples[selected.id]?.[tone] || translations[tone].foreign, back: translations[tone].back };
  const countryOptions = useMemo(() => {
    const regions = new Map();
    for (const item of conversations) {
      const code = item.code && item.code !== "—" ? item.code : "unknown";
      const region = regions.get(code) || { code, name: code === "unknown" ? "Ülke belirlenemedi" : item.country, count: 0 };
      region.count += 1;
      regions.set(code, region);
    }
    return [...regions.values()].sort((a, b) => a.code === "unknown" ? 1 : b.code === "unknown" ? -1 : a.name.localeCompare(b.name, "tr"));
  }, [conversations]);
  const filtered = useMemo(() => conversations.filter((item) => {
    const filterMatch = filter === "Atanmamışlar" ? item.owner === "Atanmamış" : filter === "Bekleyenler" ? item.waitingForReply === true : filter === "Okunmamış" ? item.unread > 0 : true;
    const countryMatch = countryFilter === "all" || (item.code && item.code !== "—" ? item.code : "unknown") === countryFilter;
    return filterMatch && countryMatch && matchesContactSearch(item, query, item.messagesLoaded!==false);
  }), [conversations, filter, query, countryFilter]);
  const filteredProducts = useMemo(() => productSeed.filter((product) => {
    const haystack = `${product.id} ${product.barcode} ${product.name} ${product.group}`.toLocaleLowerCase("tr-TR");
    return haystack.includes(productQuery.toLocaleLowerCase("tr-TR"));
  }), [productQuery]);
  const unreadNotifications = notifications.filter((item) => item.unread).length;
  const liveNotifications = useMemo(() => conversations.filter((item) => item.unread > 0).map((item) => ({
    id: item.id,
    title: `${item.unread} okunmamış mesaj`,
    detail: `${item.name} · ${item.preview}`,
    time: item.wait || "Yeni",
    type: "waiting",
    unread: true,
    conversationId: item.id,
  })), [conversations]);
  const notificationItems = liveNotifications;
  const notificationUnreadCount = conversations.reduce((total, item) => total + (item.unread || 0), 0);
  const visibleWaitingCount = conversations.filter((item) => item.waitingForReply === true).length;
  const inboxPartial = Boolean(liveSession&&(summary.complete===false||conversations.length<summary.total));
  const visibleUnassignedCount = conversations.filter((item) => item.owner === "Atanmamış").length;
  const effectiveSummary = useMemo(() => effectiveInboxSummary(summary, conversations), [summary, conversations]);
  const inboxView = activeView === "Gelen Kutusu" || activeView === "Konuşmalar";
  const selectedSendUncertain = Boolean(uncertainSends[selected.id]);
  const selectedErpOrderContext = erpOrderContext?.recipientId === String(selectedIdRef.current) && erpOrderContext.current() ? erpOrderContext : null;
  salesDraftContextRef.current = { blocked: liveBusy || selectedSendUncertain, testOnly: import.meta.env?.VITE_CRM_TEST === '1',
    draftContext:selectedErpOrderContext?{items:selectedErpOrderContext.items.map(line=>({erpProductId:line.productId,stockCode:line.stockCode,quantity:line.quantity||1}))}:erpDraftContexts[String(selectedIdRef.current)]||null };
  const currentSalesContext = () => ({ ...salesDraftContextRef.current,
    token: liveKeyRef.current, identity: sessionIdentityRef.current, epoch: sendScopeRef.current.capture(), uiEpoch: uiOperationEpochRef.current,
    canSend: liveSessionRef.current?.canSend === true, blocked: salesDraftContextRef.current.blocked || sendInFlightRef.current,
    conversation: selectedConversation(conversationsRef.current, selectedIdRef.current),
    currentComposer:draftRef.current,
  });
  const currentSalesRulesContext = () => ({token:liveKeyRef.current,identity:sessionIdentityRef.current,epoch:sendScopeRef.current.capture(),role:liveSessionRef.current?.role});
  if (!salesDraftFlowRef.current) salesDraftFlowRef.current = createSalesDraftFlow({ getContext: currentSalesContext, generate: (...args) => liveApi.salesDraft(...args), readProduct: (...args)=>liveApi.canonicalCatalogProduct(...args),readPolicy:(...args)=>liveApi.salesRules(...args),getDraft:()=>draftRef.current,onChange: setSalesSuggestion });
  const salesContextKey = salesDraftContextKey(currentSalesContext());
  useEffect(() => { salesDraftFlowRef.current.synchronize(); }, [salesContextKey, selected]);
  useEffect(() => () => salesDraftFlowRef.current.close(), []);
  const selectedMessageRevision = conversationRevision(selected);
  useEffect(() => {
    if (liveMode && liveSessionRef.current && textDraftStorageRef.current.isActive()) applyStoredDrafts(textDraftStorageRef.current.synchronize(conversations));
  }, [conversations, liveSession, liveMode]);
  const selectedHistoryRevision = `${selected.id}:${selected.messages?.length || 0}:${selected.messages?.at(-1)?.id || ""}:${sentMessages.length}:${selected.history?.nextBefore}:${selected.history?.hasMore}`;
  const selectedOlderHistoryState=sameConversationHistoryScope(olderHistoryState.scope,selected)?olderHistoryState:{busy:false,error:''};
  const syncStale = Boolean(syncError || (lastSyncAt && statusClock - lastSyncAt.getTime() > POLL_INTERVAL.inbox * 2 + 5000));

  useEffect(() => {
    if (!liveSession) return;
    const timer = window.setInterval(() => setStatusClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [Boolean(liveSession)]);

  useEffect(() => {
    if (!composerRef.current) return;
    composerRef.current.style.height = "auto";
    composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, singlePane ? 96 : 144)}px`;
  }, [draft, singlePane]);

  useEffect(() => {
    try { window.sessionStorage.setItem(UNCERTAIN_SENDS_KEY, JSON.stringify(uncertainSends)); } catch {}
  }, [uncertainSends]);

  useEffect(() => {
    readReceiptsRef.current = readReceipts;
    try { window.sessionStorage.setItem(READ_RECEIPTS_KEY, JSON.stringify(readReceipts)); } catch {}
  }, [readReceipts]);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  useEffect(() => {
    document.title = notificationUnreadCount ? `(${notificationUnreadCount}) Melisa Baby CRM` : "Melisa Baby CRM Yönetim Merkezi";
  }, [notificationUnreadCount]);

  const markConversationRead = useCallback((conversation) => {
    if (!conversation?.id) return;
    const receipt = { revision: conversationRevision(conversation), seenAt: new Date().toISOString() };
    const nextReceipts = { ...readReceiptsRef.current, [String(conversation.id)]: receipt };
    readReceiptsRef.current = nextReceipts;
    setReadReceipts(nextReceipts);
    setConversations((items) => items.map((item) => String(item.id) === String(conversation.id) ? { ...item, unread: 0 } : item));
  }, []);

  const selectConversation = useCallback((conversation) => {
    if (!conversation?.id) return;
    olderHistoryReadRef.current?.controller.abort();olderHistoryReadRef.current=null;olderHistoryAnchorRef.current=null;
    setOlderHistoryState({scope:null,busy:false,error:''});
    uiOperationEpochRef.current++; setTranslationBusy(false); salesDraftFlowRef.current?.close();
    setIncomingTranslations(items => Object.fromEntries(Object.entries(items).filter(([, item]) => !item.loading)));
    closeVideoPilot(); setSelectedId(conversation.id); setAttachmentMenu(false); setChatMenu(false); setDesktopInspectorOpen(false);
    setTranslatedIncoming(false);
    setTabletQueueOpen(false);
    setTabletInspectorOpen(false);
    setMobileChatOpen(true);
    nearBottomRef.current = true;
    markConversationRead(conversation);
  }, [markConversationRead, closeVideoPilot]);

  useEffect(() => {
    if (!tabletQueueOpen && !tabletInspectorOpen && !desktopInspectorOpen) return undefined;
    const closeTabletPanels = (event) => {
      if (event.key !== "Escape") return;
      setTabletQueueOpen(false);
      setTabletInspectorOpen(false); setDesktopInspectorOpen(false);
    };
    window.addEventListener("keydown", closeTabletPanels);
    return () => window.removeEventListener("keydown", closeTabletPanels);
  }, [tabletQueueOpen, tabletInspectorOpen, desktopInspectorOpen]);

  const markAllNotificationsRead = useCallback(() => {
    const now = new Date().toISOString();
    const nextReceipts = { ...readReceiptsRef.current };
    conversations.forEach((conversation) => {
      if (conversation.unread > 0) nextReceipts[String(conversation.id)] = { revision: conversationRevision(conversation), seenAt: now };
    });
    readReceiptsRef.current = nextReceipts;
    setReadReceipts(nextReceipts);
    setConversations((items) => items.map((item) => ({ ...item, unread: 0 })));
    flash("Bildirimler bu oturumda okundu olarak temizlendi.");
  }, [conversations, liveSession]);

  const scrollToLatest = useCallback((behavior = "smooth") => {
    const panel = chatScrollRef.current;
    if (!panel) return;
    panel.scrollTo({ top: panel.scrollHeight, behavior });
    setShowJumpLatest(false);
    nearBottomRef.current = true;
  }, []);

  const closeLiveSession = (message = "", clearReceipts = false, {preserveNormal=false} = {}) => {
    olderHistoryReadRef.current?.controller.abort();olderHistoryReadRef.current=null;olderHistoryAnchorRef.current=null;
    setOlderHistoryState({scope:null,busy:false,error:''});
    remainingReadRef.current?.controller.abort();remainingReadRef.current=null;
    bootstrapReconcileRef.current=null;
    setAgentLoadState({busy:false,error:''});setDetailLoadState({id:'',busy:false,error:''});
    testBootstrapRef.current?.abort();
    if (clearReceipts && entry.enabled) {
      try { clearTerminalShare(window.sessionStorage,sessionIdentityRef.current); } catch {}
      // Actor-scoped UUID/body journal remains for same-actor readback; no native token is persisted.
    }
    if (clearReceipts) applyStoredDrafts(textDraftStorageRef.current.clear());
    else textDraftStorageRef.current.suspend();
    salesDraftFlowRef.current?.close();
    const closingKey = liveKeyRef.current;
    const normalSessionClose=preserveNormal?Promise.resolve():linkedTerminal?sessionLoaderRef.current.close():liveApi.clearNormalSession(closingKey);
    if(!preserveNormal){setNormalResumeAvailable(false);setSemihEntry(current=>({...current,user:null}));}
    if(!linkedTerminal)sessionLoaderRef.current?.invalidate(); permissionRefreshRef.current?.invalidate();
    uiOperationEpochRef.current++;
    setIncomingTranslations({}); setTranslationBusy(false); setTranslationReady(false); setTranslationResult(null); setTranslationError(""); setAssignmentBusy(false); setAssignmentError(""); setToast("");
    liveSessionRef.current = null;
    const catalogClose=closeCatalogSession({
      explicitLogout: CATALOG_ENABLED && clearReceipts && Boolean(closingKey),
      disconnect: () => liveApi.catalogSignOut(closingKey),
      clearPhotos: () => { catalogSessionRef.current?.close(); window.dispatchEvent(new Event("melisa-crm-session-cleared")); },
      clearLocal: () => {
    setModal(null); setErpOrderContext(null); setErpDraftContexts({}); setDraftOrderStorageWarning(''); setCatalogSource(initialCatalogSource); setLoadingMoreConversations(false); backgroundPageLoadRef.current = ""; if (clearReceipts) clearCatalogStorage(safeCatalogStorage());
    setSendStates(interruptedSendStates);
    sendScopeRef.current.invalidate(); sendInFlightRef.current = false; setLiveBusy(false);
    liveKeyRef.current = "";
    saveAccessKey(""); setLiveKey(""); setLiveSession(null); setAgents([]); applyInboxCapabilities(null);
    setPermissionCheck({ busy: false, error: "" });
    if (clearReceipts) { setProductDrafts({}); setDraftOrders([]); orderPreviewLedgerRef.current.clear(); readReceiptsRef.current = {}; setReadReceipts({}); setDrafts({}); setAttachments({}); attachmentRef.current = {}; setSendStates({}); setConversations([]); setSelectedId(""); try { window.sessionStorage.removeItem(READ_RECEIPTS_KEY); } catch {} }
    if (message) setLiveError(message);
      },
    });
    const closed=Promise.all([normalSessionClose,catalogClose]);
    closed.catch(error=>setLiveError(error.message));
    return closed;
  };

  const renewExpiredNormalSession = () => {
    return sessionLoaderRef.current.start({resume:true,requireResume:true});
  };

  const loadOlderHistory = async () => {
    const scope=selectedConversation(conversationsRef.current,selectedIdRef.current);
    if(!liveSessionRef.current||!scope?.history?.hasMore||!scope.detailLoaded||catalogVisibleRef.current)return;
    const pending=olderHistoryReadRef.current;
    if(pending?.current())return;
    pending?.controller.abort();
    const key=liveKeyRef.current,identity=sessionIdentityRef.current,actor=textDraftActorScope(liveSessionRef.current);
    const epoch=sendScopeRef.current.capture(),uiEpoch=uiOperationEpochRef.current,before=scope.history.nextBefore,controller=new AbortController();
    const authorityCurrent=()=>Boolean(liveSessionRef.current&&liveKeyRef.current===key&&sessionIdentityRef.current===identity&&textDraftActorScope(liveSessionRef.current)===actor&&sendScopeRef.current.isCurrent(epoch));
    const current=()=>authorityCurrent()&&!controller.signal.aborted&&!catalogVisibleRef.current&&uiOperationEpochRef.current===uiEpoch&&String(selectedIdRef.current)===String(scope.id)&&sameConversationHistoryScope(scope,selectedConversation(conversationsRef.current,scope.id));
    const operation={controller,current};olderHistoryReadRef.current=operation;
    setOlderHistoryState({scope,busy:true,error:''});
    try {
      const {conversation}=await liveApi.conversation(key,scope.id,{before,historyScope:scope,signal:controller.signal});
      if(!current())return;
      mergeOlderConversation(selectedConversation(conversationsRef.current,scope.id),conversation,before);
      const panel=chatScrollRef.current;
      if(panel){
        const position=node=>node.getBoundingClientRect?node.getBoundingClientRect().top-panel.getBoundingClientRect().top:node.offsetTop-panel.scrollTop;
        const visible=[...panel.querySelectorAll('[data-crm-message-id]')].find(node=>position(node)+(node.offsetHeight||0)>0);
        olderHistoryAnchorRef.current={scope,current,id:visible?.dataset.crmMessageId,offset:visible?position(visible):0,top:panel.scrollTop,height:panel.scrollHeight};
      }
      setConversations(items=>{
        if(!current())return items;
        const next=items.map(item=>String(item.id)===String(scope.id)?mergeOlderConversation(item,conversation,before):item);
        conversationsRef.current=next;return next;
      });
    } catch(error) {
      if(!authorityCurrent())return;
      if(error.status===401){void renewExpiredNormalSession();return;}
      if(!current())return;
      if(error.status===403||error.status===404){
        forgetDraft(scope.id);const next=conversationsRef.current.filter(item=>String(item.id)!==String(scope.id));
        conversationsRef.current=next;setConversations(next);setSelectedId('');setMobileChatOpen(false);
      }else setOlderHistoryState({scope,busy:false,error:error.message||'Eski mesajlar alınamadı. Yeniden deneyin.'});
    } finally {
      if(olderHistoryReadRef.current===operation){olderHistoryReadRef.current=null;setOlderHistoryState(state=>state.scope===scope?{...state,busy:false}:state);}
    }
  };

  useEffect(()=>()=>olderHistoryReadRef.current?.controller.abort(),[]);

  const commitLiveSession = ({ key, session: sessionResult, inbox: inboxResult, agents: agentsResult={agents:[]}, permissionReadAt = Date.now(), inboxReadAt = Date.now() }) => {
    const identity = accountIdentityKey(sessionResult.accountIdentity);
    if (!identity) throw new Error("CRM kullanıcı kimliği sunucu tarafından bildirilmedi.");
    olderHistoryReadRef.current?.controller.abort();olderHistoryReadRef.current=null;olderHistoryAnchorRef.current=null;
    setOlderHistoryState({scope:null,busy:false,error:''});
    if (sessionIdentityRef.current !== identity || liveKeyRef.current !== key) salesDraftFlowRef.current?.close();
    if (sessionIdentityRef.current !== identity) { setProductDrafts({}); setDraftOrders([]); setErpOrderContext(null); setErpDraftContexts({}); orderPreviewLedgerRef.current.clear(); }
    if (sessionIdentityRef.current && sessionIdentityRef.current !== identity) { setProductDrafts({}); setDraftOrders([]); orderPreviewLedgerRef.current.clear(); uiOperationEpochRef.current++; setIncomingTranslations({}); clearCatalogStorage(safeCatalogStorage()); setModal(null); catalogSessionRef.current?.close(); setCatalogSource(initialCatalogSource); sendScopeRef.current.invalidate(); sendInFlightRef.current = false; setDrafts({}); setAttachments({}); attachmentRef.current = {}; setSendStates({}); readReceiptsRef.current = {}; setReadReceipts({}); }
    sessionIdentityRef.current = identity;
    remainingReadRef.current?.controller.abort();remainingReadRef.current=null;
    setMobileChatOpen(false);setAgentLoadState({busy:false,error:''});setDetailLoadState({id:'',busy:false,error:''});
    const visibleConversations = applyReadReceipts(sortInboxByActivity(inboxResult.conversations || []), readReceiptsRef.current);
    bootstrapReconcileRef.current=inboxResult.summary?.complete===false?{ids:new Set(visibleConversations.map(row=>String(row.id))),seen:new Set()}:null;
    applyStoredDrafts(textDraftStorageRef.current.activate(sessionResult, visibleConversations));
    liveKeyRef.current = key; liveSessionRef.current = sessionResult; conversationsRef.current = visibleConversations;
    permissionPollRef.current = { key, at: permissionReadAt };
    inboxPollRef.current.at = inboxReadAt;
    conversationPollRef.current.at=0;conversationPollRef.current.id='';
    saveAccessKey(key); setLiveKey(key); setLiveSession(sessionResult); setRole(sessionResult.displayName);
    if(isSemihTestUser(sessionResult))setSemihEntry(current=>({...current,checked:true,enabled:true,user:sessionResult,error:''}));
    setNormalResumeAvailable(false);
    setAgents(agentsResult.agents || []); applyInboxCapabilities(inboxResult.capabilities); setSummary(effectiveInboxSummary(inboxResult.summary || {}, visibleConversations)); setConversations(visibleConversations);
    setNextInboxOffset(inboxResult.summary?.complete===false?0:inboxResult.conversations?.length || 0); setRemainingConversationsError("");
    setSelectedId((current) => inboxResult.conversations?.some((item) => item.id === current) ? current : inboxResult.conversations?.[0]?.id || ""); setTranslationReady(false);
    setLoginCredentials({ username: "", password: "" });
    setLastSyncAt(new Date()); setSyncError("");
  };
  sessionCallbacksRef.current = {
    onCommit: commitLiveSession,
    onError: (error,{resume=false,preserveNormal=false}={}) => {
      if(linkedTerminal&&preserveNormal){setNormalResumeAvailable(true);void closeLiveSession('Bağlantı kurulamadı. Terminal oturumunuzu yeniden deneyebilirsiniz.',false,{preserveNormal:true});return;}
      if (error.status === 401 || error.status === 403) closeLiveSession(error.message || "CRM oturumu doğrulanamadı.", error.status === 403);
      else if(resume){setNormalResumeAvailable(true);void closeLiveSession("Bağlantı kurulamadı. Kaydedilen oturumunuzu yeniden deneyebilirsiniz.",false,{preserveNormal:true});}
      else setLiveError(error.message || "CRM bağlantısı kurulamadı.");
    },
    onBusy: setLiveBusy,
    onAgents: result=>setAgents(result.agents||[]),
    onAgentsState: update=>setAgentLoadState(state=>({...state,...update})),
  };
  if (!sessionLoaderRef.current) sessionLoaderRef.current = (linkedTerminal?createTerminalSessionLoader:createSessionLoader)({
    api: liveApi,
    ...(linkedTerminal?{location:window.location,onInvalidate:()=>{liveSessionRef.current=null;setLiveSession(null);}}:{}),
    onCommit: value => sessionCallbacksRef.current.onCommit(value),
    onError: (error,context) => sessionCallbacksRef.current.onError(error,context),
    onBusy: value => sessionCallbacksRef.current.onBusy(value),
    onAgents: value=>sessionCallbacksRef.current.onAgents(value),
    onAgentsState: value=>sessionCallbacksRef.current.onAgentsState(value),
  });
  const connectLive = () => {
    if(linkedTerminal)return resumeLiveSession();
    if (sessionLoaderRef.current.isPending() || !loginCredentials.username.trim() || !loginCredentials.password) return;
    setLiveError("");
    const credentials = { username: loginCredentials.username.trim(), password: loginCredentials.password };
    setLoginCredentials({ username: loginCredentials.username, password: "" });
    return sessionLoaderRef.current.start({ credentials });
  };

  const refreshNativeDraftOrders = useCallback(() => {
    if (!liveSessionRef.current || !sessionIdentityRef.current) return;
    const actor=entry.enabled?`terminal:${sessionIdentityRef.current}`:sessionIdentityRef.current;
    try {
      const {orders,unreadable}=restoreNativeOrderHistory({actor,conversations:conversationsRef.current,storage:window.sessionStorage});
      setDraftOrders(previous=>orders.map(order=>previous.find(item=>item.requestId===order.requestId&&item.readbackRequired===false)||order));
      setDraftOrderStorageWarning(unreadable.length?'Bazı taslakların tarayıcı kaydı okunamadı. Bu kayıtlar için yeni sipariş gönderilmedi.':'');
    } catch {
      setDraftOrders([]);
      setDraftOrderStorageWarning('Taslakların tarayıcı kaydı okunamadı. Yeni sipariş gönderilmedi.');
    }
  },[entry.enabled]);
  useEffect(()=>{if(liveSession)refreshNativeDraftOrders();},[conversations,liveSession,refreshNativeDraftOrders]);

  if (!permissionRefreshRef.current) permissionRefreshRef.current = createPermissionRefresh({
    getToken: () => liveKeyRef.current,
    getGeneration: () => sendScopeRef.current.capture(),
    fetchSession: (key, options) => linkedTerminal?sessionLoaderRef.current.verifySession(key,options):liveApi.session(key, options),
    onSession: next => {
      if (accountIdentityKey(next.accountIdentity) !== sessionIdentityRef.current || next.role !== liveSessionRef.current?.role || textDraftActorScope(next) !== textDraftActorScope(liveSessionRef.current)) {
        closeLiveSession("Hesap veya yetki kapsamınız değişti. Yeniden giriş yapın.", true);
        return;
      }
      liveSessionRef.current = next; setLiveSession(next);
    },
    onExpired: () => {void renewExpiredNormalSession();},
    onState: (update) => setPermissionCheck((state) => ({ ...state, ...update })),
  });
  const refreshLivePermissions = permissionRefreshRef.current;
  const hasLiveSession = Boolean(liveSession);
  useEffect(() => {
    if (!liveKey || !hasLiveSession) return;
    const check = () => {
      const poll = permissionPollRef.current;
      if (document.visibilityState === "hidden" || (poll.key === liveKey && Date.now() - poll.at < POLL_INTERVAL.permission)) return;
      permissionPollRef.current = { key: liveKey, at: Date.now() };
      refreshLivePermissions().catch(() => {});
    };
    check();
    const timer = window.setInterval(check, POLL_INTERVAL.permission);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [liveKey, hasLiveSession, refreshLivePermissions]);

  const resumeLiveSession = () => {
    if (!liveMode || sessionLoaderRef.current.isPending()) return;
    setLiveError("");
    return linkedTerminal?sessionLoaderRef.current.start():sessionLoaderRef.current.start(liveKeyRef.current?{token:liveKeyRef.current}:{resume:true,requireResume:normalResumeAvailable});
  };
  const continueSemihSession = () => {
    if(!semihEntry.enabled||!isSemihTestUser(semihEntry.user)||sessionLoaderRef.current.isPending())return;
    setLiveError('');return sessionLoaderRef.current.start({resume:true,requireResume:true});
  };
  const openTestAdmin = async () => {
    testBootstrapRef.current?.abort();
    const controller=new AbortController();testBootstrapRef.current=controller;
    setLiveBusy(true);setLiveError('');
    try {
      const token=await bootstrapTestAdmin({signal:controller.signal});
      if(!controller.signal.aborted) await sessionLoaderRef.current.start({token});
    } catch(error) {if(!controller.signal.aborted)setLiveError(error.message);}
    finally {if(!controller.signal.aborted)setLiveBusy(false);}
  };
  const openTestPersonnel = async () => {
    testBootstrapRef.current?.abort();
    const controller = new AbortController(); testBootstrapRef.current = controller;
    setLiveBusy(true); setLiveError('');
    try {
      const response = await fetch('/api/test-personnel/session', { method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:'{}' });
      const result = await response.json();
      if (!response.ok || typeof result.accessToken !== 'string' || !result.accessToken) throw Error('Personel oturumu açılamadı. Mevcut hesabınızla giriş yapabilirsiniz.');
      if (!controller.signal.aborted) await sessionLoaderRef.current.start({token:result.accessToken});
    } catch(error) { if (!controller.signal.aborted) setLiveError(error.message); }
    finally { if (!controller.signal.aborted) setLiveBusy(false); }
  };
  const switchTestRole = () => {
    chooseTestRoleLogin(true);setManualTestLogin(true);
    void closeLiveSession('',true);
  };
  const returnToTestAdmin = () => {
    void closeLiveSession('',true);
    chooseTestRoleLogin(false);setManualTestLogin(false);
    void openTestAdmin();
  };
  useEffect(() => {
    const controller=new AbortController();
    if(liveMode)void (async()=>{
      try{
        const remembered=await liveApi.rememberedNormalSession({signal:controller.signal});if(controller.signal.aborted)return;
        setSemihEntry({...remembered,checked:true,error:''});
        if(remembered.enabled){
          // An old loopback TEST bootstrap must never become the Semih identity.
          liveKeyRef.current='';saveAccessKey('');setLiveKey('');
          setNormalResumeAvailable(Boolean(remembered.user));
        }
        const action=initialSessionAction({remembered,testAdminEnabled:testAdminAvailableHere,manualTestLogin,native:liveApi.hasNativeNormalSession()});
        if(action==='test-admin')void openTestAdmin();else if(action==='resume')resumeLiveSession();
      }catch(error){if(!controller.signal.aborted){setSemihEntry({checked:true,enabled:false,user:null,error:'Oturum bağlantısı doğrulanamadı.'});setLiveError('Oturum bağlantısı doğrulanamadı. CRM’yi yeniden açın.');}}
    })();
    return () => {controller.abort();testBootstrapRef.current?.abort();remainingReadRef.current?.controller.abort(); if(linkedTerminal)sessionLoaderRef.current?.cancel();else sessionLoaderRef.current?.invalidate(); permissionRefreshRef.current?.invalidate(); sendScopeRef.current.invalidate(); uiOperationEpochRef.current++;};
  }, []);

  useEffect(() => {
    if (!hasLiveSession || !liveKey) return;
    let active = true;
    const readEpoch = sendScopeRef.current.capture();
    const currentRead = () => !catalogVisibleRef.current && sessionReadIsCurrent({ active, key: liveKey, currentKey: liveKeyRef.current, epochCurrent: sendScopeRef.current.isCurrent(readEpoch) });
    const refreshInbox = async () => {
      const poll = inboxPollRef.current;
      const now = Date.now();
      if (chatPollingPaused(document.visibilityState === "hidden",catalogVisibleRef.current)) return;
      if(queueForegroundRead(poll,refreshInbox,currentRead))return;
      if(now - poll.at < POLL_INTERVAL.inbox)return;
      poll.at = now;
      poll.inFlight = true;
      try {
        const { offset, total } = paginationRef.current;
        const allPagesLoaded = offset >= total && total > 100;
        const olderOffset = allPagesLoaded && now - olderPageCheckedAtRef.current >= POLL_INTERVAL.olderPage ? olderPageOffsetRef.current : null;
        if (olderOffset !== null) olderPageCheckedAtRef.current = now;
        const [result, olderPage] = await Promise.all([
          liveApi.inbox(liveKey, 0, entry.enabled && liveSessionRef.current?.role === 'personel' ? {view:'bootstrap'} : {}),
          olderOffset !== null ? liveApi.inbox(liveKey, olderOffset, entry.enabled && liveSessionRef.current?.role === 'personel' ? {view:'bootstrap'} : {}).catch(() => null) : Promise.resolve(null),
        ]);
        if (!currentRead()) return;
        if (olderOffset !== null) olderPageOffsetRef.current = olderOffset + 100 < result.summary.total ? olderOffset + 100 : 100;
        const current = olderPage ? mergeInboxConversations(conversationsRef.current, olderPage.conversations, selectedIdRef.current, null, true) : conversationsRef.current;
        const merged = mergeInboxConversations(current, result.conversations, selectedIdRef.current, null, result.summary.total > result.conversations.length);
        const visibleConversations = applyReadReceipts(sortInboxByActivity(merged), readReceiptsRef.current);
        applyInboxCapabilities(result.capabilities); setSummary(effectiveInboxSummary(result.summary || {}, visibleConversations));
        conversationsRef.current = visibleConversations;
        setConversations(visibleConversations);
        setLastSyncAt(new Date()); setSyncError("");
      } catch (error) {
        if (!currentRead()) return;
        if (error.status === 401) void renewExpiredNormalSession();
        else setSyncError(error.status === 429 ? error.message : "Canlı yenileme gecikti");
      } finally { finishForegroundRead(poll); }
    };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refreshInbox(); };
    refreshInbox();
    const timer = window.setInterval(refreshInbox, POLL_INTERVAL.inbox);
    window.addEventListener("focus", refreshInbox);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false; window.clearInterval(timer);
      window.removeEventListener("focus", refreshInbox);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [hasLiveSession, liveKey, refreshNonce]);

  const loadRemainingConversations = async () => {
    if (catalogVisibleRef.current || !liveSession || remainingReadRef.current || (summary.complete!==false&&nextInboxOffset >= summary.total)) return;
    const scope = sendScopeRef.current.capture(), key = liveKey;
    const controller=new AbortController(),operation={controller};remainingReadRef.current=operation;
    const isCurrent = () => !controller.signal.aborted && sendScopeRef.current.isCurrent(scope) && Boolean(key) && liveKeyRef.current === key;
    setLoadingMoreConversations(true); setRemainingConversationsError("");
    let offset = summary.complete===false?0:nextInboxOffset,total=summary.complete===false?null:summary.total;
    const reconcile=bootstrapReconcileRef.current;if(offset===0)reconcile?.seen.clear();
    try {
      for (let page = 0; page < 12 && (total===null||offset<total); page += 1) {
        if(catalogVisibleRef.current)break;
        const result = await liveApi.inbox(key, offset,{signal:controller.signal,...(entry.enabled && liveSessionRef.current?.role === 'personel' ? {view:'bootstrap'} : {})});
        if (!isCurrent()) return;
        if(catalogVisibleRef.current)break;
        if(result.summary.complete===false||!Number.isFinite(result.summary.total))throw new Error('Konuşma toplamı henüz doğrulanamadı. Tekrar deneyin.');
        total=result.summary.total;
        for(const row of result.conversations)reconcile?.seen.add(String(row.id));
        if (!result.conversations.length&&total>0) throw new Error("Kalan konuşmalar API’den gelmedi.");
        const before = new Set(conversationsRef.current.map((item) => String(item.id)));
        const merged = mergeInboxConversations(conversationsRef.current, result.conversations, selectedIdRef.current, null, total>0);
        if (offset>0&&merged.length === before.size&&total>offset) throw new Error("Konuşma sayfalaması ilerlemedi.");
        const visible = applyReadReceipts(sortInboxByActivity(merged), readReceiptsRef.current);
        conversationsRef.current = visible; setConversations(visible);
        applyInboxCapabilities(result.capabilities);setSummary(effectiveInboxSummary(result.summary,visible));
        if(offset===0)inboxPollRef.current.at=Date.now();
        offset += result.conversations.length; setNextInboxOffset(offset);
        if(offset>=total&&reconcile&&bootstrapReconcileRef.current===reconcile){
          const reconciled=reconcileBootstrapConversations(conversationsRef.current,reconcile.ids,reconcile.seen,total);
          conversationsRef.current=reconciled;setConversations(reconciled);setSummary(effectiveInboxSummary(result.summary,reconciled));
          if(!reconciled.some(row=>String(row.id)===String(selectedIdRef.current))){setSelectedId('');setMobileChatOpen(false);}
          bootstrapReconcileRef.current=null;
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error.status === 401) void renewExpiredNormalSession();
      else setRemainingConversationsError(error.status === 429 ? error.message : "Diğer konuşmalar alınamadı. Tekrar deneyin.");
    } finally { if(remainingReadRef.current===operation)remainingReadRef.current=null;if (isCurrent()) setLoadingMoreConversations(false); }
  };

  useEffect(() => {
    if (catalogVisibleRef.current || !liveSession || (summary.complete!==false&&(!summary.total||nextInboxOffset >= summary.total))) return;
    const loadKey = `${liveKey}:${summary.complete===false?'bootstrap':summary.total}`;
    if (backgroundPageLoadRef.current === loadKey) return;
    backgroundPageLoadRef.current = loadKey;
    loadRemainingConversations();
  }, [hasLiveSession, liveKey, summary.total, summary.complete, refreshNonce]);

  useEffect(() => {
    if (!hasLiveSession || !selectedId || !selectedChatVisible || !inboxView) return;
    let active = true;
    const controller=new AbortController();
    const readEpoch = sendScopeRef.current.capture();
    const currentRead = () => !catalogVisibleRef.current && sessionReadIsCurrent({ active, key: liveKey, currentKey: liveKeyRef.current, epochCurrent: sendScopeRef.current.isCurrent(readEpoch), recipientId: selectedId, currentRecipientId: selectedIdRef.current });
    const refreshConversation = async () => {
      const poll = conversationPollRef.current;
      const now = Date.now();
      if(chatPollingPaused(document.visibilityState === "hidden",catalogVisibleRef.current))return;
      if(queueForegroundRead(poll,refreshConversation,currentRead))return;
      if(poll.id === selectedId && now - poll.at < POLL_INTERVAL.conversation)return;
      poll.inFlight=true;poll.at = now; poll.id = selectedId;
      setDetailLoadState({id:selectedId,busy:true,error:''});
      const readConversation=selectedConversation(conversationsRef.current,selectedId);
      try {
        const { conversation } = await liveApi.conversation(liveKey, selectedId,{signal:controller.signal});
        if (!currentRead()||!sameConversationHistoryScope(readConversation,selectedConversation(conversationsRef.current,selectedId))) return;
        if(String(conversation?.id)!==String(selectedId))throw new Error('Konuşma geçmişi doğrulanamadı. Yeniden deneyin.');
        setConversations((items) => {
          if(!currentRead()||!sameConversationHistoryScope(readConversation,selectedConversation(items,selectedId)))return items;
          const next = applyReadReceipts(items.map((item) => {
            if(item.id!==selectedId)return item;
            const detail={...(sameConversationHistoryScope(item,conversation)?item:{}),...conversation,messagesLoaded:true,detailLoaded:true};
            return mergeInboxConversations([item],[detail],selectedId)[0];
          }), readReceiptsRef.current);
          conversationsRef.current = next;
          return next;
        });
      } catch (error) {
        if (!currentRead()) return;
        if (error.status === 401) void renewExpiredNormalSession();
        else if (error.status === 403 || error.status === 404) {
          if(!sameConversationHistoryScope(readConversation,selectedConversation(conversationsRef.current,selectedId)))return;
          forgetDraft(selectedId);
          setConversations((items) => items.filter((item) => item.id !== selectedId));
          setSelectedId(""); setMobileChatOpen(false);
        } else {setSyncError(error.status === 429 ? error.message : "Konuşma güncellenemedi");setDetailLoadState({id:selectedId,busy:false,error:error.message||'Konuşma geçmişi alınamadı.'});}
      } finally {if(currentRead())setDetailLoadState(state=>({...state,busy:false}));finishForegroundRead(poll); }
    };
    refreshConversation();
    const timer = window.setInterval(refreshConversation, POLL_INTERVAL.conversation);
    window.addEventListener("focus", refreshConversation);
    document.addEventListener("visibilitychange", refreshConversation);
    return () => { active = false;controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refreshConversation); document.removeEventListener("visibilitychange", refreshConversation); };
  }, [selectedId, hasLiveSession, liveKey, selectedChatVisible, inboxView, refreshNonce]);

  useEffect(() => {
    setTranslationResult(null); setTranslationReady(false); setTranslationError(""); setTargetLanguage("auto");
  }, [selectedId]);

  useEffect(() => {
    if (catalogVisibleRef.current || !inboxView || !selectedChatVisible || !selected.id || !selected.unread || document.visibilityState === "hidden") return;
    markConversationRead(selected);
  }, [inboxView, selectedChatVisible, selected.id, selected.unread, selectedMessageRevision, markConversationRead]);

  useEffect(() => {
    if (!inboxView || !selected.id) return;
    const changed = previousChatRef.current !== selected.id;
    previousChatRef.current = selected.id;
    if (!selectedChatVisible) return;
    const anchor=olderHistoryAnchorRef.current;olderHistoryAnchorRef.current=null;
    if(anchor?.current()&&sameConversationHistoryScope(anchor.scope,selected)){
      const panel=chatScrollRef.current,node=panel&&[...panel.querySelectorAll('[data-crm-message-id]')].find(item=>item.dataset.crmMessageId===anchor.id);
      if(panel){const offset=node?(node.getBoundingClientRect?node.getBoundingClientRect().top-panel.getBoundingClientRect().top:node.offsetTop-panel.scrollTop):null;panel.scrollTop=offset===null?anchor.top+panel.scrollHeight-anchor.height:panel.scrollTop+offset-anchor.offset;nearBottomRef.current=panel.scrollHeight-panel.scrollTop-panel.clientHeight<=120;setShowJumpLatest(!nearBottomRef.current);}
      return;
    }
    if (!changed && !nearBottomRef.current) { setShowJumpLatest(true); return; }
    const frame = window.requestAnimationFrame(() => scrollToLatest("auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [inboxView, selected.id, selectedChatVisible, selectedHistoryRevision, scrollToLatest]);

  const captureUiOperation = (recipientId) => {
    const key = liveKeyRef.current, epoch = sendScopeRef.current.capture(), uiEpoch = uiOperationEpochRef.current;
    return () => (!entry.enabled || window.navigator?.onLine !== false) && sessionReadIsCurrent({ key, currentKey: liveKeyRef.current, epochCurrent: sendScopeRef.current.isCurrent(epoch) && uiOperationEpochRef.current === uiEpoch, recipientId, currentRecipientId: selectedIdRef.current });
  };
  const flash = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const assignCustomer = async (owner) => {
    if(liveMode){const target=conversationsRef.current.find(item=>String(item.id)===String(selected.id));if(!target||!canAssignConversation(liveSessionRef.current,inboxCapabilitiesRef.current,target))return;}
    if (!liveSession) return setConversations((items) => items.map((item) => item.id === selected.id ? { ...item, owner } : item));
    const agent = agents.find((item) => item.name === owner);
    if (!agent) return flash("Atanmamış duruma alma pilotun sonraki adımında açılacak.");
    const isCurrent = captureUiOperation(selected.id);
    try {
      await liveApi.assign(liveKey, selected.id, agent.id);
      if (!isCurrent()) return;
      setConversations((items) => items.map((item) => item.id === selected.id ? { ...item, owner, assignedUserId: agent.id } : item));
      flash(`${selected.name} ${owner} kullanıcısına atandı.`);
    } catch (error) { if (isCurrent()) flash(error.message); }
  };
  const openAssignment = (conversation) => {
    const current=liveMode?conversationsRef.current.find(item=>String(item.id)===String(conversation?.id)):conversation;
    if (!current?.id || (liveMode && !canAssignConversation(liveSessionRef.current,inboxCapabilitiesRef.current,current))) return;
    setAssignmentTargetId(conversation.id);
    setSelectedAssigneeId("");
    setAssignmentError("");
    setModal("assign");
  };
  const confirmAssignment = async () => {
    if(liveSession&&(agentLoadState.busy||agentLoadState.error))return;
    const target = conversationsRef.current.find((item) => String(item.id) === String(assignmentTargetId));
    if(liveMode&&(!target||!canAssignConversation(liveSessionRef.current,inboxCapabilitiesRef.current,target)))return;
    const agent = agents.find((item) => String(item.id) === String(selectedAssigneeId));
    const demoAgent = teamOptions.find((item) => item === selectedAssigneeId);
    if (!target || (!agent && !demoAgent)) return setAssignmentError("Önce bir sorumlu seçin.");
    if (assignmentBusy) return;
    const isCurrent = liveSession ? captureUiOperation() : () => true;
    setAssignmentBusy(true); setAssignmentError("");
    try {
      if (liveSession) await liveApi.assign(liveKey, target.id, agent.id);
      if (!isCurrent()) return;
      const owner = agent?.name || demoAgent;
      setConversations((items) => items.map((item) => String(item.id) === String(target.id) ? { ...item, owner, assignedUserId: agent?.id ?? item.assignedUserId } : item));
      if (liveSession && target.owner === "Atanmamış") setSummary((current) => ({ ...current, unassigned: Math.max(0, current.unassigned - 1) }));
      setModal(null); setAssignmentTargetId(null);
      flash(`${target.name} → ${owner} olarak atandı.`);
    } catch (error) { if (isCurrent()) setAssignmentError(error.message || "Atama yapılamadı. Tekrar deneyin."); }
    finally { if (isCurrent()) setAssignmentBusy(false); }
  };
  const translationFailureMessage = (error) => error.code === "WHATSAPP_CRM_TRANSLATION_DISABLED"
    ? "Çeviri şu anda kullanılamıyor. Bağlantı ayarlarını yöneticiniz kontrol edebilir."
    : (error.message || "Çeviri tamamlanamadı.");
  const useTranslation = () => {
    const text = liveSession ? translationResult?.translatedText : outgoingTranslation.foreign;
    if (!text) return;
    setDraft(text); setTranslationReady(false);
    flash(`${liveSession ? (translationResult.targetLanguage || "Müşteri dili") : selected.language} çeviri mesaj alanına aktarıldı; otomatik gönderilmedi.`);
  };
  const translateIncomingMessage = async (message) => {
    if (!liveSession) return setTranslatedIncoming((value) => !value);
    const isCurrent = captureUiOperation(selected.id);
    const translationKey = `${selected.id}:${message.id}`;
    const current = incomingTranslations[translationKey];
    if (current?.loading) return;
    if (current?.translatedText) {
      setIncomingTranslations((items) => ({ ...items, [translationKey]: { ...current, automatic: false, hidden: !current.hidden } }));
      return;
    }
    setIncomingTranslations((items) => ({ ...items, [translationKey]: { loading: true } }));
    try {
      const result = await liveApi.translate(liveKey, selected.id, { mode: "incoming_to_tr", text: message.text });
      if (!isCurrent()) return;
      setIncomingTranslations((items) => ({ ...items, [translationKey]: { ...result, loading: false, hidden: false } }));
    } catch (error) {
      if (!isCurrent()) return;
      const messageText = translationFailureMessage(error);
      setIncomingTranslations((items) => ({ ...items, [translationKey]: { loading: false, error: messageText } }));
      flash(messageText);
    }
  };
  useEffect(() => {
    if (!automaticTranslation || !liveSession?.paidAiEnabled || automaticTranslationBusy.current) return;
    const message = nextIncomingTranslation(selected.messages, incomingTranslations, selected.id);
    if (!message) return;
    automaticTranslationBusy.current = true;
    const isCurrent = captureUiOperation(selected.id), key = `${selected.id}:${message.id}`;
    setIncomingTranslations(items => ({ ...items, [key]: { loading: true } }));
    liveApi.translate(liveKey, selected.id, { mode: "incoming_to_tr", text: message.text, aiIntent: {userInitiated:true,action:'automatic-opt-in'} })
      .then(result => { if (isCurrent()) setIncomingTranslations(items => ({ ...items, [key]: { ...result, automatic:true, loading: false, hidden: !automaticTranslationRef.current } })); })
      .catch(error => { if (isCurrent()) setIncomingTranslations(items => ({ ...items, [key]: { loading: false, error: translationFailureMessage(error) } })); })
      .finally(() => { automaticTranslationBusy.current = false; setIncomingTranslations(items => { const value = items[key]; return value?.loading ? { ...items, [key]: { loading: false, error: "Çeviri kesildi; tekrar deneyebilirsiniz." } } : { ...items }; }); });
  }, [automaticTranslation, liveSession, liveKey, selected.id, selected.messages, incomingTranslations]);
  const translateDraft = async () => {
    if (!draft.trim()) return flash("Önce Türkçe mesajınızı yazın.");
    if (!liveSession) { setTranslationReady(true); setAiOpen(true); setRightTab("AI Çeviri"); return; }
    if (import.meta.env?.VITE_CRM_ISOLATED_PREPARATION === "1" || liveSession.paidAiEnabled !== true) return flash("Bu ortamda ücretli AI çevirisi kapalı.");
    if (targetLanguage === "auto" && (!selected.language || selected.language === "Belirtilmedi")) {
      const message = "Müşterinin dili bilinmiyor. Çeviri için yanıt dilini seçin.";
      setTranslationReady(false); setTranslationResult(null); setTranslationError(message); setAiOpen(true); setTabletInspectorOpen(true); setDesktopInspectorOpen(true); setRightTab("AI Çeviri"); flash(message);
      return;
    }
    const isCurrent = captureUiOperation(selected.id);
    const run = ++outgoingTranslationRunRef.current;
    const matchesDraft = () => isCurrent() && run === outgoingTranslationRunRef.current && draftRef.current === draft && targetLanguageRef.current === targetLanguage;
    setTranslationBusy(true); setTranslationError(""); setTranslationResult(null); setTranslationReady(false); setAiOpen(true); setRightTab("AI Çeviri");
    try {
      const result = await liveApi.translate(liveKey, selected.id, { mode: "outgoing_from_tr", text: draft.trim(), targetLanguage });
      if (!matchesDraft()) return;
      if (!result.translatedText) throw new Error("Çeviri servisi boş yanıt verdi.");
      if (/^(tr|turkish|türkçe|turkce)$/i.test(result.targetLanguage.trim())) throw new Error("Hedef dil Türkçe döndü. Müşterinin dilini seçip yeniden çevirin.");
      setTranslationResult(result); setTranslationReady(true);
    } catch (error) {
      if (!matchesDraft()) return;
      const messageText = translationFailureMessage(error);
      setTranslationError(messageText); flash(messageText);
    } finally { if (isCurrent() && run === outgoingTranslationRunRef.current) setTranslationBusy(false); }
  };
  const takeSalesDraft = async () => {
    const isCurrent=captureUiOperation(selected.id),existingDraft=draftRef.current;
    const nextDraft = await salesDraftFlowRef.current.takeDraft(existingDraft);
    if (nextDraft === null||!isCurrent()||draftRef.current!==existingDraft) return;
    setDraft(nextDraft); setTranslationReady(false); setTranslationResult(null); setTranslationError('');
    composerRef.current?.focus(); flash('Öneri mesaj taslağına eklendi. Göndermeden önce düzenleyebilirsiniz.');
  };
  const takeSalesProduct = async (id,action) => {
    const isCurrent=captureUiOperation(selected.id),existingDraft=draftRef.current;
    const nextDraft=await salesDraftFlowRef.current.takeProductDraft(id,action);
    if(nextDraft===null||!isCurrent()||draftRef.current!==existingDraft)return;
    setDraft(nextDraft);setTranslationReady(false);setTranslationResult(null);setTranslationError('');
    composerRef.current?.focus();flash('Ürün seçimi mesaj taslağına eklendi. Göndermeden önce inceleyebilirsiniz.');
  };
  const addSelectedProduct = () => {
    const product = productSeed.find((item) => item.id === selectedProductId);
    if (!product) return;
    try {
      const line = upsertDraftProduct([], product, productQuantity)[0];
      setPendingProducts(items => upsertDraftProduct(items, line, line.quantity));
    }
    catch { flash("Ürün fiyatı, para birimi veya adedi doğrulanamadı."); return; }
    setModal(null); setProductQuery(""); setProductQuantity(1);
    flash(`${product.name} gönderim önizlemesine eklendi.`);
  };
  const addCatalog = (catalog) => {
    setPendingCatalogs((items) => items.some((item) => item.id === catalog.id) ? items : [...items, catalog]);
    setModal(null);
    flash(`${catalog.title} kataloğu gönderime eklendi.`);
  };
  const createDraftOrder = () => {
    if (liveMode || liveSession || !selected.id || String(selected.id) !== String(selectedId)) {
      flash("ERP taslak yazma bağlantısı henüz etkin değil."); return;
    }
    try {
      const { order, created } = orderPreviewLedgerRef.current.create({
        accountId: 'development-fixture', conversationId: String(selected.id),
        customer: selected.name, owner: selected.owner === "Atanmamış" ? role : selected.owner,
        products: pendingProducts,
      });
      setDraftOrders(items => items.some(item => item.id === order.id) ? items : [order, ...items]);
      setModal(null); setActiveView("Taslak Siparişler");
      flash(created ? "Yerel önizleme oluşturuldu; ERP'ye veri gönderilmedi." : "Bu ürün seçiminin önizlemesi zaten mevcut.");
    } catch { flash("Ürün seçimi, tek adet fiyatı ve para birimi doğrulanmadan önizleme oluşturulamaz."); }
  };
  const updateAttachment = (id, value) => {
    attachmentRef.current = { ...attachmentRef.current, [id]: value };
    setAttachments(attachmentRef.current);
  };
  useEffect(() => {
    if (!attachmentMenu && !chatMenu) return;
    const close = (event) => { if (event.key === "Escape") { setAttachmentMenu(false); setChatMenu(false); composerRef.current?.focus(); } };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [attachmentMenu, chatMenu]);
  const chooseAttachment = (kind) => {
    fileChoiceRef.current = { id: selected.id, identity: sessionIdentityRef.current, token: Symbol() };
    setFileAccept(ATTACHMENT_ACCEPT[kind] || ATTACHMENT_ACCEPT.pdf);
    setAttachmentMenu(false);
    // Let React update accept before opening the native picker.
    window.requestAnimationFrame(() => fileInputRef.current?.click());
  };
  const selectAttachment = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    const choice = fileChoiceRef.current;
    if (!file || !choice || choice.identity !== sessionIdentityRef.current) return;
    updateAttachment(choice.id, { state: "reading", fileName: file.name, size: file.size, token: choice.token });
    setSendStates((items) => ({ ...items, [choice.id]: null }));
    try {
      const media = await prepareAttachment(file);
      if (attachmentRef.current[choice.id]?.token !== choice.token || choice.identity !== sessionIdentityRef.current) return;
      updateAttachment(choice.id, { state: "ready", ...media, size: file.size, token: choice.token });
    } catch (error) {
      if (attachmentRef.current[choice.id]?.token !== choice.token) return;
      updateAttachment(choice.id, { state: "error", fileName: file.name, error: error.message, token: choice.token });
    }
  };
  const openCatalog = () => {
    if (entry.enabled && window.navigator?.onLine === false) return flash("Bağlantı yok — bu işlem çevrimiçi tamamlanmalıdır.");
    if (!CATALOG_ENABLED || !liveSessionRef.current || !selected.id) return;
    if(catalogContextRef.current?.current()&&catalogContextRef.current?.recipient===String(selected.id))return;
    catalogSessionRef.current?.close();
    catalogContextRef.current = { current:captureUiOperation(selected.id), identity:sessionIdentityRef.current, recipient:String(selected.id), key:liveKeyRef.current };
    setAttachmentMenu(false); setModal("catalog-builder");
  };
  const openSavedErpDraft = (order) => {
    if (!liveSessionRef.current) return;
    const conversation=conversationsRef.current.find(item=>String(item.id)===String(order.conversationId));
    if (!conversation) return flash('Bu müşteriye erişiminiz artık yok. Konuşma listesini yenileyin.');
    try {
      const actor=entry.enabled?`terminal:${sessionIdentityRef.current}`:sessionIdentityRef.current;
      const record=createNativeOrderStore(actor,conversation.id,window.sessionStorage).read();
      if(!record||record.payload.requestId!==order.requestId)throw Error('Taslak kurtarma kaydı değişti. Sipariş listesini yeniden açın.');
      selectConversation(conversation);
      setErpOrderContext({recipientId:String(conversation.id),items:record.payload.items,recoveryOnly:true,current:captureUiOperation(conversation.id)});
      setModal('erp-order');
    } catch(error) {flash(error.message||'Taslak yeniden açılamadı. Yeni sipariş gönderilmedi.');}
  };
  const closeCatalog = () => { catalogSessionRef.current?.close(); catalogContextRef.current=null; setModal(null); };
  const catalogProductAction = async (products,action) => {
    if (entry.enabled && window.navigator?.onLine === false) throw Error("Bağlantı yok — bu işlem çevrimiçi tamamlanmalıdır.");
    if(!catalogContextCurrent())return;
    try {
      const freshProducts=await catalogSessionRef.current.verifyProducts(products);
      products=freshProducts.map((p,i)=>{const currency=products[i].currency,tuple=p.salePrices?.filter(t=>t.tier===1&&t.isMainUnit&&t.currency===currency&&Number(t.priceExact)>0);return tuple?.length===1?{...p,currency,priceExact:tuple[0].priceExact,priceSourceKey:tuple[0].sourceKey}:p;});
      if(!catalogContextCurrent())return;
      if(action==='order'){
        const items=selectedSaleLines(products).map(item=>({...item,sourceId:item.id}));
        if(new Set(items.map(item=>item.currency)).size!==1)throw Error("Sipariş satırlarında tek para birimi seçin.");
        const current=captureUiOperation(selected.id);
        setErpOrderContext({recipientId:String(selected.id),items,current});
        closeCatalog();setModal('erp-order');return;
      }
      if (entry.enabled && action==='price') rememberTerminalShare(window.sessionStorage,sessionIdentityRef.current,String(selected.id),products);
      const text=selectionMessage(products,action==='price');
      const nextDraft=[draft.trim(),text].filter(Boolean).join('\n\n');
      if(nextDraft.length>2000)throw Error('Seçim mesaj sınırını aşıyor. Daha az ürün seçin.');
      setDraft(nextDraft);
      closeCatalog();flash("Seçim mesaj taslağına eklendi; henüz gönderilmedi.");
    }catch(error){flash(error.message);}
  };
  const catalogContextCurrent = () => Boolean(catalogContextRef.current?.current() && liveSessionRef.current && liveKeyRef.current===catalogContextRef.current.key && String(selectedIdRef.current)===catalogContextRef.current.recipient);
  useEffect(() => {
    if(!catalogSource.accessExpiresAt)return;
    const timer=setTimeout(()=>setCatalogSource(initialCatalogSource),Math.max(0,catalogSource.accessExpiresAt-Date.now()));
    return ()=>clearTimeout(timer);
  },[catalogSource.accessExpiresAt]);
  const attachCatalogOutput = async (file, customerId, isCurrent, proof) => {
    if (!isCurrent?.()) throw new Error("Katalog işlemi iptal edildi.");
    if (!liveSessionRef.current || !liveKeyRef.current || String(customerId) !== String(selectedIdRef.current)) throw new Error("Oturum veya müşteri değişti. Kataloğu ilgili konuşmada yeniden açın.");
    if (!liveSessionRef.current.liveSendEnabled) throw new Error("Bu hesabın güncel gönderim izni yok.");
    if (sendInFlightRef.current || uncertainSendsRef.current[customerId]) throw new Error("Önce mevcut gönderimin durumunu kontrol edin.");
    const scope = sendScopeRef.current.capture(), priorAttachment = attachmentRef.current[customerId];
    const media = await prepareAttachment(file);
    validateSendPayload({ text: draftRef.current, media, clientRequestId: "catalog-attachment-preview" });
    if (!isCurrent() || !liveSessionRef.current?.liveSendEnabled || sendInFlightRef.current || uncertainSendsRef.current[customerId] || !sendScopeRef.current.isCurrent(scope) || String(customerId) !== String(selectedIdRef.current) || !liveKeyRef.current || attachmentRef.current[customerId] !== priorAttachment) throw new Error("Oturum, müşteri veya sohbet eki değişti. Dosya eklenmedi.");
    if (entry.enabled && proof?.products?.length) rememberTerminalShare(window.sessionStorage,sessionIdentityRef.current,String(customerId),proof.products);
    updateAttachment(customerId, { state: "ready", ...media, size: file.size, token: Symbol() });
    setSendStates(items => ({ ...items, [customerId]: null }));
    flash("Katalog sohbete eklendi · henüz gönderilmedi");
  };
  const checkSendStatus = async () => {
    const conversationId = selected.id, lock = uncertainSendsRef.current[conversationId];
    if (!entry.enabled || !liveKeyRef.current || !lock?.clientRequestId || liveBusy || window.navigator?.onLine === false) return;
    const current = captureUiOperation(conversationId);
    const media = pendingAttachment?.state === 'ready' ? {dataUrl:pendingAttachment.dataUrl,fileName:pendingAttachment.fileName,mimeType:pendingAttachment.mimeType,mediaType:pendingAttachment.mediaType} : null;
    const productLines = pendingProducts.map(product => `${product.name} · ${product.id} · ${product.price} · ${product.quantity} adet`).join('\n');
    const catalogLines = pendingCatalogs.map(catalog => `${catalog.title}: ${catalog.link}`).join('\n');
    const content = [draft.trim(),productLines,catalogLines].filter(Boolean).join('\n\n');
    setLiveBusy(true);
    try {
      const receipt = await liveApi.sendStatus(liveKeyRef.current,conversationId,content,lock.clientRequestId,media);
      if (!current() || uncertainSendsRef.current[conversationId]?.clientRequestId !== lock.clientRequestId) return;
      const state = outboundRecoveryState(receipt,lock.clientRequestId,conversationId);
      if (state === 'rejected') {
        setUncertainSends(items => { if (items[conversationId]?.clientRequestId !== lock.clientRequestId) return items; const next={...items};delete next[conversationId];return next; });
        setSendStates(items => ({...items,[conversationId]:{state:'failed',text:'Mesaj gönderilmemiş. Taslağınız korunuyor; hazır olduğunuzda Gönder’e basabilirsiniz.'}}));
      } else setSendStates(items => ({...items,[conversationId]:{state:'uncertain',text:state === 'confirmed' ? 'Gönderim kabul edilmiş. Aynı mesajın tekrar gönderimi kilitli.' : 'Teslim durumu henüz kesinleşmedi. Yeniden gönderim kilitli.'}}));
    } catch(error) {
      if (current()) setSendStates(items => ({...items,[conversationId]:{state:'uncertain',text:'Gönderim durumu doğrulanamadı. Yeniden gönderim kilitli; aynı mesaj ve dosya korunmalı.'}}));
    } finally { if (current()) setLiveBusy(false); }
  };

  const sendMessage = async () => {
    if (entry.enabled && window.navigator?.onLine === false) return flash("Bağlantı yok — bu işlem çevrimiçi tamamlanmalıdır.");
    if (selectedSendUncertain || sendInFlightRef.current || pendingAttachment?.state === "reading" || pendingAttachment?.state === "error") return;
    if (!selected.id || String(selected.id) !== String(selectedId) || (!draft.trim() && !pendingAttachment && !pendingProducts.length && !pendingCatalogs.length)) return;
    const conversationId = selected.id;
    const sendingDraft = draft;
    const sendingDraftActor = textDraftActorScope(liveSessionRef.current);
    const selectedMedia = pendingAttachment?.state === "ready" ? pendingAttachment : null;
    const productLines = pendingProducts.map((product) => `${product.name} · ${product.id} · ${product.price} · ${product.quantity} adet`).join("\n");
    const catalogLines = pendingCatalogs.map((catalog) => `${catalog.title}: ${catalog.link}`).join("\n");
    const content = [draft.trim(), productLines, catalogLines].filter(Boolean).join("\n\n");
    let clientRequestId;
    const media = selectedMedia ? { dataUrl: selectedMedia.dataUrl, fileName: selectedMedia.fileName, mimeType: selectedMedia.mimeType, mediaType: selectedMedia.mediaType } : null;
    try { clientRequestId = newRequestId(window.crypto); validateSendPayload({ text: content, media, clientRequestId }); }
    catch (error) { setSendStates((items) => ({ ...items, [conversationId]: { state: "failed", text: error.message } })); return; }
    if (liveSession) {
      if (!liveSession.liveSendEnabled) { refreshLivePermissions().catch(() => {}); return flash("Hesabın güncel gönderim izni kontrol ediliyor. Taslağınız korunuyor."); }
      if (selectedSendUncertain) return flash("Bu konuşmada önceki gönderimin durumu belirsiz. Yeniden gönderim engellendi.");
      const sendingScope = sendScopeRef.current.capture();
      sendInFlightRef.current = true; setLiveBusy(true);
      let transportStarted = false;
      const verifyContext = captureUiOperation(conversationId);
      // Persist a conservative lock before transport; closing or replacing a session cannot make a pending send retryable.
      // The lock starts only after the terminal price source preflight succeeds.
      const clearThisLock = () => setUncertainSends((items) => { if (items[conversationId]?.clientRequestId !== clientRequestId) return items; const next = { ...items }; delete next[conversationId]; return next; });
      setSendStates((items) => ({ ...items, [conversationId]: { state: "sending", text: media ? "Dosya yükleniyor ve gönderiliyor…" : "Mesaj gönderiliyor…" } }));
      try {
        if (entry.enabled) await verifyTerminalShare({storage:window.sessionStorage,actor:sessionIdentityRef.current,conversationId:String(conversationId),isCurrent:() => verifyContext() && draftRef.current === sendingDraft && (attachmentRef.current[conversationId] || null) === selectedMedia,readProduct:id => liveApi.canonicalCatalogProduct(liveKey,id,{conversationId})});
        if (!verifyContext()) return;
        setUncertainSends((items) => ({ ...items, [conversationId]: { clientRequestId, createdAt: new Date().toISOString() } }));
        transportStarted = true;
        const { message } = await liveApi.send(liveKey, conversationId, content, clientRequestId, media);
        if (!sendScopeRef.current.isCurrent(sendingScope)) return;
        clearThisLock();
        if (entry.enabled) { try { clearTerminalShare(window.sessionStorage,sessionIdentityRef.current,String(conversationId)); } catch { flash("Gönderildi; ürün doğrulama kaydı temizlenemedi. Sonraki ürün seçimini yeniden açın."); } }
        setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, messages: message ? [...(item.messages || []), message] : item.messages, preview: content || attachmentMediaLabel(media), waitingForReply: false } : item));
        nearBottomRef.current = true;
        applyStoredDrafts(textDraftStorageRef.current.clearSent(selected, sendingDraft, sendingDraftActor)); updateAttachment(conversationId, null);
        setPendingProducts([]); setPendingCatalogs([]); setTranslationReady(false);
        setSendStates((items) => ({ ...items, [conversationId]: { state: "sent", text: "Gönderim sunucu tarafından kabul edildi" } }));
      } catch (error) {
        if (!sendScopeRef.current.isCurrent(sendingScope)) return;
        if (!transportStarted) { clearThisLock();setSendStates((items) => ({ ...items, [conversationId]: {state:"failed",text:error.message || "Güncel fiyat doğrulanamadı."} }));return; }
        const state = classifySendFailure(error);
        if (state === "uncertain") {
          setUncertainSends((items) => ({ ...items, [conversationId]: { clientRequestId, createdAt: new Date().toISOString() } }));
          setSendStates((items) => ({ ...items, [conversationId]: { state, text: "Teslim durumu belirsiz. Yeniden gönderim kilitlendi; önce konuşmayı kontrol edin." } }));
        } else {
          clearThisLock();
          setSendStates((items) => ({ ...items, [conversationId]: { state: "failed", text: `${error.message || "Gönderim yapılamadı."} Taslağınız korunuyor.` } }));
          if (error.status === 401) void renewExpiredNormalSession();
        }
      } finally { if (sendScopeRef.current.isCurrent(sendingScope)) { sendInFlightRef.current = false; setLiveBusy(false); } }
      return;
    }
    setSentMessages((items) => [...items, { conversationId, text: draft, products: pendingProducts, catalogs: pendingCatalogs, media, time: messageClock(new Date()) }]);
    nearBottomRef.current = true;
    setDrafts((items) => ({ ...items, [conversationId]: "" })); updateAttachment(conversationId, null);
    setPendingProducts([]); setPendingCatalogs([]); setTranslationReady(false);
    setSendStates((items) => ({ ...items, [conversationId]: { state: "sent", text: "Önizlemeye eklendi · gerçek gönderim yapılmadı" } }));
  };

  if(liveMode&&!liveSession&&!semihEntry.checked)return <div className="login-gate"><section className="login-card" aria-label="Melisa CRM güvenli giriş"><h1>Melisa CRM</h1><p>Oturum kontrol ediliyor…</p></section></div>;
  if(liveMode&&!liveSession&&testAdminEnabled&&!manualTestLogin)return <div className="login-gate"><section className="login-card"><h1>TEST ADMIN</h1><p>{liveBusy?'CRM TEST açılıyor…':liveError||'CRM TEST oturumu hazırlanıyor…'}</p>{!liveBusy?<button className="primary-button" onClick={openTestAdmin}>Yeniden dene</button>:null}<button className="secondary-button" onClick={switchTestRole}>Gerçek rollerle giriş</button></section></div>;
  if (liveMode && !liveSession) return <LoginGate terminal={entry.enabled} linkedTerminal={linkedTerminal} credentials={loginCredentials} onChange={setLoginCredentials} onConnect={connectLive} busy={liveBusy} error={liveError} retryAvailable={linkedTerminal||Boolean(liveKey)||normalResumeAvailable} onRetry={resumeLiveSession} onChangeAccount={linkedTerminal?null:() => closeLiveSession("", true)} continueUser={linkedTerminal?null:semihEntry.user} onContinue={continueSemihSession} extraAction={linkedTerminal||semihEntry.enabled?null:entry.enabled && ["http://127.0.0.1:62400","http://127.0.0.1:62600","http://127.0.0.1:62700"].includes(window.location.origin) ? <button className="secondary-button" onClick={openTestPersonnel} disabled={liveBusy}>Personel oturumunu aç</button> : testAdminEnabled?<button className="secondary-button" onClick={returnToTestAdmin}>TEST ADMIN ile aç</button>:null} />;

  return (
    <div className={`app-shell redesigned whatsapp-ui${entry.enabled ? " terminal-entry" : ""}${inboxView ? " inbox-view" : ""}${terminalMode ? " compact-mode" : ""}${mobileChatOpen && inboxView ? " chat-open" : ""}${tabletInspectorOpen || desktopInspectorOpen ? " inspector-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><Butterfly size={32} weight="duotone" /><div><strong>melisa baby</strong><span>İLETİŞİM MERKEZİ</span></div></div>
        <span className="nav-section-title">ÇALIŞMA ALANI</span>
        <nav className="nav-list" aria-label="Ana menü">
          {import.meta.env.DEV && !liveMode ? <><button className="nav-item" aria-label="Ürün Seç (DEV)" title="Ürün Seç (DEV)" onClick={() => setModal("Ürün Gönder")}><Package size={21}/><span>Ürün Seç (DEV)</span></button><button className="nav-item" aria-label="Sipariş Önizlemesi (DEV)" title="Sipariş Önizlemesi (DEV)" onClick={() => setModal("draft")}><ClipboardText size={21}/><span>Sipariş Önizlemesi (DEV)</span></button></> : null}
          {[["Gelen Kutusu", "Mesajlar", ChatCircleDots], ...(canAssign ? [["Atanmamışlar", "Atanmamışlar", UserPlus]] : []), ["Müşteriler", "Müşteriler", Users], ...(CATALOG_ENABLED ? [["Taslak Siparişler", "Taslak Siparişler", ClipboardText]] : []), ...(!staffMode ? [["Yönetim Masası", "Ekip ve özet", ChartBar]] : [])].map(([view, label, Icon]) => <button key={view} title={label} className={`nav-item${view === "Atanmamışlar" ? (inboxView && filter === "Atanmamışlar" ? " active" : "") : activeView === view && !(inboxView && filter === "Atanmamışlar") ? " active" : ""}`} onClick={() => { setActiveView(view === "Atanmamışlar" ? "Gelen Kutusu" : view); setFilter(view === "Atanmamışlar" ? "Atanmamışlar" : "Tüm Konuşmalar"); setMobileChatOpen(false); }}><Icon size={21} weight={activeView === view ? "fill" : "regular"} /><span>{label}</span>{view === "Atanmamışlar" && visibleUnassignedCount > 0 ? <b>{visibleUnassignedCount}</b> : null}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => changeLayout(true)} title="Terminal görünümü"><DeviceMobile size={20} /><span>Terminal görünümü</span></button>
          <button className={activeView === "Ayarlar" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("Ayarlar")} title="Ayarlar"><Gear size={20} /><span>Ayarlar</span></button>
          <button className="sidebar-account" aria-label="Hesap ve menü" onClick={() => setRoleMenu((value) => value === "sidebar" ? false : "sidebar")}><Avatar initials={userName.slice(0, 2).toLocaleUpperCase("tr-TR")} compact /><div><strong>{userName}</strong><span>{roleLabel}</span></div></button>{roleMenu === "sidebar" ? <div className="profile-menu rail-profile-menu"><strong className="profile-name">{userName} · {roleLabel}</strong><button onClick={() => { setModal("notifications"); setRoleMenu(false); }}>Bildirimler</button><button onClick={() => { setActiveView("Ayarlar"); setRoleMenu(false); }}>Bağlantı ve ayarlar</button>{liveSession ? <button onClick={() => closeLiveSession("", true)}>Oturumu kapat</button> : <span className="demo-label">Örnek veriler</span>}</div> : null}
        </div>
      </aside>

      <main className="main-area">
        {testAdminEnabled?<div className="safety-strip"><strong>{liveSession?.testAdmin?'TEST ADMIN':'TEST rol kabulü'}</strong><span>Yalnız TEST · mevcut işlem sınırları geçerli</span><button className="secondary-button" onClick={liveSession?.testAdmin?switchTestRole:returnToTestAdmin}>{liveSession?.testAdmin?'Gerçek rollerle giriş':'TEST ADMIN ile aç'}</button></div>:null}
        <header className="topbar">
          {entry.enabled && entry.erpOrigin ? <button className="terminal-home" aria-label="Terminal ana sayfasına dön" onClick={() => terminalNavigation.current?.home()}><ArrowLeft size={22}/><span>Ana Sayfa</span></button> : null}<div className="workspace-title"><Butterfly size={25} weight="duotone" /><strong>{entry.enabled ? "MELISA TERMINAL" : terminalMode ? "Melisa CRM" : "İletişim merkezi"}</strong><span>{liveSession ? roleLabel : "Tasarım önizlemesi"}</span></div>
          <div className="topbar-actions">
            {liveSession ? <span className={syncStale ? "connection-label delayed" : "connection-label"} title={lastSyncAt ? `Son güncelleme ${lastSyncAt.toLocaleTimeString("tr-TR")}` : "Bağlantı kuruluyor"}>{syncStale ? "Güncelleme gecikti" : "Güncel"}</span> : <span className="demo-label">Örnek veriler</span>}
            {!staffMode && !entry.enabled ? <button className="layout-switch" title={terminalMode ? "Yönetim görünümü" : "Terminal görünümü"} aria-label={terminalMode ? "Yönetim görünümüne dön" : "Terminal görünümüne geç"} onClick={() => changeLayout(!terminalMode)}>{terminalMode ? <Desktop size={21} /> : <DeviceMobile size={21} />}<span>{terminalMode ? "Yönetim" : "Terminal"}</span></button> : null}
            <button className="notification-button" aria-label="Bildirimler" onClick={() => setModal("notifications")}><Bell size={22} />{notificationUnreadCount > 0 ? <b>{notificationUnreadCount}</b> : null}</button>
            <div className="top-profile-wrap"><button className="top-profile" aria-label="Hesabım" onClick={() => setRoleMenu((value) => value === "top" ? false : "top")} aria-expanded={roleMenu === "top"}><Avatar initials={userName.slice(0,2).toLocaleUpperCase("tr-TR")} compact /><CaretDown size={14} /></button>{roleMenu === "top" ? <div className="profile-menu top-profile-menu"><strong className="profile-name">{userName} · {roleLabel}</strong><button onClick={() => {setActiveView("Gelen Kutusu");setMobileChatOpen(false);setRoleMenu(false);}}>Mesajlar</button><button onClick={() => {setActiveView("Müşteriler");setMobileChatOpen(false);setRoleMenu(false);}}>Müşteriler</button>{CATALOG_ENABLED?<button onClick={() => {setActiveView("Taslak Siparişler");setMobileChatOpen(false);setRoleMenu(false);}}>Taslak Siparişler</button>:null}{!staffMode ? <button onClick={() => { changeLayout(!terminalMode); setRoleMenu(false); }}>{terminalMode ? "Yönetim görünümü" : "Terminal görünümü"}</button> : null}<button onClick={() => { setActiveView("Ayarlar"); setRoleMenu(false); }}>Ayarlar</button>{liveSession ? <button onClick={() => { setRoleMenu(false); closeLiveSession("", true); }}>Oturumu kapat</button> : null}</div> : null}</div>
          </div>
        </header>

        {entry.enabled && !online ? <div role="alert" className="connection-offline">Bağlantı yok — bu işlem çevrimiçi tamamlanmalıdır.</div> : null}
        {inboxView ? <div className={desktopInspectorOpen ? "workspace with-inspector" : "workspace"}>
          {(tabletInspectorOpen || desktopInspectorOpen) ? <button className="inspector-scrim" aria-label="Bilgi panelini kapat" onClick={() => { setTabletInspectorOpen(false); setDesktopInspectorOpen(false); }} /> : null}
          <section className="queue-panel" aria-label="Konuşmalar">
            <div className="queue-summary"><div className="queue-heading"><div><h1>{filter === "Atanmamışlar" ? "Atanmamışlar" : entry.enabled ? "Müşterilerim" : terminalMode ? "Mesajlarım" : "Mesajlar"}</h1><span className="queue-caption">{filter === "Atanmamışlar" ? `${visibleUnassignedCount} ${inboxPartial ? "yüklenen kayıtlarda " : ""}müşteri sorumlu bekliyor` : liveSession && summary.total == null ? `${conversations.length} konuşma · toplam yükleniyor…` : `${liveSession ? summary.total : conversations.length} konuşma`}</span></div>{liveSession ? <button className="refresh-queue" aria-label="Konuşmaları şimdi yenile" title={lastSyncAt ? `Son güncelleme ${lastSyncAt.toLocaleTimeString("tr-TR")}` : "Yenile"} onClick={() => setRefreshNonce((value) => value + 1)}><ArrowClockwise size={20} /></button> : <span className="queue-channel"><WhatsappLogo size={24} weight="fill" /></span>}</div></div>
            <label className="queue-search"><MagnifyingGlass size={20} /><input aria-label="Konuşmalarda ara" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="İsim, telefon, ülke veya mesaj ara" />{query ? <button aria-label="Aramayı temizle" onClick={() => setQuery("")}><X size={18}/></button> : null}</label>
            <div className="queue-filter-toggle"><button onClick={() => setCountryFilterOpen((value) => !value)} aria-expanded={countryFilterOpen}><SlidersHorizontal size={17}/>Ülke filtresi{countryFilter !== "all" ? " · etkin" : ""}<CaretDown size={13}/></button></div>{countryFilterOpen ? <label className="country-filter"><Globe size={18}/><span>Numara ülkesi</span><select aria-label="Numaranın ülkesine göre filtrele" value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}><option value="all">Tüm ülkeler</option>{countryOptions.map((region) => <option key={region.code} value={region.code}>{region.name} ({region.count})</option>)}</select></label> : null}
            <div className="queue-tabs" role="tablist" aria-label="Konuşma filtreleri">
              {[["Tüm Konuşmalar", "Tümü", null], ["Okunmamış", "Okunmamış", conversations.filter((item) => item.unread > 0).length], ...(canAssign ? [["Atanmamışlar", "Atanmamış", visibleUnassignedCount]] : [])].map(([value, label, count]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{label}{count > 0 ? <b>{count}</b> : null}</button>)}
            </div>
            {filter === "Bekleyenler" ? <div className="active-queue-filter">Yanıt bekleyenler<button onClick={() => setFilter("Tüm Konuşmalar")} aria-label="Yanıt bekleyen filtresini kaldır"><X size={18}/></button></div> : null}
            {liveSession && (inboxPartial || remainingConversationsError) ? <div className="queue-load-more" role="status"><span>{remainingConversationsError || (summary.total == null ? `${conversations.length} konuşma · toplam yükleniyor…` : `${conversations.length} / ${summary.total} konuşma`)}</span><button onClick={loadRemainingConversations} disabled={loadingMoreConversations}>{loadingMoreConversations ? "Yükleniyor…" : "Devamını yükle"}</button></div> : null}
            <div className="conversation-list">
              {filtered.map((item) => <div key={item.id} className={`conversation-item${selected.id === item.id ? " selected" : ""}${item.unread ? " has-unread" : ""}`}>
                <button className="conversation-row" onClick={() => selectConversation(item)} aria-label={`${item.name} konuşmasını aç`} aria-current={selected.id === item.id ? "true" : undefined}>
                  <span className="conversation-avatar"><Avatar initials={item.initials} /><span className={`channel-badge ${item.channel}`}><ChannelIcon channel={item.channel} size={14} /></span></span>
                  <span className="conversation-copy"><span className="conversation-line"><strong>{item.name}</strong><time>{item.wait}</time></span><span className="conversation-preview">{drafts[item.id] ? <><em>Taslak: </em>{drafts[item.id]}</> : item.preview}</span><span className="conversation-meta">{item.code && item.code !== "—" ? <span className="country-code-tag" title={`Numara ülkesi: ${item.country}`}>{item.code}</span> : null}<span className={item.owner === "Atanmamış" ? "owner-line unassigned-owner" : "owner-line"}>{item.owner === "Atanmamış" ? "Sorumlu bekliyor" : item.owner}</span>{item.unread > 0 ? <b className="unread">{item.unread}</b> : null}</span></span>
                </button>
                {item.owner === "Atanmamış" && canAssign && (!liveSession || canAssignConversation(liveSession,inboxCapabilities,item)) && filter === "Atanmamışlar" ? <button className="queue-assign" aria-label={`${item.name} için temsilci ata`} onClick={() => openAssignment(item)}><UserPlus size={18} /><span>Sorumlu seç</span><ArrowRight size={16}/></button> : null}
              </div>)}
              {!filtered.length ? <div className="empty-state"><CheckCircle size={32}/><strong>{inboxPartial ? "Yüklenen kayıtlarda sonuç yok" : (query || countryFilter !== "all") ? "Sonuç bulunamadı" : filter === "Atanmamışlar" ? "Herkesin bir sorumlusu var" : filter === "Okunmamış" ? "Tüm mesajlar okundu" : "Konuşma yok"}</strong><span>{inboxPartial ? (remainingConversationsError || (loadingMoreConversations ? "Diğer kayıtlar yükleniyor." : "Diğer kayıtlar henüz yüklenmedi. Devamını yükleyin.")) : (query || countryFilter !== "all") ? "Arama veya ülke filtresini değiştirin." : "Yeni mesajlar burada görünür."}</span>{(query || countryFilter !== "all") ? <button className="secondary-button" onClick={() => { setQuery(""); setCountryFilter("all"); }}>Filtreleri temizle</button> : null}</div> : null}
            </div>
            <div className={`queue-footer${syncStale ? " delayed" : ""}`}><span>{liveSession ? (syncStale ? "Güncelleme gecikti · bağlantıyı kontrol edin" : lastSyncAt ? `Son güncelleme ${lastSyncAt.toLocaleTimeString("tr-TR")}` : "Bağlanıyor…") : staffMode ? "Size atanan müşteriler" : filter === "Bekleyenler" ? `${visibleWaitingCount} yanıt bekliyor` : "En yeni konuşmalar üstte"}</span>{syncStale ? <Info size={16}/> : <CheckCircle size={16}/>}</div>
          </section>

          <section className="chat-panel">{liveSession && !liveSession.paidAiEnabled ? <div className="test-environment-label" role="status">Bu ortamda çeviri ve AI önerileri kapalı. Ücretli AI kullanılmaz.</div> : null}{import.meta.env?.VITE_CRM_TEST === "1" ? <div className="test-environment-label">{import.meta.env?.VITE_CRM_CLEAN_SYNTHETIC_TEST === "1" ? "YAPAY TEST · Mesaj gönderimi kapalı" : import.meta.env?.VITE_CRM_ISOLATED_PREPARATION === "1" ? "ORTAK TEST · Mesaj gönderimi kapalı" : "TEST · Gönderim yalnız …7733 hattına"}</div> : null}{liveSession ? <label className="automatic-translation-toggle"><input type="checkbox" disabled={!liveSession.paidAiEnabled} checked={automaticTranslation} onChange={event => {setAutomaticTranslation(event.target.checked);try{window.sessionStorage.setItem("melisa-crm-auto-translate",String(event.target.checked));}catch{}}} /> {entry.enabled ? `🌐 Otomatik Çeviri: ${automaticTranslation ? "AÇIK" : "KAPALI"}` : "Gelen mesajları otomatik Türkçeye çevir"}{entry.enabled ? <select aria-label="Mesaj gösterimi" value={translationDisplay} onChange={event => setTranslationDisplay(event.target.value)}><option value="original">Orijinali göster</option><option value="both">Orijinal + çeviri</option></select> : null}</label> : null}
            <header className="chat-header"><button className="chat-back" aria-label="Mesaj listesine dön" onClick={() => { closeVideoPilot(); setMobileChatOpen(false); }}><ArrowLeft size={24}/></button><Avatar initials={selected.initials} /><button className="chat-title" onClick={() => { setRightTab("Müşteri 360"); setDesktopInspectorOpen(true); setTabletInspectorOpen(true); }}><strong>{selected.name}</strong><span>{selected.id ? <><ChannelIcon channel={selected.channel} size={14}/><span title="Telefon numarasından belirlenen ülke / bölge">{selected.country}</span>{selected.language && selected.language !== "Belirtilmedi" ? ` · ${selected.language}` : ""}</> : "Bir konuşma seçin"}</span>{selected.phone ? <small className="chat-phone-number" dir="ltr">{selected.phoneDisplay || selected.phone}</small> : selected.id ? <small className="chat-phone-number unavailable">{phoneUnavailableLabel(selected)}</small> : null}</button><div className="chat-menu-wrap"><button className="inspector-toggle" aria-label="Konuşma menüsünü aç" aria-expanded={chatMenu} onClick={() => setChatMenu((value) => !value)}><DotsThree size={27} weight="bold"/></button>{chatMenu ? <><button className="menu-dismiss" aria-label="Konuşma menüsünü kapat" onClick={() => setChatMenu(false)}/><div className="chat-menu" role="menu"><button role="menuitem" onClick={() => { setChatMenu(false); setRightTab("Müşteri 360"); setDesktopInspectorOpen(true); setTabletInspectorOpen(true); }}><UserCircle size={20}/>Müşteri bilgileri</button>{canAssignSelected && selected.id ? <button role="menuitem" onClick={() => { setChatMenu(false); openAssignment(selected); }}><UserPlus size={20}/>Temsilci ata</button> : null}{selected.id ? <button role="menuitem" onClick={() => openVideoPilot(selected.id)}><VideoCamera size={20}/>Görüntülü görüşme · Jitsi</button> : null}<button role="menuitem" onClick={() => { setChatMenu(false); setRightTab("AI Çeviri"); setDesktopInspectorOpen(true); setTabletInspectorOpen(true); }}><Translate size={20}/>Yanıt dili ve çeviri</button><button role="menuitem" onClick={() => { setChatMenu(false); setActiveView("Ayarlar"); }}><Gear size={20}/>Bağlantı ve ayarlar</button></div></> : null}</div></header>
            <div className="chat-scroll" ref={chatScrollRef} onScroll={(event) => { const element = event.currentTarget; const away = element.scrollHeight - element.scrollTop - element.clientHeight > 120; nearBottomRef.current = !away; setShowJumpLatest(away); }}>
              {!selected.id ? <div className="empty-chat"><ChatCircleDots size={38} weight="duotone" /><strong>Konuşma seçilmedi</strong><span>Mesajları görmek için soldaki listeden bir müşteri seçin.</span></div> : <>
              <div className="date-pill">{liveSession && selected.messagesLoaded === false ? (detailLoadState.id === selected.id && detailLoadState.error ? detailLoadState.error : "Konuşma geçmişi yükleniyor…") : liveSession ? "Gerçek konuşma geçmişi" : "25 Eylül 2026, Cuma"}</div>
              {liveSession&&selected.detailLoaded&&selected.history?.hasMore?<button className="secondary-button" aria-label="Eski mesajları yükle" disabled={selectedOlderHistoryState.busy} onClick={loadOlderHistory}>{selectedOlderHistoryState.busy?'Yükleniyor…':'Eski mesajları yükle'}</button>:null}
              {selectedOlderHistoryState.error?<p role="alert">{selectedOlderHistoryState.error}</p>:null}
              {customerRequestsEnabled&&liveSession&&!liveSession.testAdmin&&!liveSession.testPersonnel&&selected.isLive&&selected.messagesLoaded!==false?<StaffProductRequests key={`${sessionIdentityRef.current}:${selected.id}:${selected.assignedUserId??''}`} accessToken={liveKey} conversationId={String(selected.id)} canIssue={['patron','mudur'].includes(liveSession.role)&&liveSession.permissions?.includes('crm.manage')} loadPhoto={loadRequestPhoto} onAuthorizationError={()=>void closeLiveSession('Oturum sona erdi. Yeniden giriş yapın.',true)}/>:null}
              {liveSession ? (selected.messages || []).map((message) => { const translated = incomingTranslations[`${selected.id}:${message.id}`]; const hasText = Boolean(message.text?.trim()); const isOutgoing = message.direction === "outgoing"; if (message.direction === "activity") return <p className="system-message" data-crm-message-id={message.id} key={message.id}>{message.text}</p>; return <div className={`message-block ${isOutgoing ? "outgoing" : "incoming"}`} data-crm-message-id={message.id} key={message.id}><span className="message-sender">{isOutgoing ? "Melisa Baby" : selected.name}</span>{hasText ? <div className={`message ${isOutgoing ? "outgoing" : "incoming"}`}><p>{message.text}</p><time>{messageClock(message.createdAt)}{isOutgoing ? <CheckCircle size={14} weight="fill" /> : null}</time></div> : null}<MessageAttachments attachments={message.attachments} createdAt={message.createdAt} outgoing={isOutgoing} />{!isOutgoing && hasText ? <><button className="translate-message" disabled={translated?.loading || !liveSession.paidAiEnabled} onClick={() => translateIncomingMessage(message)}><Translate size={16} />{translated?.loading ? "Çevriliyor…" : translated?.translatedText && !translated.hidden ? "Türkçe çeviriyi gizle" : "Türkçeye Çevir"}</button>{translated?.translatedText && !translated.hidden && (!entry.enabled || (translationDisplay === "both" && (!translated.automatic || automaticTranslation))) ? <div className="translation-inline"><span>Türkçe çeviri · {translated.detectedLanguage || "dil otomatik algılandı"}</span><p>{translated.translatedText}</p>{translated.warning ? <small>{translated.warning}</small> : null}</div> : null}{translated?.error ? <div className="translation-inline error"><span>Çeviri kullanılamıyor</span><p>{translated.error}</p></div> : null}</> : null}</div>; }) : <>
              <div className="message incoming"><p>{selected.foreign}</p><time>10:14</time></div>
              <button className="translate-message" onClick={() => setTranslatedIncoming((value) => !value)}><Translate size={16} />{translatedIncoming ? "Türkçe çeviriyi gizle" : "Türkçeye Çevir"}</button>
              {translatedIncoming ? <div className="translation-inline"><span>Türkçe çeviri</span><p>{selected.translation}</p></div> : null}
              <div className="message outgoing"><p>Merhaba, Melisa Baby’ye hoş geldiniz. Size yardımcı olmaktan memnuniyet duyarız.</p><time>10:16 <CheckCircle size={14} weight="fill" /></time></div>
              <div className="file-card"><span className="file-icon"><FilePdf size={22} weight="fill" /></span><div><strong>MelisaBaby_Tulum_FiyatListesi.pdf</strong><small>1.2 MB · PDF</small></div><button aria-label="Dosyayı indir"><DownloadSimple size={19} /></button></div>
              <div className="link-card"><span><Link size={20} /></span><div><strong>2026 Sonbahar–Kış Kataloğu</strong><small>katalog.melisababy.com</small></div><ArrowRight size={18} /></div>
              <div className="message incoming second"><p>Merci. Avez-vous ces modèles en 3 couleurs différentes ? Nous recherchons particulièrement la crème, le rose poudré et la menthe.</p><time>10:22</time></div>
              <button className="translate-message" onClick={() => setTranslatedIncoming(true)}><Translate size={16} />Türkçeye Çevir</button>
              {sentMessages.filter((item) => item.conversationId === selected.id).map((item, index) => <div className="sent-group" key={`${item.time}-${index}`}>{item.text ? <div className="message outgoing"><p>{item.text}</p><time>{item.time} <CheckCircle size={14} weight="fill" /></time></div> : null}{item.media ? <div className="demo-outbound-media">{item.media.mediaType === "image" ? <img src={item.media.dataUrl} alt={item.media.fileName}/> : ["audio", "video"].includes(item.media.mediaType) ? <OutboundPlaybackPreview media={item.media} /> : <FilePdf size={30}/>}<span>{item.media.fileName}</span><small>{item.time}</small></div> : null}{(item.products || []).map((product) => <div className="product-message-card" key={`${product.id}-${index}`}><span className="product-visual"><Package size={28} weight="duotone" /></span><div><small>{product.id} · {product.group}</small><strong>{product.name}</strong><span>{product.colors.join(" · ")}</span><b>{product.price} <em>{product.quantity} adet</em></b></div><CheckCircle size={18} weight="fill" /></div>)}{(item.catalogs || []).map((catalog) => <div className="catalog-message-card" key={`${catalog.id}-${index}`}><span><BookOpen size={24} weight="duotone" /></span><div><small>{catalog.id}</small><strong>{catalog.title}</strong><em>{catalog.link}</em></div><CheckCircle size={18} weight="fill" /></div>)}</div>)}
              </>}
              </>}
            </div>
            {showJumpLatest && selected.id ? <button className="jump-latest" onClick={() => scrollToLatest()}><ArrowRight size={16} />En yeni mesaja git</button> : null}
            <div className="composer-area">
              {liveSession && selected.id ? <SalesSuggestion key={`${sessionIdentityRef.current}:${selected.id}`} state={salesSuggestion} allowed={Boolean(salesContextKey) && liveSession.paidAiEnabled === true} token={liveKey} isCurrent={() => salesDraftFlowRef.current.isPreviewCurrent()} onInvalidate={error=>salesDraftFlowRef.current.invalidate(error)} onRequest={catalogSearch => void salesDraftFlowRef.current.start({catalogSearch})} onTakeDraft={takeSalesDraft} onTakeProduct={takeSalesProduct} onClose={() => salesDraftFlowRef.current.close()} /> : null}
              {false && <div className="quick-actions">{quickActions.map(([label, Icon]) => <button key={label} onClick={() => setModal(label)} disabled={Boolean(liveSession)} title={liveSession ? "Canlı görüntülü görüşme henüz bağlı değil" : undefined}><Icon size={18} />{label}</button>)}</div>}
              {pendingProducts.length ? <div className="pending-products"><div><strong>Gönderime eklendi</strong><span>Müşteriye göndermeden önce kontrol edin.</span></div>{pendingProducts.map((product, index) => <div className="pending-product" key={`${product.id}-${index}`}><span><Package size={20} weight="duotone" /></span><p><strong>{product.name}</strong><small>{product.id} · {product.price} · {product.quantity} adet</small></p><button aria-label={`${product.name} ürününü kaldır`} onClick={() => setPendingProducts((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={17} /></button></div>)}</div> : null}
              {pendingCatalogs.length ? <div className="pending-catalogs">{pendingCatalogs.map((catalog, index) => <div className="pending-catalog" key={catalog.id}><span><BookOpen size={20} weight="duotone" /></span><p><strong>{catalog.title}</strong><small>{catalog.detail}</small></p><button aria-label={`${catalog.title} kataloğunu kaldır`} onClick={() => setPendingCatalogs((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={17} /></button></div>)}</div> : null}
              {translationReady && aiOpen ? <div className="translation-preview"><div className="translation-heading"><span><Sparkle size={17} weight="fill" />{liveSession ? (translationResult?.targetLanguage || "Müşteri dili") : selected.language} gönderim önizlemesi</span><span className="translation-safe">Otomatik gönderilmez</span></div><p className="foreign-preview">{liveSession ? translationResult?.translatedText : outgoingTranslation.foreign}</p><div className="back-translation"><strong>Türkçe geri çeviri</strong><p>{liveSession ? (translationResult?.backTranslation || "Geri çeviri sağlanmadı.") : outgoingTranslation.back}</p></div>{liveSession && translationResult?.warning ? <p className="translation-warning">{translationResult.warning}</p> : null}<div className="translation-controls">{!liveSession ? <><span>Üslup:</span>{Object.keys(translations).map((item) => <button key={item} className={tone === item ? "tone active" : "tone"} onClick={() => setTone(item)}>{item}</button>)}</> : <span>{translationResult?.detectedLanguage ? `Kaynak: ${translationResult.detectedLanguage}` : "Türkçe taslak"}</span>}<button className="edit-translation" onClick={() => setTranslationReady(false)}>Düzenle</button><button className="use-translation" onClick={useTranslation}>Bu çeviriyi kullan</button></div></div> : null}
              {translationError ? <div className="translation-error"><Translate size={16} /><span>{translationError}</span></div> : null}
              <div className="composer-toolbar compact-translation-toolbar"><button className="translation-settings" onClick={() => { setRightTab("AI Çeviri"); setTabletInspectorOpen(true); setDesktopInspectorOpen(true); }}><Translate size={19}/><span>Yanıt dili</span><b>{targetLanguage === "auto" ? "Otomatik" : {en:"İngilizce",fr:"Fransızca",ar:"Arapça",de:"Almanca",it:"İtalyanca",es:"İspanyolca",bg:"Bulgarca",ru:"Rusça",ro:"Romence",sq:"Arnavutça"}[targetLanguage]}</b><CaretDown size={13}/></button><span className="composer-hint">Ctrl + Enter ile gönder</span></div>
              <input className="visually-hidden" type="file" aria-label="Fotoğraf, belge, ses veya video dosyası" ref={fileInputRef} accept={fileAccept} onChange={selectAttachment}/>
              {pendingAttachment ? <div className={`attachment-preview ${pendingAttachment.state}`} role="status">{pendingAttachment.mediaType === "image" && pendingAttachment.dataUrl ? <img src={pendingAttachment.dataUrl} alt={pendingAttachment.fileName}/> : pendingAttachment.mediaType === "audio" ? <MusicNote size={32} weight="duotone"/> : pendingAttachment.mediaType === "video" ? <VideoCamera size={32} weight="duotone"/> : <FilePdf size={32} weight="duotone"/>}<div><strong>{pendingAttachment.fileName}</strong><OutboundPlaybackPreview media={pendingAttachment}/><span>{`${formatFileSize(pendingAttachment.size)}${pendingAttachment.size ? " · " : ""}${attachmentStatusText(pendingAttachment, sendState, selectedSendUncertain)}`}</span></div><button aria-label="Eki kaldır" disabled={liveBusy} onClick={() => updateAttachment(selectedId, null)}><X size={21}/></button></div> : null}
              {CATALOG_ENABLED&&liveSession?<div className="conversation-catalog-actions" aria-label="Ürün işlemleri">{["Ürün Gönder","Katalog","Fiyat"].map(label=><button key={label} type="button" disabled={!selected.id||liveBusy||selectedSendUncertain||(entry.enabled&&!online)} onClick={openCatalog}>{label}</button>)}</div>:null}<div className="composer-row"><div className="attachment-control"><button className="attach-button" aria-label="Dosya ekle" aria-expanded={attachmentMenu} disabled={!selected.id || liveBusy || (selectedSendUncertain && !entry.enabled)} onClick={() => setAttachmentMenu((value) => !value)}><Paperclip size={24}/></button>{attachmentMenu ? <><button className="menu-dismiss" aria-label="Ek menüsünü kapat" onClick={() => setAttachmentMenu(false)}/><div className="attachment-menu" role="menu"><button role="menuitem" onClick={() => chooseAttachment("image")}><Image size={23} weight="duotone"/><span>Fotoğraf<small>JPEG, PNG veya WebP</small></span></button><button role="menuitem" onClick={() => chooseAttachment("pdf")}><FilePdf size={23} weight="duotone"/><span>PDF belgesi<small>Dosya seç</small></span></button><button role="menuitem" onClick={() => chooseAttachment("txt")}><FileText size={23} weight="duotone"/><span>TXT dosyası<small>Metin dosyası seç</small></span></button><button role="menuitem" onClick={() => chooseAttachment("audio")}><MusicNote size={23} weight="duotone"/><span>Ses dosyası<small>MP3, M4A, OGG veya WAV</small></span></button><button role="menuitem" onClick={() => chooseAttachment("video")}><VideoCamera size={23} weight="duotone"/><span>Video<small>MP4 dosyası seç</small></span></button><button role="menuitem" disabled={!CATALOG_ENABLED} title={!CATALOG_ENABLED ? "ERP bağlantısı henüz etkin değil" : undefined} onClick={openCatalog}><BookOpen size={23} weight="duotone"/><span>Katalog oluştur<small>{CATALOG_ENABLED ? "Ürünleri seç · PDF veya fotoğraf" : "ERP bağlantısı henüz etkin değil"}</small></span></button><p>Tek dosya · en fazla 3 MB<br/>Seçtikten sonra Gönder’e basın</p></div></> : null}</div><textarea aria-label="Mesajınız" ref={composerRef} value={draft} maxLength={2000} onChange={(event) => { setDraft(event.target.value); setTranslationReady(false); setTranslationResult(null); setTranslationError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} placeholder={selected.id ? "Mesaj yazın…" : "Önce bir konuşma seçin"} rows={1} disabled={!selected.id || liveBusy} /><button className="ai-button" aria-label="Mesajı çevir" onClick={translateDraft} disabled={!selected.id || translationBusy || !draft.trim() || (liveSession && (import.meta.env?.VITE_CRM_ISOLATED_PREPARATION === "1" || liveSession.paidAiEnabled !== true))}><Translate size={21}/><span>{translationBusy ? "Çevriliyor…" : "Çevir"}</span></button><button className="send-button" aria-label="Mesajı gönder" onClick={sendMessage} disabled={!selected.id || (entry.enabled && !online) || selectedSendUncertain || (!draft.trim() && !pendingAttachment) || pendingAttachment?.state === "reading" || pendingAttachment?.state === "error" || liveBusy || (liveSession && !liveSession.liveSendEnabled)}><PaperPlaneTilt size={21} weight="fill" /><span>{liveBusy ? "Gönderiliyor…" : "Gönder"}</span></button></div>
              {sendState ? <div className={`send-state ${sendState.state}`} role={sendState.state === "failed" || sendState.state === "uncertain" ? "alert" : "status"}>{sendState.state === "sending" ? <ArrowClockwise size={16}/> : sendState.state === "sent" ? <Check size={16}/> : <Info size={16}/>}<span>{sendState.text}</span></div> : null}
              {entry.enabled && selectedSendUncertain ? <button className="secondary-button" type="button" disabled={liveBusy || !online} onClick={checkSendStatus}>Gönderim durumunu kontrol et</button> : null}
              {entry.enabled && selectedSendUncertain ? <p className="approval-note">Kontrol için önceki mesajı ve aynı dosyayı koruyun; gerekirse Dosya ekle ile yeniden seçin. Bu kontrol mesaj göndermez.</p> : null}
              {selectedSendUncertain && !["uncertain", "sending"].includes(sendState?.state) ? <p className="approval-note send-warning" role="alert">Önceki mesajın teslimi doğrulanamadı. Tekrar göndermeden önce konuşmayı kontrol edin.</p> : liveSession && (!liveSession.liveSendEnabled || permissionCheck.error) ? <div className="send-permission-notice" role="status"><span>{permissionCheck.busy ? "Gönderim izni kontrol ediliyor…" : permissionCheck.error || (liveSession.liveSendState === "unknown" ? "Sunucu bu hesabın gönderim durumunu bildirmedi." : liveSession.liveSendState === "forbidden" ? "Bu hesabın mesaj gönderme yetkisi yok." : "Sunucu bu hesap için gönderimi kapalı bildiriyor.")}</span><button type="button" onClick={() => refreshLivePermissions().catch(() => {})} disabled={permissionCheck.busy}><ArrowClockwise size={17}/>{permissionCheck.busy ? "Kontrol ediliyor…" : "Gönderim iznini yenile"}</button></div> : null}

              {liveSession && draftStorageWarning ? <p className="approval-note send-warning" role="status">Mesaj taslağı bu sekmede kaydedilemedi. Yenilemeden önce metni kopyalayın.</p> : null}
            </div>
          </section>

          <aside className={tabletInspectorOpen ? "inspector-panel tablet-open" : "inspector-panel"} aria-label="Çeviri ve müşteri bilgisi">
            <div className="tablet-drawer-header"><strong>Konuşma ayrıntıları</strong><button className="tablet-drawer-close" aria-label="Çeviri ve müşteri panelini kapat" onClick={() => { setTabletInspectorOpen(false); setDesktopInspectorOpen(false); }}><X size={21} /></button></div>
            <div className="inspector-tabs" role="tablist">{["AI Çeviri", "Müşteri 360"].map((tab) => <button key={tab} role="tab" aria-selected={rightTab === tab} className={rightTab === tab ? "active" : ""} onClick={() => setRightTab(tab)}>{tab === "Müşteri 360" ? "Müşteri" : "Çeviri"}</button>)}</div>
            {rightTab === "AI Çeviri" ? <div className="inspector-content"><div className="assistant-status"><span className="assistant-icon"><Sparkle size={22} weight="fill" /></span><div><strong>Çeviri yardımcısı</strong><p>Gelen yabancı mesajları Türkçeye, yazdığınız mesajları müşterinin diline çevirir.</p></div><b>{translationBusy ? "Çalışıyor" : liveSession ? "İstekle" : "Demo"}</b></div><div className="language-section"><label htmlFor="target-language">Yanıt dili</label><div className="language-select"><span className="country-code">{selected.code}</span><select id="target-language" value={targetLanguage} onChange={(event) => { setTargetLanguage(event.target.value); setTranslationReady(false); setTranslationResult(null); }}><option value="auto">Otomatik algıla</option><option value="en">İngilizce</option><option value="fr">Fransızca</option><option value="ar">Arapça</option><option value="de">Almanca</option><option value="it">İtalyanca</option><option value="es">İspanyolca</option><option value="bg">Bulgarca</option><option value="ru">Rusça</option><option value="ro">Romence</option><option value="sq">Arnavutça</option></select><CaretDown size={15} /></div><button className="primary-button language-translate" disabled={!draft.trim() || translationBusy || (liveSession && !liveSession.paidAiEnabled)} onClick={() => { setTabletInspectorOpen(false); setDesktopInspectorOpen(false); translateDraft(); }}><Translate size={18}/>{translationBusy ? "Çevriliyor…" : "Mesajı bu dile çevir"}</button></div><div className="info-box"><Sparkle size={18} weight="fill" /><span>{liveSession ? "Çeviri yalnız siz istediğinizde çalışır. Sonuç önce gösterilir; hiçbir mesaj otomatik gönderilmez." : "Demo çevirisini göndermeden önce kontrol edin."}</span></div><CustomerSummary selected={selected} onAssign={() => openAssignment(selected)} canAssign={canAssignSelected} /></div> : <div className="inspector-content customer-full"><CustomerSummary selected={selected} onAssign={() => openAssignment(selected)} canAssign={canAssignSelected} expanded /></div>}
          </aside>
        </div> : <BackofficeView activeView={activeView} conversations={conversations} query={query} products={productSeed} catalogs={catalogSeed} draftOrders={draftOrders} draftOrderStorageWarning={draftOrderStorageWarning} onOpenDraft={openSavedErpDraft} role={role} liveSession={liveSession} canAssign={canAssign} getSalesRulesContext={currentSalesRulesContext} onRefreshSession={refreshLivePermissions} summary={effectiveSummary} agents={agents} inboxPartial={inboxPartial} agentLoadState={agentLoadState} onRefreshAgents={(options)=>sessionLoaderRef.current?.refreshAgents(options)} onOpenConversation={(id, targetFilter = "Tüm Konuşmalar") => { const conversation = conversations.find((item) => String(item.id) === String(id)); if (!conversation) return; selectConversation(conversation); setFilter(targetFilter); setActiveView("Gelen Kutusu"); }} onOpenProduct={(id) => { setSelectedProductId(id); setModal("Ürün Gönder"); }} onOpenCatalog={() => setModal("Katalog")} onOpenPrice={() => setModal("Fiyat")} onOpenVideo={openVideoPilot} onCreateDraft={() => liveSession ? openCatalog() : setModal("draft")} onOpenNotifications={() => setModal("notifications")} onNotify={flash} />}
      </main>

      {modal === "erp-order" && erpOrderContext?.current() && String(selected.id) === erpOrderContext.recipientId ? <ERPOrderDialog token={liveKey} actorKey={entry.enabled ? `terminal:${sessionIdentityRef.current}` : sessionIdentityRef.current} conversation={selected} items={erpOrderContext.items} recoveryOnly={erpOrderContext.recoveryOnly} onNewDraft={()=>{setErpOrderContext(null);refreshNativeDraftOrders();openCatalog();}} isCurrent={erpOrderContext.current} onClose={()=>{setModal(null);setErpOrderContext(null);refreshNativeDraftOrders();}} onSaved={order=>{if(order.request)setErpDraftContexts(values=>({...values,[String(selected.id)]:{requestId:order.request.requestId,customerId:order.request.customerId,items:order.request.items.map(line=>({erpProductId:line.productId,stockCode:line.stockCode,quantity:line.quantity}))}}));const card=nativeOrderReceiptCard(order,{customer:selected.name,owner:userName});setDraftOrders(items=>[card,...items.filter(item=>item.requestId!==card.requestId)]);flash(`ERP taslağı yeniden okundu: ${order.documentNo||order.orderNo||order.id}`);}}/> : null}
      {CATALOG_ENABLED && modal === "catalog-builder" && selected.id && liveSession && catalogContextCurrent() ? <CatalogWorkspace conversationId={entry.enabled ? selected.id : undefined} existingStock={CATALOG_EXISTING_STOCK_ENABLED} authMode={CATALOG_CRM_ONLY_ENABLED?"crm":"erp"} key={`${sessionIdentityRef.current}:${roleLabel}:${selected.id}`} token={liveKey} isCurrent={catalogContextCurrent} onSession={session=>{catalogSessionRef.current=session;}} onSource={setCatalogSource} onCrmExpired={()=>{void renewExpiredNormalSession();}} customer={selected} identity={sessionIdentityRef.current} role={roleLabel} canAttach={Boolean(liveSession.liveSendEnabled && !selectedSendUncertain)} onClose={closeCatalog} onAttach={attachCatalogOutput} onProductAction={catalogProductAction} attachmentExists={Boolean(pendingAttachment)} /> : null}
      {toast ? <div className="toast" role="status"><CheckCircle size={20} weight="fill" />{toast}</div> : null}
      {modal === "assign" && canAssignTarget ? <Modal title="Temsilci ata" onClose={() => !assignmentBusy && setModal(null)}><div className="modal-body"><div className="selected-customer"><Avatar initials={(conversations.find((item) => String(item.id) === String(assignmentTargetId)) || selected).initials} /><div><strong>{(conversations.find((item) => String(item.id) === String(assignmentTargetId)) || selected).name}</strong><span>Bu konuşmadan kim sorumlu olacak?</span></div></div>{liveSession && (agentLoadState.busy || agentLoadState.error) ? <p role={agentLoadState.error ? "alert" : "status"}>{agentLoadState.busy ? "Temsilciler yükleniyor…" : agentLoadState.error}{agentLoadState.error ? <button onClick={()=>sessionLoaderRef.current?.refreshAgents()}>Yeniden dene</button> : null}</p> : null}<div className="assignee-list" role="radiogroup" aria-label="Sorumlu temsilci">{(liveSession ? agents.map((agent) => ({ id: String(agent.id), name: agent.name })) : teamOptions.slice(1).map((name) => ({ id: name, name }))).map((agent) => <button key={agent.id} role="radio" aria-checked={selectedAssigneeId === agent.id} className={selectedAssigneeId === agent.id ? "assignee-option selected" : "assignee-option"} onClick={() => { setSelectedAssigneeId(agent.id); setAssignmentError(""); }}><Avatar initials={agent.name.split(" ").map((part) => part[0]).join("").slice(0, 2)} compact /><span className="assignee-person"><strong>{agent.name}</strong><small>{conversations.filter((item) => item.owner === agent.name).length} {inboxPartial ? "görünür " : ""}konuşma</small></span><span className="assignee-check">{selectedAssigneeId === agent.id ? <Check size={16} weight="bold" /> : null}</span></button>)}</div>{assignmentError ? <p className="assignment-error" role="alert">{assignmentError}</p> : null}<div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)} disabled={assignmentBusy}>Vazgeç</button><button className="primary-button" onClick={confirmAssignment} disabled={!selectedAssigneeId || assignmentBusy || (liveSession && (agentLoadState.busy || Boolean(agentLoadState.error)))}><UserPlus size={18} />{assignmentBusy ? "Atanıyor…" : "Atamayı onayla"}</button></div></div></Modal> : null}
      {!liveSession && modal === "draft" ? <Modal title="ERP Taslak Sipariş" onClose={() => setModal(null)}><div className="modal-body"><div className="safety-banner"><CheckCircle size={21} weight="fill" /><div><strong>Güvenli taslak modu</strong><span>Bu önizleme stok düşürmez, siparişi kesinleştirmez ve henüz ERP’ye veri göndermez.</span></div></div><div className="draft-summary"><span>Müşteri<strong>{selected.name}</strong></span><span>Miktar birimi<strong>Adet</strong></span><span>Ürün satırı<strong>{pendingProducts.length || "Ürün bekleniyor"}</strong></span></div>{pendingProducts.length ? <div className="draft-lines">{pendingProducts.map((product, index) => <div key={`${product.id}-${index}`}><span><Package size={18} /></span><p><strong>{product.name}</strong><small>{product.id} · {product.quantity} adet · {product.price}</small></p></div>)}</div> : <button className="add-draft-product" onClick={() => setModal("Ürün Gönder")}><Plus size={17} />Siparişe ürün seç</button>}<div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Vazgeç</button><button className="primary-button" onClick={createDraftOrder}><ClipboardText size={18} />Taslak Önizleme Oluştur</button></div></div></Modal> : null}
      {!liveSession && modal === "Ürün Gönder" ? <Modal title="Ürün Seç ve Gönder" onClose={() => setModal(null)}><div className="product-picker"><label className="product-search"><MagnifyingGlass size={18} /><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Ürün adı, stok kodu veya barkod…" autoFocus /><Barcode size={21} /></label><div className="product-picker-layout"><div className="product-results">{filteredProducts.map((product) => <button key={product.id} className={selectedProductId === product.id ? "product-row selected" : "product-row"} onClick={() => setSelectedProductId(product.id)}><span className="product-thumb"><Package size={25} weight="duotone" /></span><span><small>{product.id} · {product.group}</small><strong>{product.name}</strong><em>{product.colors.join(" · ")}</em></span><b>{product.price}<small>{product.stock} stok</small></b></button>)}{!filteredProducts.length ? <div className="product-empty"><Barcode size={28} /><strong>Ürün bulunamadı</strong><span>Barkodu veya ürün adını kontrol edin.</span></div> : null}</div><div className="product-selection">{(() => { const product = productSeed.find((item) => item.id === selectedProductId); return product ? <><span className="selected-product-icon"><Package size={36} weight="duotone" /></span><small>{product.id} · {product.barcode}</small><h3>{product.name}</h3><p>{product.group} · {product.series}</p><div className="color-list">{product.colors.map((color) => <span key={color}>{color}</span>)}</div><div className="price-stock"><span>Fiyat<strong>{product.price}</strong></span><span>Stok<strong>{product.stock}</strong></span></div><label>Adet<div className="quantity-stepper"><button onClick={() => setProductQuantity((value) => Math.max(1, value - 1))} aria-label="Adedi azalt"><Minus size={16} /></button><strong>{productQuantity}</strong><button onClick={() => setProductQuantity((value) => Math.min(99, value + 1))} aria-label="Adedi artır"><Plus size={16} /></button></div></label></> : null; })()}</div></div><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Vazgeç</button><button className="primary-button" onClick={addSelectedProduct}><Paperclip size={18} />Gönderime Ekle</button></div></div></Modal> : null}
      {!liveSession && modal === "Katalog" ? <Modal title="Katalog Seç" onClose={() => setModal(null)}><div className="modal-body catalog-picker"><p className="modal-intro">Müşterinin diline uygun kataloğu seçip gönderim önizlemesine ekleyin.</p>{catalogSeed.map((catalog) => <button className="catalog-choice" key={catalog.id} onClick={() => addCatalog(catalog)}><span><BookOpen size={24} weight="duotone" /></span><div><small>{catalog.id} · {catalog.updated}</small><strong>{catalog.title}</strong><em>{catalog.detail}</em></div><ArrowRight size={18} /></button>)}<div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Vazgeç</button></div></div></Modal> : null}
      {!liveSession && modal === "Fiyat" ? <Modal title="Fiyat Listesi Gönder" onClose={() => setModal(null)}><div className="modal-body"><div className="selected-customer"><Avatar initials={selected.initials} /><div><strong>{selected.name}</strong><span>{selected.country} · {selected.language}</span></div></div><div className="price-preview"><span><FilePdf size={28} weight="fill" /></span><div><small>{priceListSeed.id} · {priceListSeed.updated}</small><strong>{priceListSeed.title}</strong><p>{priceListSeed.detail}</p></div><b>EUR</b></div><div className="info-box"><Translate size={18} /><span>Dosya adı ve kısa açıklama müşterinin diline göre hazırlanır. Göndermeden önce mesaj alanında görürsünüz.</span></div><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Vazgeç</button><button className="primary-button" onClick={() => addCatalog(priceListSeed)}><Paperclip size={18} />Gönderime Ekle</button></div></div></Modal> : null}
      {modal === "Video" && videoContextCurrent ? <Modal title="Görüntülü görüşme · Jitsi pilot" onClose={closeVideoPilot}><JitsiPilot key={`${videoContext.epoch}:${videoContext.recipientId}`} customer={selected} products={catalogSource.state === "ready" ? catalogSource.products : []} isCurrent={isVideoContextCurrent} onClose={closeVideoPilot} /></Modal> : null}
      {modal === "notifications" ? <Modal title="Bildirimler" onClose={() => setModal(null)}><div className="notification-center"><div className="notification-toolbar"><span>{notificationUnreadCount} okunmamış mesaj</span>{notificationUnreadCount ? <button onClick={markAllNotificationsRead}>Tümünü okundu işaretle</button> : <small>Yeni bildirim yok</small>}</div><div className="notification-list">{notificationItems.map((item) => <button key={item.id} className={item.unread ? "notification-row unread-notification" : "notification-row"} onClick={() => { if (item.conversationId) { const conversation = conversations.find((current) => String(current.id) === String(item.conversationId)); if (conversation) selectConversation(conversation); setFilter("Tüm Konuşmalar"); setActiveView("Gelen Kutusu"); setModal(null); return; } setNotifications((items) => items.map((current) => current.id === item.id ? { ...current, unread: false } : current)); }}><span className={`notification-icon ${item.type}`}>{item.type === "video" ? <PhoneCall size={20} /> : item.type === "waiting" ? <Clock size={20} /> : <UserPlus size={20} />}</span><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.time}</small></div>{item.unread ? <b /> : null}</button>)}{!notificationItems.length ? <div className="empty-state"><CheckCircle size={28} /><strong>Yeni bildirim yok</strong><span>Yeni WhatsApp mesajları burada görünür.</span></div> : null}</div>{liveSession ? <p className="notification-note">Okundu işaretleri bu CRM oturumunda saklanır; yeni mesaj gelirse bildirim yeniden görünür.</p> : null}<div className="modal-actions notification-actions"><button className="secondary-button" onClick={() => setModal(null)}>Kapat</button></div></div></Modal> : null}
      {modal && !["catalog-builder", "erp-order", "assign", "draft", "Ürün Gönder", "Katalog", "Fiyat", "Video", "notifications"].includes(modal) ? <Modal title={modal} onClose={() => setModal(null)}><div className="modal-body"><div className="action-placeholder"><Package size={38} weight="duotone" /><strong>{modal} akışı hazırlanıyor</strong><span>Bu bölüm gerçek bağlantılar açılmadan önce güvenli demo alanında tutuluyor.</span></div><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Kapat</button></div></div></Modal> : null}
    </div>
  );
}

function BackofficeView({ activeView, conversations, query, products, catalogs, draftOrders, draftOrderStorageWarning, onOpenDraft, role, liveSession, canAssign, getSalesRulesContext, onRefreshSession, summary, agents, inboxPartial=false, agentLoadState={busy:false,error:""}, onRefreshAgents, onOpenConversation, onOpenProduct, onOpenCatalog, onOpenPrice, onOpenVideo, onCreateDraft, onOpenNotifications, onNotify }) {
  const visibleCustomers = conversations.filter((item) => matchesContactSearch(item, query));
  const unassigned = conversations.filter((item) => item.owner === "Atanmamış");
  const waiting = conversations.filter((item) => item.waitingForReply === true);
  const isLive = Boolean(liveSession);
  const totalCount = isLive ? summary.total ?? "Yükleniyor…" : conversations.length;
  const unreadCount = isLive ? summary.unread ?? "Yükleniyor…" : conversations.reduce((sum, item) => sum + item.unread, 0);
  const unassignedCount = inboxPartial ? unassigned.length : isLive ? summary.unassigned ?? unassigned.length : unassigned.length;
  const waitingCount = inboxPartial ? waiting.length : isLive ? summary.pendingHumanReply ?? waiting.length : waiting.length;
  const countryCount = new Set(conversations.map((item) => item.code).filter((code) => code && code !== "—")).size;
  const teamRoster = isLive ? agents : team.slice(1).map((name, index) => ({ id: `demo-${index}`, name }));
  const teamLoad = teamRoster.map((agent) => ({
    ...agent,
    initials: agent.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR"),
    count: conversations.filter((item) => String(item.assignedUserId ?? "") === String(agent.id) || item.owner === agent.name).length,
  }));
  const currentUserName = liveSession?.username || liveSession?.name || liveSession?.displayName || role;

  if (isLive && activeView === "Ürün Kataloğu") return <section className="backoffice-page"><PageHeading eyebrow="MELİSA CRM" title="Ürün bağlantısı hazırlanıyor" text="Ürün ve sipariş verileri bu bağlantıda henüz kullanılamıyor." /></section>;

  if (activeView === "El Terminali") return <TerminalPreview conversations={conversations} onOpenConversation={onOpenConversation} onOpenProduct={onOpenProduct} onOpenCatalog={onOpenCatalog} onOpenPrice={onOpenPrice} onOpenVideo={onOpenVideo} onCreateDraft={onCreateDraft} />;

  if (activeView === "Müşteriler") return (
    <section className="backoffice-page">
      <PageHeading eyebrow={isLive ? "CANLI MÜŞTERİ VERİSİ" : "MÜŞTERİ YÖNETİMİ"} title="Müşteriler" text="Müşteri kartlarını ve sorumlu temsilci bilgisini tek ekrandan görüntüleyin." action={<button className="primary-button" onClick={() => onOpenConversation(conversations[0]?.id)}><ChatCircleDots size={18} />Konuşmaları Aç</button>} />
      <div className="metric-row"><Metric value={totalCount} label="toplam konuşma" /><Metric value={unassignedCount} label={inboxPartial ? "yüklenenlerde atanmamış" : "atanmamış"} warning /><Metric value={unreadCount} label={inboxPartial ? "yüklenenlerde okunmamış mesaj" : "okunmamış mesaj"} /><Metric value={countryCount || "—"} label="tespit edilen ülke" /></div>
      <div className="data-card"><div className="data-card-heading"><div><strong>Müşteri listesi</strong><span>{visibleCustomers.length} kayıt gösteriliyor{isLive && totalCount > conversations.length ? ` · toplam ${totalCount}` : ""}</span></div>{isLive ? <small>Canlı CRM · ilk {conversations.length} kayıt</small> : <button className="secondary-button" onClick={() => onNotify("Müşteri filtreleri uygulandı.")}><SlidersHorizontal size={17} />Filtrele</button>}</div><div className="customer-table"><div className="table-head"><span>Müşteri</span><span>Ülke / Dil</span><span>Sorumlu</span><span>Durum</span><span /></div>{visibleCustomers.map((item) => <div className="table-row" key={item.id}><span className="customer-cell"><Avatar initials={item.initials} compact /><span><strong>{item.name}</strong><small>{item.phoneDisplay || item.phone || phoneUnavailableLabel(item)}</small></span></span><span><strong>{item.country}</strong><small>{item.language}</small></span><span>{item.owner}</span><span><b className={item.owner === "Atanmamış" ? "status-pill warning" : "status-pill"}>{item.owner === "Atanmamış" ? "Atama Bekliyor" : "Aktif"}</b></span><button className="row-action" onClick={() => onOpenConversation(item.id)}><ChatCircleDots size={17} />Konuşmayı aç</button></div>)}</div></div>
    </section>
  );

  if (activeView === "Taslak Siparişler") return (
    <section className="backoffice-page">
      <PageHeading eyebrow="ERP HAZIRLIK" title="Taslak Siparişler" text="Kesinleşmeden ve stok düşmeden önce siparişleri kontrol edin." action={<button className="primary-button" onClick={onCreateDraft}><Plus size={18} />Yeni Taslak</button>} />
      <div className="safety-strip"><CheckCircle size={20} weight="fill" /><span><strong>ERP güvenlik kuralı aktif.</strong> {isLive ? "Bu tarayıcı oturumunda korunan son taslaklar gösterilir. Kaydı açınca aynı ERP hesabıyla sunucudan yeniden okunur. Satış, stok ve cari hareketi oluşmaz." : "Bu ekrandaki kayıtlar yerel önizlemedir; ERP’ye kaydedilmez."}</span></div>{draftOrderStorageWarning?<p role="alert">{draftOrderStorageWarning}</p>:null}
      <div className="data-card"><div className="data-card-heading"><div><strong>{isLive?"Bu tarayıcı oturumundaki taslaklar":"Açık taslaklar"}</strong><span>{draftOrders.length} kayıt</span></div>{!isLive?<button className="secondary-button" onClick={() => onNotify("Taslak sipariş özeti indirilmeye hazırlandı (demo).")}><DownloadSimple size={17} />Dışa aktar</button>:null}</div><div className="order-grid">{draftOrders.map((order) => <article className="order-card" key={order.id} data-crm-request-id={order.requestId}><div className="order-id"><span><ClipboardText size={20} /></span><div><small>{order.documentNo||order.id}</small><strong>{order.customer}</strong></div><b>{order.status}</b></div><div className="order-meta"><span>Toplam<strong>{order.total}</strong></span><span>Ürün satırı<strong>{order.lines}</strong></span><span>Sorumlu<strong>{order.owner}</strong></span></div><footer><span>{order.updated}</span><button onClick={() => { if(isLive)onOpenDraft(order);else if(order.conversationId)onOpenConversation(order.conversationId); }} disabled={!order.conversationId}>{isLive?"Taslağı aç":"Müşteriyi aç"} <ArrowRight size={15} /></button></footer></article>)}</div>{!draftOrders.length?<div className="empty-state"><ClipboardText size={32}/><strong>{isLive?"Bu tarayıcı oturumunda taslak yok":"Henüz sipariş taslağı yok"}</strong><span>{isLive?"Müşteriyi seçip kataloğundan ürün ekleyin; ERP taslağını kaydettikten sonra buradan yeniden açabilirsiniz.":"Bir müşteri için ürün seçip taslak önizleme oluşturun."}</span></div>:null}</div>
    </section>
  );

  if (activeView === "Ürün Kataloğu") return (
    <section className="backoffice-page">
      <PageHeading eyebrow="SATIŞ İÇERİKLERİ" title="Ürün Kataloğu" text="Barkod, stok kodu veya ürün adıyla seçim yapın; müşteriye göndermeden önce önizleyin." action={<button className="primary-button" onClick={onOpenCatalog}><BookOpen size={18} />Katalog Paylaş</button>} />
      <div className="catalog-overview"><div><strong>{products.length}</strong><span>demo ürün</span></div><div><strong>{products.reduce((sum, item) => sum + item.stock, 0)}</strong><span>toplam stok görünümü</span></div><div><strong>{catalogs.length}</strong><span>aktif katalog</span></div><small>Gerçek stok ve fiyat ERP bağlantısı açıldığında salt okunur gelir.</small></div>
      <div className="product-board">{products.filter((item) => `${item.name} ${item.id} ${item.barcode}`.toLocaleLowerCase("tr-TR").includes(normalizedQuery)).map((product) => <button className="product-tile" key={product.id} onClick={() => onOpenProduct(product.id)}><span className="product-tile-icon"><Package size={30} weight="duotone" /></span><small>{product.id} · {product.group}</small><strong>{product.name}</strong><em>{product.colors.join(" · ")}</em><div><b>{product.price}</b><span>{product.stock} stok</span></div><footer><Barcode size={15} />{product.barcode}<ArrowRight size={16} /></footer></button>)}</div>
    </section>
  );

  if (activeView === "Raporlar") return (
    <section className="backoffice-page">
      <PageHeading eyebrow={isLive ? "CANLI CRM ÖZETİ" : "YÖNETİCİ ÖZETİ"} title="Raporlar" text="Mevcut CRM verisindeki konuşma ve ekip dağılımını gösterir." />
      <div className="metric-row report-metrics"><Metric value={totalCount} label="aktif konuşma" /><Metric value={waitingCount} label={inboxPartial ? "yüklenenlerde yanıt bekleyen" : "yanıt bekleyen"} warning /><Metric value={unreadCount} label={inboxPartial ? "yüklenenlerde okunmamış mesaj" : "okunmamış mesaj"} /><Metric value={unassignedCount} label={inboxPartial ? "yüklenenlerde atanmamış" : "atanmamış"} warning /></div>
      <div className="report-layout"><div className="data-card team-load"><div className="data-card-heading"><div><strong>Ekip konuşma dağılımı</strong><span>{isLive ? "Chatwoot temsilcileri · canlı" : "Demo ekip"}</span></div></div>{teamLoad.length ? teamLoad.map((agent) => <div key={agent.id}><span className="avatar avatar-compact">{agent.initials}</span><p><strong>{agent.name}</strong><small>{agent.count} görünür konuşma</small></p><b>{isLive ? (agent.count ? "Konuşması var" : inboxPartial ? "Diğer kayıtlar yükleniyor" : "Atama yok") : agent.count ? "Aktif" : "Boş"}</b></div>) : <div className="empty-state"><Users size={28} /><strong>{agentLoadState.busy ? "Temsilciler yükleniyor…" : agentLoadState.error ? "Temsilciler alınamadı" : "Temsilci bulunamadı"}</strong><span>{agentLoadState.error || (agentLoadState.busy ? "Gerçek ekip listesi bekleniyor." : "Agent listesi API’den gelmedi.")}</span>{agentLoadState.error ? <button onClick={onRefreshAgents}>Yeniden dene</button> : null}</div>}</div><div className="data-card settings-card"><div className="data-card-heading"><div><strong>Veri kapsamı</strong><span>Yanlış veya tahmini metrik gösterilmez</span></div></div><div className="setting-row"><span>Canlı listede gösterilen</span><strong>{conversations.length} konuşma</strong><CheckCircle size={18} weight="fill" /></div><div className="setting-row"><span>Toplam aktif kayıt</span><strong>{totalCount}</strong><CheckCircle size={18} weight="fill" /></div><div className="setting-row"><span>Yenileme</span><strong>Görünür sekmede: konuşma 6 sn · kutu 20 sn</strong><CheckCircle size={18} weight="fill" /></div><div className="setting-row"><span>Yanıt süresi raporu</span><strong>Henüz API’de yok</strong><Clock size={18} /></div></div></div>
    </section>
  );

  if (activeView === "Yönetim Masası") return (
    <section className="backoffice-page">
      <PageHeading eyebrow={`${role.toLocaleUpperCase("tr-TR")} KONTROL MERKEZİ`} title="Yönetim Masası" text="Bekleyen müşterilere, atanmamış havuza ve ekip yüküne ilk bakış." action={<button className="primary-button" onClick={onOpenNotifications}><Bell size={18} />Bildirimleri Aç</button>} />
      <div className="management-grid"><article className="priority-card danger-card"><span><Clock size={23} /></span><div><small>Yanıt bekleyenler</small><strong>{waitingCount}</strong><p>Müşterinin son mesajına cevap verilmemiş</p></div><button onClick={() => onOpenConversation(waiting[0]?.id || conversations[0]?.id, "Bekleyenler")}>Kuyruğu aç <ArrowRight size={16} /></button></article><article className="priority-card warning-card"><span><UserPlus size={23} /></span><div><small>Atanmamış havuz</small><strong>{unassignedCount}</strong><p>Yeni müşteri sorumlusu bekliyor</p></div><button onClick={() => onOpenConversation(unassigned[0]?.id || conversations[0]?.id, "Atanmamışlar")}>Atama yap <ArrowRight size={16} /></button></article><article className="priority-card"><span><ChatCircleDots size={23} /></span><div><small>Tüm aktif konuşmalar</small><strong>{totalCount}</strong><p>Canlı WhatsApp görüşmeleri</p></div><button onClick={() => onOpenConversation(conversations[0]?.id)}>Tümünü gör <ArrowRight size={16} /></button></article></div>
      <div className="report-layout"><div className="data-card team-load"><div className="data-card-heading"><div><strong>Ekip yükü</strong><span>{isLive ? "Canlı konuşma dağılımı" : "Aktif konuşma dağılımı"}</span></div></div>{teamLoad.map((agent) => <div key={agent.id}><span className="avatar avatar-compact">{agent.initials}</span><p><strong>{agent.name}</strong><small>{agent.count} görünür konuşma</small></p><b>{isLive ? (agent.count ? "Konuşması var" : inboxPartial ? "Diğer kayıtlar yükleniyor" : "Atama yok") : agent.count ? "Aktif" : "Boş"}</b></div>)}</div><div className="data-card next-actions"><div className="data-card-heading"><div><strong>Önerilen işlemler</strong><span>Canlı kuyruk</span></div></div><button onClick={() => onOpenConversation(unassigned[0]?.id || conversations[0]?.id, "Atanmamışlar")}><UserPlus size={19} /><span><strong>Atanmamış müşterileri dağıt</strong><small>{unassignedCount} müşteri sorumlu bekliyor</small></span><ArrowRight size={16} /></button><button onClick={() => onOpenConversation(waiting[0]?.id || conversations[0]?.id, "Bekleyenler")}><Clock size={19} /><span><strong>Yanıt bekleyenleri kontrol et</strong><small>{waitingCount} konuşma yanıt bekliyor</small></span><ArrowRight size={16} /></button><button onClick={onOpenNotifications}><Bell size={19} /><span><strong>Bildirimleri gözden geçir</strong><small>{unreadCount} okunmamış mesaj</small></span><ArrowRight size={16} /></button></div></div>
    </section>
  );

  if (activeView === "Kullanıcılar") return (
    <section className="backoffice-page">
      <PageHeading eyebrow={isLive ? "CANLI YETKİ VE EKİP" : "YETKİ VE EKİP"} title="Kullanıcılar" text={isLive ? "CRM oturum yetkisini ve bağlı Chatwoot temsilcilerini görüntüleyin." : "Müdür, patron ve satış personelinin erişimlerini yönetin."} />
      <div className="permission-note"><CheckCircle size={20} weight="fill" /><span><strong>Sabit yetki kuralı:</strong> Müdür, Patron ve yetkili personel müşteri atayabilir. Mesaj gönderme yetkisi kullanıcının CRM hesabından belirlenir.</span></div>
      {isLive ? <div className="user-grid"><article className="user-card"><div><Avatar initials={role === "Patron" ? "P" : role === "Müdür" ? "M" : "P"} /><span><strong>{currentUserName}</strong><small>{role} · CRM oturumu</small></span><b className="online">Çevrimiçi</b></div><dl><span>Mesaj yetkisi<strong>{liveSession.canSend ? "Yetkili" : "Kapalı"}</strong></span><span>Canlı gönderim<strong>{liveSession.liveSendEnabled ? "Açık" : "Kapalı"}</strong></span><span>Müşteri atama<strong>{liveSession.canAssign ? "Açık" : "Kapalı"}</strong></span></dl></article>{teamLoad.map((agent) => <article className="user-card" key={agent.id}><div><Avatar initials={agent.initials} /><span><strong>{agent.name}</strong><small>Chatwoot temsilcisi</small></span><b className="online">Listede</b></div><dl><span>Görünür konuşma<strong>{agent.count}</strong></span><span>Mesaj gönderme<strong>CRM rolüne bağlı</strong></span><span>Müşteri atama<strong>CRM rolüne bağlı</strong></span></dl></article>)}</div> : <div className="user-grid">{[["Melih Yönetici", "Patron", "P", "Çevrimiçi", 8], ["Merve Demir", "Müdür", "MD", "Çevrimiçi", 6], ["Ahmet Yılmaz", "Satış Personeli", "AY", "Meşgul", 4], ["Zeynep Kaya", "Yetkili Personel", "ZK", "Çevrimiçi", 3], ["Murat Demir", "Satış Personeli", "MD", "Dışarıda", 2]].map(([name, userRole, initials, presence, load]) => <article className="user-card" key={`${name}-${userRole}`}><div><Avatar initials={initials} /><span><strong>{name}</strong><small>{userRole}</small></span><b className={presence === "Çevrimiçi" ? "online" : ""}>{presence}</b></div><dl><span>Aktif konuşma<strong>{load}</strong></span><span>Mesaj gönderme<strong>{["Patron", "Müdür"].includes(userRole) ? "Açık" : "Kapalı"}</strong></span><span>Müşteri atama<strong>{["Patron", "Müdür", "Yetkili Personel"].includes(userRole) ? "Açık" : "Kapalı"}</strong></span></dl><button className="secondary-button" onClick={() => onNotify(`${name} için yetki önizlemesi açıldı.`)}><Gear size={16} />Yetkileri Düzenle</button></article>)}</div>}
    </section>
  );

  return (
    <section className="backoffice-page">
      <PageHeading eyebrow="WHATSAPP CRM" title="Ayarlar" text="Mesajlaşma, çeviri ve hesap bağlantısı." />
      {isLive ? <AccountInfo identity={liveSession.accountIdentity} /> : null}
      {isLive ? <ConnectionStatusCard session={liveSession} onRefreshSession={onRefreshSession} /> : null}
      {isLive && import.meta.env?.VITE_CRM_CLEAN_SYNTHETIC_TEST === '1' && liveSession.permissions?.includes('crm.manage') ? <CrmUserInventory getContext={getSalesRulesContext} onChanged={()=>onRefreshAgents({afterMutation:true})} /> : null}
      {isLive ? <SalesRulesSettings key={getSalesRulesContext().identity} getContext={getSalesRulesContext} /> : null}
      <div className="integration-grid crm-only"><IntegrationCard icon={<WhatsappLogo size={25} weight="fill" />} title="Şirket WhatsApp Hattı" detail="Melisa Baby müşteri görüşmeleri" state={isLive ? (liveSession.liveSendEnabled ? "Gönderim açık" : "Gelen bağlı") : "Demo"} tone="green" bullets={isLive ? ["Gelen konuşmalar canlı görüntüleniyor", liveSession.liveSendEnabled ? "Bu hesabın mesaj gönderme yetkisi açık" : "Bu oturumda gönderim izni etkin değil", "Mesajlar yalnız siz gönderdiğinizde iletilir"] : ["Demo konuşma verisi", "Gerçek mesaj gönderilmez", "Bağlantı kurulmadan güvenli kullanım"]} onAction={() => onNotify(isLive ? (liveSession.liveSendEnabled ? "WhatsApp gönderimi yetkili kullanıcılar için açık." : "Hesap iznini ve bağlantıyı bu ekrandan kontrol edebilirsiniz.") : "Demo bağlantı ayrıntıları gösterildi.")} /><IntegrationCard icon={<Sparkle size={25} weight="fill" />} title="AI Çeviri" detail="Gelen mesaj → Türkçe · Yanıt → müşteri dili" state={isLive ? "Sunucu kontrollü" : "Demo"} tone="blue" bullets={isLive ? ["Gelen mesajı Türkçeye çevir", "Gelen mesajın aslı korunur", "Sonuç onaylanmadan taslağa alınmaz ve gönderilmez"] : ["Demo çeviri önizlemesi", "Çeviri kullanıcı onayından sonra kullanılır", "Otomatik mesaj gönderilmez"]} onAction={() => onNotify(isLive ? "AI çeviri konuşma ekranındaki düğmelerle isteğe bağlı çalışır." : "Demo çeviri önizlemesi açık.")} /></div>
      <div className="data-card settings-card"><div className="data-card-heading"><div><strong>Güvenlik ve çalışma kuralları</strong><span>WhatsApp CRM başlangıç modu</span></div></div>{[["CRM açılışı", "Doğrudan Mesajlarım / Gelen Kutusu"], ["Yeni müşteriler", "Atanmamışlar havuzuna düşer"], ["Bilgisayardan mesaj", isLive ? (liveSession.liveSendEnabled ? "Bu oturumda açık" : "Bu oturumda kapalı") : "Yalnız Müdür ve Patron"], ["Müşteri atama", (isLive ? (canAssign ? "Bu oturumda açık" : "Bu oturumda kapalı · salt okunur") : "Müdür, Patron ve yetkili personel")], ["Ürün, fiyat ve ERP", "Katalogdan ürün ve fiyat mesajı, ERP TEST taslak siparişi kullanılabilir"]].map(([key, value]) => <div className="setting-row" key={key}><span>{key}</span><strong>{value}</strong><CheckCircle size={18} weight="fill" /></div>)}</div>
    </section>
  );
}

function ConnectionStatusCard({ session, onRefreshSession }) {
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = async () => {
    setBusy(true); setError("");
    try {
      const [result] = await Promise.all([liveApi.health(), onRefreshSession()]);
      setHealth(result);
    } catch { setError("Bağlantı durumu alınamadı. Tekrar kontrol edin."); }
    finally { setBusy(false); }
  };
  useEffect(() => { check(); }, []);
  const status = (value) => value === true ? "Açık" : value === false ? "Kapalı" : "Kontrol ediliyor";
  return <section className="data-card settings-card" aria-label="Canlı bağlantı durumu">
    <div className="data-card-heading"><div><strong>Canlı bağlantı durumu</strong><span>WhatsApp bağlantısı ve hesap izni ayrı kontrol edilir.</span></div><button className="secondary-button" onClick={check} disabled={busy}>{busy ? "Kontrol ediliyor…" : "Bağlantıyı kontrol et"}</button></div>
    {error ? <p role="alert">{error}</p> : null}
    {[["WhatsApp bağlantısı", health ? (health.providerConnected ? "Bağlı" : "Bağlı değil") : "Kontrol ediliyor"], ["Servisin gönderime hazırlığı", status(health?.sendReady)], ["Bu hesabın gönderim izni", session.liveSendState === "unknown" ? "Sunucu bildirmedi" : status(session.liveSendEnabled)], ["Çeviri servisi", status(health?.translationEnabled)]].map(([label,value]) => <div className="setting-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    {health?.sendReady && !session.liveSendEnabled ? <p className="approval-note send-warning">WhatsApp hazır, ancak bu oturumun gönderim izni etkin değil.</p> : null}
    <details className="connection-diagnostics"><summary>Oturum izin ayrıntıları</summary>{session.permissionSignals?.length ? session.permissionSignals.map((flag) => <div className="setting-row" key={flag.name}><code>{flag.name}</code><strong>{flag.value}</strong></div>) : <p>Sunucu bu oturumda gönderim durumunu bildirmedi.</p>}</details>
  </section>;
}

function PageHeading({ eyebrow, title, text, action }) {
  return <header className="page-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</header>;
}

function Metric({ value, label, warning = false }) {
  return <div className={warning ? "metric-card warning" : "metric-card"}><strong>{value}</strong><span>{label}</span></div>;
}

function IntegrationCard({ icon, title, detail, state, tone, bullets, onAction }) {
  return <article className={`integration-card ${tone}`}><header><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><b>{state}</b></header><ul>{bullets.map((item) => <li key={item}><Check size={14} />{item}</li>)}</ul><button className="secondary-button" onClick={onAction}>Bağlantı Ayrıntıları</button></article>;
}

function TerminalPreview({ conversations, onOpenConversation, onOpenVideo }) {
  const [terminalTab, setTerminalTab] = useState("Mesajlarım");
  const [terminalSelected, setTerminalSelected] = useState(conversations[0]?.id);
  const selected = conversations.find((item) => item.id === terminalSelected) || conversations[0];
  return <section className="backoffice-page terminal-page"><PageHeading eyebrow="ANDROID EL TERMİNALİ" title="Mobil CRM" text="Küçük ekranda büyük dokunma alanlarıyla WhatsApp konuşmalarını ve müşteri atamalarını yönetin." action={<button className="secondary-button" onClick={() => onOpenConversation(selected?.id)}>Masaüstünde Aç</button>} /><div className="terminal-stage"><div className="terminal-notes"><span><strong>1</strong>CRM doğrudan Mesajlarım ile açılır.</span><span><strong>2</strong>Yeni müşteriler Atanmamışlar havuzuna gelir.</span><span><strong>3</strong>Gelen mesajlar müşteri ve dil bilgisiyle görünür.</span><span><strong>4</strong>Ürün, fiyat ve ERP bu aşamada kullanılmaz.</span></div><div className="device-frame"><div className="device-status"><span>09:41</span><b>Melisa CRM</b><Bell size={16} /></div><div className="device-tabs">{["Mesajlarım", "Atanmamışlar"].map((tab) => <button className={terminalTab === tab ? "active" : ""} key={tab} onClick={() => setTerminalTab(tab)}>{tab === "Müşteri 360" ? "Müşteri" : "Çeviri"}</button>)}</div>{terminalTab === "Mesajlarım" ? <><div className="terminal-list">{conversations.slice(0, 3).map((item) => <button className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => setTerminalSelected(item.id)}><Avatar initials={item.initials} compact /><span><strong>{item.name}</strong><small>{item.preview}</small></span>{item.unread ? <b>{item.unread}</b> : null}</button>)}</div><div className="terminal-chat"><header><Avatar initials={selected?.initials || "MB"} compact /><span><strong>{selected?.name}</strong><small>{selected?.language} · {selected?.owner}</small></span></header><div className="terminal-bubble">{selected?.foreign}</div><button className="terminal-translate" onClick={() => onOpenConversation(selected?.id)}><Translate size={15} />Türkçeye çevir</button><div className="terminal-actions terminal-actions-chat"><button onClick={() => onOpenConversation(selected?.id)}><ChatCircleDots size={18} />Konuşma</button><button disabled={!selected?.id} onClick={() => onOpenVideo(selected?.id)}><VideoCamera size={18} />Video</button></div><div className="terminal-composer"><input readOnly placeholder="Mesajınızı yazın…" onClick={() => onOpenConversation(selected?.id)} /><button onClick={() => onOpenConversation(selected?.id)}><PaperPlaneTilt size={18} weight="fill" /></button></div></div></> : <div className="terminal-pool">{conversations.filter((item) => item.owner === "Atanmamış").map((item) => <button key={item.id} onClick={() => { setTerminalSelected(item.id); onOpenConversation(item.id, "Atanmamışlar"); }}><Avatar initials={item.initials} /><span><strong>{item.name}</strong><small>{item.country} · {item.wait} bekliyor</small></span><UserPlus size={19} /></button>)}</div>}<nav className="device-nav device-nav-two"><button className="active" onClick={() => setTerminalTab("Mesajlarım")}><ChatCircleDots size={20} /><span>Mesajlar</span></button><button onClick={() => setTerminalTab("Atanmamışlar")}><Users size={20} /><span>Müşteriler</span></button></nav></div></div></section>;
}

function CustomerSummary({ selected, onAssign, canAssign = false, expanded = false }) {
  if (!selected.id) return <section className="customer-summary"><h2>Müşteri bilgileri</h2><p>Bir konuşma seçin.</p></section>;
  const liveCustomer = Boolean(selected.isLive);
  return (
    <section className={expanded ? "customer-summary expanded" : "customer-summary"}>
      <h2>Müşteri bilgileri</h2>
      <div className="customer-heading"><Avatar initials={selected.initials} /><div><strong>{selected.name}</strong><span>{liveCustomer ? selected.country : `Toptancı · ${selected.country}`}</span></div><b>{liveCustomer ? selected.status || "Aktif" : "Potansiyel"}</b></div>
      <CustomerPhone customer={selected}/><dl className="customer-details">{expanded && selected.email ? <div><dt><EnvelopeSimple size={17} /></dt><dd>{selected.email}</dd></div> : null}<div><dt><Globe size={17} /></dt><dd>Dil <strong>{selected.language}</strong></dd></div></dl>
      <button className="customer-assignment" onClick={onAssign} disabled={!canAssign || !selected.id}><UserCircle size={22}/><span>Sorumlu<strong>{selected.owner}</strong></span>{canAssign ? <UserPlus size={20}/> : null}</button>
      <div className="customer-tags"><div><strong>Müşteri Etiketleri</strong></div>{liveCustomer ? selected.tags?.length ? selected.tags.map((tagName) => <span key={tagName}>{tagName}</span>) : <span>Etiket yok</span> : <><span>Toptancı</span><span>Bebek Giyim</span><span>Yeni Müşteri</span></>}</div>
      {expanded ? <div className="erp-facts"><span>Kanal<strong>WhatsApp</strong></span><span>Mesaj durumu<strong>{selected.unread ? `${selected.unread} okunmamış` : "Okundu"}</strong></span><span>Bekleme<strong>{selected.wait}</strong></span></div> : null}
      <div className="notes"><div><strong>Notlar</strong>{liveCustomer ? null : <button><NotePencil size={15} />Not Ekle</button>}</div><p>{liveCustomer ? "Müşteri notları bu canlı bağlantıda henüz sunulmuyor." : "25.09.2026 – İlk kez ulaştı. 6–24 ay tulum fiyat listesi talep etti. 3 renk (krem, pudra, mint) ile ilgileniyor. Minimum 24 adet ve stok bilgisi paylaşılacak."}</p></div>
    </section>
  );
}
