import { isPostgresConfigured, query, transaction } from '../services/db.js';
import { env } from '../config/env.js';
import { resolvePhoneIdentity } from '../utils/phoneIdentity.js';

function toNullable(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function getContactName(event) {
  return event.contactName || event.phone || null;
}

function mapMessageDirection(direction) {
  return direction === 'outbound' ? 'out' : 'in';
}

function buildMessageRawPayload(event) {
  return {
    ...(event.rawPayload || {}),
    crmMedia: event.media || null,
  };
}

async function ensureInstance(client, event) {
  const result = await client.query(`
    INSERT INTO crm_instances (provider, instance_key, display_name, status)
    VALUES ($1, $2, $3, 'connected')
    ON CONFLICT (instance_key)
    DO UPDATE SET
      provider = EXCLUDED.provider,
      display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), crm_instances.display_name),
      status = 'connected',
      updated_at = NOW()
    RETURNING id
  `, [event.provider, event.instanceKey, event.instanceKey]);

  return result.rows[0].id;
}

async function upsertContact(client, event) {
  if (!event.phone) return null;

  const result = await client.query(`
    INSERT INTO crm_contacts (provider, phone, display_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (provider, phone)
    DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, crm_contacts.display_name),
      updated_at = NOW()
    RETURNING id
  `, [event.provider, event.phone, getContactName(event)]);

  return result.rows[0].id;
}

async function upsertConversation(client, { instanceId, contactId, event }) {
  if (!contactId) return null;

  const unreadIncrement = event.direction === 'inbound' ? 1 : 0;

  const result = await client.query(`
    INSERT INTO crm_conversations (instance_id, contact_id, status, last_message_at, unread_count)
    VALUES ($1, $2, 'open', $3, $4)
    ON CONFLICT (instance_id, contact_id) WHERE contact_id IS NOT NULL
    DO UPDATE SET
      last_message_at = GREATEST(
        COALESCE(crm_conversations.last_message_at, EXCLUDED.last_message_at),
        EXCLUDED.last_message_at
      ),
      unread_count = crm_conversations.unread_count + $4,
      updated_at = NOW()
    RETURNING id
  `, [instanceId, contactId, event.receivedAt, unreadIncrement]);

  return result.rows[0].id;
}

async function insertEvent(client, event) {
  const result = await client.query(`
    INSERT INTO crm_events (provider, event_id, event_type, instance_key, payload)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING id
  `, [
    event.provider,
    event.eventId,
    event.eventType,
    event.instanceKey,
    JSON.stringify(event.rawPayload || {}),
  ]);

  return result.rows[0]?.id || null;
}

async function insertMessage(client, { conversationId, event }) {
  if (!conversationId || (!event.messageId && !event.text)) return null;

  const result = await client.query(`
    INSERT INTO crm_messages (
      conversation_id,
      provider,
      provider_message_id,
      direction,
      message_type,
      body,
      status,
      raw_payload,
      received_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
    ON CONFLICT (provider, provider_message_id)
    DO UPDATE SET
      conversation_id = EXCLUDED.conversation_id,
      body = COALESCE(EXCLUDED.body, crm_messages.body),
      raw_payload = EXCLUDED.raw_payload
    RETURNING id
  `, [
    conversationId,
    event.provider,
    toNullable(event.messageId),
    event.direction,
    event.messageType || 'text',
    event.text || null,
    event.direction === 'outbound' ? 'sent' : 'received',
    JSON.stringify(buildMessageRawPayload(event)),
    event.receivedAt,
  ]);

  return result.rows[0]?.id || null;
}

export async function persistWebhookEvent(event) {
  return transaction(async (client) => {
    const eventRowId = await insertEvent(client, event);

    if (!eventRowId) {
      return {
        duplicate: true,
        eventId: event.eventId,
      };
    }

    const instanceId = await ensureInstance(client, event);
    const contactId = await upsertContact(client, event);
    const conversationId = await upsertConversation(client, { instanceId, contactId, event });
    const messageId = await insertMessage(client, { conversationId, event });

    await client.query('UPDATE crm_events SET processed_at = NOW() WHERE id = $1', [eventRowId]);

    return {
      duplicate: false,
      eventId: event.eventId,
      instanceId,
      contactId,
      conversationId,
      messageId,
    };
  });
}

export async function persistOutboundMessage({ conversationId, providerResult }) {
  if (!conversationId) return null;

  const result = await transaction(async (client) => {
    const messageResult = await client.query(`
      INSERT INTO crm_messages (
        conversation_id,
        provider,
        provider_message_id,
        direction,
        message_type,
        body,
        status,
        raw_payload,
        received_at
      )
      VALUES ($1, $2, $3, 'outbound', $4, $5, 'sent', $6::jsonb, $7)
      ON CONFLICT (provider, provider_message_id)
      DO UPDATE SET
        conversation_id = EXCLUDED.conversation_id,
        body = EXCLUDED.body,
        status = EXCLUDED.status,
        raw_payload = EXCLUDED.raw_payload
      RETURNING id, received_at
    `, [
      conversationId,
      providerResult.provider,
      toNullable(providerResult.providerMessageId),
      providerResult.messageType || 'text',
      providerResult.text,
      JSON.stringify({
        ...(providerResult.providerResponse || {}),
        crmMedia: providerResult.media || null,
      }),
      providerResult.sentAt,
    ]);

    await client.query(`
      UPDATE crm_conversations
      SET
        last_message_at = GREATEST(COALESCE(last_message_at, $2), $2),
        unread_count = 0,
        updated_at = NOW()
      WHERE id = $1
    `, [conversationId, providerResult.sentAt]);

    return messageResult.rows[0] || null;
  });

  return result ? {
    id: result.id,
    direction: 'out',
    type: providerResult.messageType || 'text',
    text: providerResult.text,
    imageUrl: providerResult.media?.mediaUrl || '',
    mimeType: providerResult.media?.mimeType || '',
    fileName: providerResult.media?.fileName || '',
    time: new Date(result.received_at).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul',
    }),
    status: 'sent',
    received_at: result.received_at,
  } : null;
}

export async function getMessageMediaSource(messageId) {
  const result = await query(`
    SELECT
      message.id,
      conversation.id AS conversation_id,
      conversation.assigned_user_id,
      CASE
        WHEN COALESCE(
          message.raw_payload #> '{data,message,message,stickerMessage}',
          message.raw_payload #> '{data,message,stickerMessage}',
          message.raw_payload #> '{message,stickerMessage}'
        ) IS NOT NULL THEN 'sticker'
        WHEN COALESCE(
          message.raw_payload #> '{data,message,message,imageMessage}',
          message.raw_payload #> '{data,message,imageMessage}',
          message.raw_payload #> '{message,imageMessage}'
        ) IS NOT NULL THEN 'image'
        WHEN COALESCE(
          message.raw_payload #> '{data,message,message,documentMessage}',
          message.raw_payload #> '{data,message,documentMessage}',
          message.raw_payload #> '{message,documentMessage}'
        ) IS NOT NULL THEN 'file'
        ELSE message.message_type
      END AS message_type,
      message.raw_payload,
      instance.instance_key
    FROM crm_messages message
    JOIN crm_conversations conversation ON conversation.id = message.conversation_id
    JOIN crm_instances instance ON instance.id = conversation.instance_id
    WHERE message.id = $1
    LIMIT 1
  `, [messageId]);

  return result.rows[0] || null;
}

export async function updateConversationContactPhone({ conversationId, phone }) {
  const result = await transaction(async (client) => {
    const conversationResult = await client.query(`
      SELECT
        conversation.id AS conversation_id,
        contact.id AS contact_id,
        contact.provider
      FROM crm_conversations conversation
      JOIN crm_contacts contact ON contact.id = conversation.contact_id
      WHERE conversation.id = $1
      FOR UPDATE OF contact
    `, [conversationId]);

    const conversation = conversationResult.rows[0];
    if (!conversation) return null;

    const duplicateResult = await client.query(`
      SELECT id
      FROM crm_contacts
      WHERE provider = $1
        AND phone = $2
        AND id <> $3
      LIMIT 1
    `, [conversation.provider, phone, conversation.contact_id]);

    if (duplicateResult.rows[0]) {
      const error = new Error('Bu telefon numarasi baska CRM kisisiyle eslesmis.');
      error.code = 'WHATSAPP_CRM_CONTACT_PHONE_CONFLICT';
      error.statusCode = 409;
      throw error;
    }

    const updateResult = await client.query(`
      UPDATE crm_contacts
      SET phone = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, display_name, phone
    `, [phone, conversation.contact_id]);

    return updateResult.rows[0];
  });

  return result ? {
    id: result.id,
    contactName: result.phone,
    phone: result.phone,
  } : null;
}

function crmActionError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function getActorPayload(actor = {}) {
  return {
    id: actor.id || null,
    username: actor.username || '',
    displayName: actor.displayName || actor.username || 'Kullanici',
  };
}

async function assertConversationExists(client, conversationId) {
  const result = await client.query(`
    SELECT
      conversation.id,
      conversation.contact_id,
      contact.tags
    FROM crm_conversations conversation
    LEFT JOIN crm_contacts contact ON contact.id = conversation.contact_id
    WHERE conversation.id = $1
    LIMIT 1
  `, [conversationId]);

  const row = result.rows[0];
  if (!row) {
    throw crmActionError('WHATSAPP_CRM_CONVERSATION_NOT_FOUND', 'Konusma bulunamadi.', 404);
  }

  return row;
}

async function insertConversationEvent(client, { conversationId, eventType, payload }) {
  const eventId = `${eventType}:${conversationId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const result = await client.query(`
    INSERT INTO crm_events (provider, event_id, event_type, instance_key, payload, processed_at)
    SELECT
      instance.provider,
      $2,
      $3,
      instance.instance_key,
      $4::jsonb,
      NOW()
    FROM crm_conversations conversation
    JOIN crm_instances instance ON instance.id = conversation.instance_id
    WHERE conversation.id = $1
    RETURNING id, event_type, payload, created_at
  `, [conversationId, eventId, eventType, JSON.stringify(payload)]);

  return result.rows[0];
}

export async function assignConversation({ conversationId, actor, assignee = null }) {
  if (!isPostgresConfigured()) {
    throw crmActionError('WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED', 'PostgreSQL baglantisi yok; atama kaydedilemedi.', 503);
  }

  const actorPayload = getActorPayload(actor);
  const assigneePayload = getActorPayload(assignee || actor);

  return transaction(async (client) => {
    await assertConversationExists(client, conversationId);

    const updated = await client.query(`
      UPDATE crm_conversations
      SET assigned_user_id = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, assigned_user_id
    `, [conversationId, assigneePayload.id]);

    await insertConversationEvent(client, {
      conversationId,
      eventType: 'crm.conversation.assigned',
      payload: {
        conversationId,
        assignedUser: assigneePayload,
        actor: actorPayload,
      },
    });

    return {
      conversationId: updated.rows[0].id,
      assignedUserId: updated.rows[0].assigned_user_id,
      assignedUser: assigneePayload,
      source: 'postgres',
    };
  });
}

export async function markConversationRead({ conversationId, actor }) {
  if (!isPostgresConfigured()) {
    throw crmActionError('WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED', 'PostgreSQL baglantisi yok; okundu bilgisi kaydedilemedi.', 503);
  }

  return transaction(async (client) => {
    await assertConversationExists(client, conversationId);
    const updated = await client.query(`
      UPDATE crm_conversations
      SET unread_count = 0, updated_at = NOW()
      WHERE id = $1
      RETURNING id, unread_count
    `, [conversationId]);
    await insertConversationEvent(client, {
      conversationId,
      eventType: 'crm.conversation.read',
      payload: { conversationId, actor: getActorPayload(actor) },
    });
    return { conversationId: updated.rows[0].id, unread: updated.rows[0].unread_count, source: 'postgres' };
  });
}

export async function updateConversationStatus({ conversationId, status, actor }) {
  if (!isPostgresConfigured()) {
    throw crmActionError('WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED', 'PostgreSQL baglantisi yok; konusma durumu kaydedilemedi.', 503);
  }

  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (!['open', 'pending', 'resolved'].includes(normalizedStatus)) {
    throw crmActionError('WHATSAPP_CRM_STATUS_INVALID', 'Konusma durumu open, pending veya resolved olmalidir.', 400);
  }

  return transaction(async (client) => {
    await assertConversationExists(client, conversationId);
    const updated = await client.query(`
      UPDATE crm_conversations
      SET status = $2, unread_count = CASE WHEN $2 = 'resolved' THEN 0 ELSE unread_count END, updated_at = NOW()
      WHERE id = $1
      RETURNING id, status, unread_count
    `, [conversationId, normalizedStatus]);
    await insertConversationEvent(client, {
      conversationId,
      eventType: 'crm.conversation.status_changed',
      payload: { conversationId, status: normalizedStatus, actor: getActorPayload(actor) },
    });
    return {
      conversationId: updated.rows[0].id,
      status: updated.rows[0].status,
      unread: updated.rows[0].unread_count,
      source: 'postgres',
    };
  });
}

export async function updateConversationStage({ conversationId, stage, actor }) {
  if (!isPostgresConfigured()) {
    throw crmActionError('WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED', 'PostgreSQL baglantisi yok; asama kaydedilemedi.', 503);
  }

  const normalizedStage = String(stage || '').trim();
  if (!normalizedStage) {
    throw crmActionError('WHATSAPP_CRM_STAGE_REQUIRED', 'Asama zorunludur.', 400);
  }

  return transaction(async (client) => {
    await assertConversationExists(client, conversationId);
    await insertConversationEvent(client, {
      conversationId,
      eventType: 'crm.conversation.stage_changed',
      payload: {
        conversationId,
        stage: normalizedStage,
        actor: getActorPayload(actor),
      },
    });

    await client.query('UPDATE crm_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

    return {
      conversationId,
      stage: normalizedStage,
      source: 'postgres',
    };
  });
}

export async function addConversationNote({ conversationId, note, actor }) {
  if (!isPostgresConfigured()) {
    throw crmActionError('WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED', 'PostgreSQL baglantisi yok; not kaydedilemedi.', 503);
  }

  const normalizedNote = String(note || '').trim();
  if (!normalizedNote) {
    throw crmActionError('WHATSAPP_CRM_NOTE_REQUIRED', 'Not zorunludur.', 400);
  }

  return transaction(async (client) => {
    await assertConversationExists(client, conversationId);
    const event = await insertConversationEvent(client, {
      conversationId,
      eventType: 'crm.conversation.note_added',
      payload: {
        conversationId,
        note: normalizedNote,
        author: getActorPayload(actor),
      },
    });

    await client.query('UPDATE crm_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

    return {
      conversationId,
      note: normalizedNote,
      author: getActorPayload(actor),
      createdAt: event.created_at,
      source: 'postgres',
    };
  });
}

export async function addConversationTask({ conversationId, title, dueAt, actor }) {
  if (!isPostgresConfigured()) {
    throw crmActionError('WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED', 'PostgreSQL baglantisi yok; gorev kaydedilemedi.', 503);
  }

  const normalizedTitle = String(title || '').trim();
  const normalizedDueAt = String(dueAt || '').trim();
  if (!normalizedTitle) {
    throw crmActionError('WHATSAPP_CRM_TASK_TITLE_REQUIRED', 'Gorev basligi zorunludur.', 400);
  }
  if (!normalizedDueAt || Number.isNaN(Date.parse(normalizedDueAt))) {
    throw crmActionError('WHATSAPP_CRM_TASK_DUE_AT_INVALID', 'Gorev tarihi gecersizdir.', 400);
  }

  return transaction(async (client) => {
    await assertConversationExists(client, conversationId);
    const event = await insertConversationEvent(client, {
      conversationId,
      eventType: 'crm.conversation.task_created',
      payload: {
        conversationId,
        title: normalizedTitle,
        dueAt: new Date(normalizedDueAt).toISOString(),
        status: 'open',
        actor: getActorPayload(actor),
      },
    });

    await client.query('UPDATE crm_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
    return {
      id: event.id,
      conversationId,
      title: normalizedTitle,
      dueAt: new Date(normalizedDueAt).toISOString(),
      status: 'open',
      actor: getActorPayload(actor),
      source: 'postgres',
    };
  });
}

export async function addConversationProductInterest({ conversationId, product, actor }) {
  if (!isPostgresConfigured()) {
    throw crmActionError('WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED', 'PostgreSQL baglantisi yok; urun ilgisi kaydedilemedi.', 503);
  }
  const productId = Number(product?.id);
  const stockCode = String(product?.stockCode || '').trim();
  const productName = String(product?.productName || '').trim();
  if (!Number.isInteger(productId) || productId < 1 || !stockCode || !productName) {
    throw crmActionError('WHATSAPP_CRM_PRODUCT_INVALID', 'ERP urun bilgisi gecersizdir.', 400);
  }

  return transaction(async (client) => {
    await assertConversationExists(client, conversationId);
    const snapshot = {
      id: productId,
      stockCode,
      productName,
      barcode: String(product?.barcodeMasked || '').trim(),
      brand: String(product?.brand || '').trim(),
      currency: String(product?.currency || 'TRY').trim().toUpperCase(),
      salePrice: Number(product?.salePrice || 0),
      stockQuantity: Number(product?.stockQuantity || 0),
    };
    const event = await insertConversationEvent(client, {
      conversationId,
      eventType: 'crm.conversation.product_interest_added',
      payload: { conversationId, product: snapshot, actor: getActorPayload(actor) },
    });
    await client.query('UPDATE crm_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
    return { ...snapshot, eventId: event.id, source: 'erp-product-snapshot' };
  });
}

export async function createConversationQuote({ conversationId, contact, lines, actor }) {
  if (!isPostgresConfigured()) {
    throw crmActionError('WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED', 'PostgreSQL baglantisi yok; teklif kaydedilemedi.', 503);
  }
  const safeLines = Array.isArray(lines) ? lines.map((line) => ({
    productId: Number(line?.id),
    stockCode: String(line?.stockCode || '').trim(),
    productName: String(line?.productName || '').trim(),
    quantity: Math.max(1, Number(line?.quantity || 1)),
    unitPrice: Number(line?.salePrice || 0),
    currency: String(line?.currency || '').trim().toUpperCase(),
  })) : [];
  const contactSnapshot = {
    name: String(contact?.name || contact?.contactName || '').trim(),
    phone: String(contact?.phone || '').trim(),
    country: String(contact?.country || '').trim(),
  };
  if (!contactSnapshot.name || safeLines.length === 0) {
    throw crmActionError('WHATSAPP_CRM_QUOTE_INVALID', 'Teklif icin CRM kisisi ve en az bir ERP urunu gerekir.', 400);
  }
  if (safeLines.some((line) => !line.productId || !line.stockCode || !line.productName || !line.currency || line.unitPrice < 0)) {
    throw crmActionError('WHATSAPP_CRM_QUOTE_LINE_INVALID', 'Teklif satiri gecersizdir.', 400);
  }
  const currencies = new Set(safeLines.map((line) => line.currency));
  if (currencies.size !== 1) {
    throw crmActionError('WHATSAPP_CRM_QUOTE_CURRENCY_MIXED', 'Teklif satirlari ayni para biriminde olmalidir.', 400);
  }

  return transaction(async (client) => {
    await assertConversationExists(client, conversationId);
    const quote = {
      quoteNo: `CRM-TKL-${Date.now()}`,
      contact: contactSnapshot,
      currency: safeLines[0].currency,
      total: safeLines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0),
      status: 'draft',
      lines: safeLines,
      createdBy: getActorPayload(actor),
    };
    const event = await insertConversationEvent(client, {
      conversationId,
      eventType: 'crm.conversation.quote_created',
      payload: { conversationId, quote },
    });
    await client.query('UPDATE crm_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
    return { id: event.id, ...quote, createdAt: event.created_at, source: 'crm-draft' };
  });
}

export async function addConversationTag({ conversationId, tag, actor }) {
  if (!isPostgresConfigured()) {
    throw crmActionError('WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED', 'PostgreSQL baglantisi yok; etiket kaydedilemedi.', 503);
  }

  const normalizedTag = String(tag || '').trim();
  if (!normalizedTag) {
    throw crmActionError('WHATSAPP_CRM_TAG_REQUIRED', 'Etiket zorunludur.', 400);
  }

  return transaction(async (client) => {
    const conversation = await assertConversationExists(client, conversationId);
    if (!conversation.contact_id) {
      throw crmActionError('WHATSAPP_CRM_CONTACT_NOT_FOUND', 'Konusmaya bagli kisi bulunamadi.', 404);
    }

    const result = await client.query(`
      UPDATE crm_contacts
      SET
        tags = CASE
          WHEN EXISTS (
            SELECT 1
            FROM unnest(tags) AS existing_tag
            WHERE lower(existing_tag) = lower($2)
          )
          THEN tags
          ELSE array_append(tags, $2)
        END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING tags
    `, [conversation.contact_id, normalizedTag]);

    await insertConversationEvent(client, {
      conversationId,
      eventType: 'crm.conversation.tag_added',
      payload: {
        conversationId,
        tag: normalizedTag,
        actor: getActorPayload(actor),
      },
    });

    return {
      conversationId,
      tags: result.rows[0]?.tags || [],
      source: 'postgres',
    };
  });
}

export async function listInboxOverview({ limit = 100, offset = 0 } = {}) {
  if (!isPostgresConfigured()) {
    return {
      conversations: [],
      summary: {
        open: 0,
        unread: 0,
        pendingHumanReply: 0,
        source: 'postgres-disabled',
      },
      boundaries: [
        'PostgreSQL is not configured; inbox returns an empty safe read model.',
        'WhatsApp send is handled only by the dedicated send endpoint.',
        'CRM still does not write directly to ERP stock, finance or order tables.',
      ],
    };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const [summaryResult, conversationResult] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE crm_conversations.status = 'open')::int AS open,
        COALESCE(SUM(crm_conversations.unread_count), 0)::int AS unread,
        COUNT(*) FILTER (
          WHERE crm_conversations.status = 'open'
            AND (
              SELECT message.direction
              FROM crm_messages message
              WHERE message.conversation_id = crm_conversations.id
              ORDER BY message.received_at DESC
              LIMIT 1
            ) = 'inbound'
        )::int AS pending_human_reply
      FROM crm_conversations
      JOIN crm_instances instance ON instance.id = crm_conversations.instance_id
      WHERE COALESCE((
        SELECT COALESCE(
          message.raw_payload #>> '{data,key,remoteJid}',
          message.raw_payload #>> '{data,message,key,remoteJid}',
          message.raw_payload #>> '{data,remoteJid}',
          message.raw_payload #>> '{key,remoteJid}',
          message.raw_payload #>> '{remoteJid}'
        )
        FROM crm_messages message
        WHERE message.conversation_id = crm_conversations.id
        ORDER BY message.received_at DESC
        LIMIT 1
      ), '') NOT ILIKE '%@lid'
        AND COALESCE((
          SELECT COALESCE(
            message.raw_payload #>> '{data,key,remoteJid}',
            message.raw_payload #>> '{data,message,key,remoteJid}',
            message.raw_payload #>> '{data,remoteJid}',
            message.raw_payload #>> '{key,remoteJid}',
            message.raw_payload #>> '{remoteJid}'
          )
          FROM crm_messages message
          WHERE message.conversation_id = crm_conversations.id
          ORDER BY message.received_at DESC
          LIMIT 1
        ), '') NOT ILIKE '%@g.us'
        AND instance.instance_key = $1
    `, [env.evolution.instance]),
    query(`
      WITH conversation_rows AS (
        SELECT
          conversation.id,
          conversation.status,
          conversation.unread_count,
          conversation.last_message_at,
          conversation.assigned_user_id,
          contact.display_name,
          contact.phone,
          contact.tags,
          instance.provider,
          instance.instance_key,
          (
            SELECT COALESCE(
              message.raw_payload #>> '{data,key,remoteJid}',
              message.raw_payload #>> '{data,message,key,remoteJid}',
              message.raw_payload #>> '{data,remoteJid}',
              message.raw_payload #>> '{key,remoteJid}',
              message.raw_payload #>> '{remoteJid}'
            )
            FROM crm_messages message
            WHERE message.conversation_id = conversation.id
            ORDER BY message.received_at DESC
            LIMIT 1
          ) AS remote_jid,
          (
            SELECT COALESCE(
              message.raw_payload #>> '{data,pushName}',
              message.raw_payload #>> '{pushName}',
              message.raw_payload #>> '{data,message,pushName}',
              message.raw_payload #>> '{data,message,pushName}'
            )
            FROM crm_messages message
            WHERE message.conversation_id = conversation.id
            ORDER BY message.received_at DESC
            LIMIT 1
          ) AS latest_push_name,
          (
            SELECT COALESCE(
              message.raw_payload #>> '{data,profilePicUrl}',
              message.raw_payload #>> '{profilePicUrl}',
              message.raw_payload #>> '{data,message,profilePicUrl}',
              message.raw_payload #>> '{data,profilePictureUrl}',
              message.raw_payload #>> '{profilePictureUrl}'
            )
            FROM crm_messages message
            WHERE message.conversation_id = conversation.id
            ORDER BY message.received_at DESC
            LIMIT 1
          ) AS latest_profile_picture_url
        FROM crm_conversations conversation
        LEFT JOIN crm_contacts contact ON contact.id = conversation.contact_id
        LEFT JOIN crm_instances instance ON instance.id = conversation.instance_id
      )
      SELECT
        conversation_rows.id,
        conversation_rows.status,
        conversation_rows.unread_count,
        conversation_rows.last_message_at,
        conversation_rows.assigned_user_id,
        conversation_rows.display_name,
        conversation_rows.phone,
        conversation_rows.tags,
        conversation_rows.provider,
        conversation_rows.instance_key,
        conversation_rows.remote_jid,
        conversation_rows.latest_push_name,
        conversation_rows.latest_profile_picture_url,
        COALESCE((
          SELECT crm_events.payload #>> '{assignedUser,displayName}'
          FROM crm_events
          WHERE crm_events.event_type = 'crm.conversation.assigned'
            AND crm_events.payload #>> '{conversationId}' = conversation_rows.id::text
          ORDER BY crm_events.created_at DESC
          LIMIT 1
        ), '') AS assigned_user_name,
        COALESCE((
          SELECT crm_events.payload #>> '{stage}'
          FROM crm_events
          WHERE crm_events.event_type = 'crm.conversation.stage_changed'
            AND crm_events.payload #>> '{conversationId}' = conversation_rows.id::text
          ORDER BY crm_events.created_at DESC
          LIMIT 1
        ), 'Yeni') AS stage,
        COALESCE((
          SELECT STRING_AGG(
            CONCAT(
              TO_CHAR(crm_events.created_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'),
              ' - ',
              COALESCE(crm_events.payload #>> '{author,displayName}', crm_events.payload #>> '{author,username}', 'Sistem'),
              ': ',
              crm_events.payload #>> '{note}'
            ),
            E'\n'
            ORDER BY crm_events.created_at DESC
          )
          FROM crm_events
          WHERE crm_events.event_type = 'crm.conversation.note_added'
            AND crm_events.payload #>> '{conversationId}' = conversation_rows.id::text
        ), '') AS notes,
        COALESCE((
          SELECT json_agg(task_row ORDER BY task_row."dueAt")
          FROM (
            SELECT
              crm_events.id,
              crm_events.payload #>> '{title}' AS title,
              crm_events.payload #>> '{dueAt}' AS "dueAt",
              COALESCE(crm_events.payload #>> '{status}', 'open') AS status,
              COALESCE(crm_events.payload #>> '{actor,displayName}', crm_events.payload #>> '{actor,username}', 'Sistem') AS owner
            FROM crm_events
            WHERE crm_events.event_type = 'crm.conversation.task_created'
              AND crm_events.payload #>> '{conversationId}' = conversation_rows.id::text
            ORDER BY crm_events.created_at DESC
            LIMIT 20
          ) task_row
        ), '[]'::json) AS tasks,
        COALESCE((
          SELECT json_agg(product_row ORDER BY product_row."createdAt" DESC)
          FROM (
            SELECT
              crm_events.id AS "eventId",
              crm_events.payload #> '{product}' AS product,
              crm_events.created_at AS "createdAt"
            FROM crm_events
            WHERE crm_events.event_type = 'crm.conversation.product_interest_added'
              AND crm_events.payload #>> '{conversationId}' = conversation_rows.id::text
            ORDER BY crm_events.created_at DESC
            LIMIT 20
          ) product_row
        ), '[]'::json) AS product_interests,
        COALESCE((
          SELECT json_agg(quote_row ORDER BY quote_row."createdAt" DESC)
          FROM (
            SELECT
              crm_events.id,
              crm_events.payload #> '{quote}' AS quote,
              crm_events.created_at AS "createdAt"
            FROM crm_events
            WHERE crm_events.event_type = 'crm.conversation.quote_created'
              AND crm_events.payload #>> '{conversationId}' = conversation_rows.id::text
            ORDER BY crm_events.created_at DESC
            LIMIT 20
          ) quote_row
        ), '[]'::json) AS quotes,
        COALESCE((
          SELECT json_agg(message_row ORDER BY message_row.received_at)
          FROM (
            SELECT
              message.id,
              CASE WHEN message.direction = 'outbound' THEN 'out' ELSE 'in' END AS direction,
              CASE
                WHEN COALESCE(
                  message.raw_payload #> '{data,message,message,stickerMessage}',
                  message.raw_payload #> '{data,message,stickerMessage}',
                  message.raw_payload #> '{message,stickerMessage}'
                ) IS NOT NULL THEN 'sticker'
                WHEN COALESCE(
                  message.raw_payload #> '{data,message,message,imageMessage}',
                  message.raw_payload #> '{data,message,imageMessage}',
                  message.raw_payload #> '{message,imageMessage}'
                ) IS NOT NULL THEN 'image'
                WHEN COALESCE(
                  message.raw_payload #> '{data,message,message,videoMessage}',
                  message.raw_payload #> '{data,message,videoMessage}',
                  message.raw_payload #> '{message,videoMessage}'
                ) IS NOT NULL THEN 'video'
                WHEN COALESCE(
                  message.raw_payload #> '{data,message,message,audioMessage}',
                  message.raw_payload #> '{data,message,audioMessage}',
                  message.raw_payload #> '{message,audioMessage}'
                ) IS NOT NULL THEN 'audio'
                WHEN COALESCE(
                  message.raw_payload #> '{data,message,message,documentMessage}',
                  message.raw_payload #> '{data,message,documentMessage}',
                  message.raw_payload #> '{message,documentMessage}'
                ) IS NOT NULL THEN 'file'
                ELSE message.message_type
              END AS type,
              message.body AS text,
              COALESCE(
                message.raw_payload #>> '{crmMedia,mediaUrl}',
                message.raw_payload #>> '{data,message,message,documentMessage,url}',
                message.raw_payload #>> '{data,message,documentMessage,url}',
                message.raw_payload #>> '{message,documentMessage,url}',
                message.raw_payload #>> '{data,message,message,videoMessage,url}',
                message.raw_payload #>> '{data,message,videoMessage,url}',
                message.raw_payload #>> '{message,videoMessage,url}',
                message.raw_payload #>> '{data,message,message,audioMessage,url}',
                message.raw_payload #>> '{data,message,audioMessage,url}',
                message.raw_payload #>> '{message,audioMessage,url}',
                message.raw_payload #>> '{data,message,message,stickerMessage,url}',
                message.raw_payload #>> '{data,message,stickerMessage,url}',
                message.raw_payload #>> '{message,stickerMessage,url}',
                message.raw_payload #>> '{data,message,message,imageMessage,url}',
                message.raw_payload #>> '{data,message,imageMessage,url}',
                message.raw_payload #>> '{message,imageMessage,url}',
                ''
              ) AS "mediaUrl",
              COALESCE(
                message.raw_payload #>> '{crmMedia,thumbnailUrl}',
                ''
              ) AS "thumbnailUrl",
              COALESCE(
                message.raw_payload #>> '{crmMedia,thumbnailUrl}',
                message.raw_payload #>> '{data,message,message,imageMessage,url}',
                message.raw_payload #>> '{data,message,imageMessage,url}',
                message.raw_payload #>> '{message,imageMessage,url}',
                message.raw_payload #>> '{crmMedia,mediaUrl}',
                ''
              ) AS "imageUrl",
              COALESCE(
                message.raw_payload #>> '{crmMedia,mimeType}',
                message.raw_payload #>> '{data,message,message,imageMessage,mimetype}',
                message.raw_payload #>> '{data,message,imageMessage,mimetype}',
                message.raw_payload #>> '{message,imageMessage,mimetype}',
                message.raw_payload #>> '{data,message,message,documentMessage,mimetype}',
                message.raw_payload #>> '{data,message,documentMessage,mimetype}',
                message.raw_payload #>> '{message,documentMessage,mimetype}',
                message.raw_payload #>> '{data,message,message,videoMessage,mimetype}',
                message.raw_payload #>> '{data,message,videoMessage,mimetype}',
                message.raw_payload #>> '{message,videoMessage,mimetype}',
                message.raw_payload #>> '{data,message,message,audioMessage,mimetype}',
                message.raw_payload #>> '{data,message,audioMessage,mimetype}',
                message.raw_payload #>> '{message,audioMessage,mimetype}',
                message.raw_payload #>> '{data,message,message,stickerMessage,mimetype}',
                message.raw_payload #>> '{data,message,stickerMessage,mimetype}',
                message.raw_payload #>> '{message,stickerMessage,mimetype}',
                ''
              ) AS "mimeType",
              COALESCE(
                message.raw_payload #>> '{crmMedia,fileName}',
                message.raw_payload #>> '{data,message,message,documentMessage,fileName}',
                message.raw_payload #>> '{data,message,documentMessage,fileName}',
                message.raw_payload #>> '{message,documentMessage,fileName}',
                ''
              ) AS "fileName",
              COALESCE(
                message.raw_payload #>> '{crmMedia,fileSize}',
                message.raw_payload #>> '{data,message,message,imageMessage,fileLength}',
                message.raw_payload #>> '{data,message,imageMessage,fileLength}',
                message.raw_payload #>> '{message,imageMessage,fileLength}',
                message.raw_payload #>> '{data,message,message,documentMessage,fileLength}',
                message.raw_payload #>> '{data,message,documentMessage,fileLength}',
                message.raw_payload #>> '{message,documentMessage,fileLength}',
                message.raw_payload #>> '{data,message,message,videoMessage,fileLength}',
                message.raw_payload #>> '{data,message,videoMessage,fileLength}',
                message.raw_payload #>> '{message,videoMessage,fileLength}',
                message.raw_payload #>> '{data,message,message,stickerMessage,fileLength}',
                message.raw_payload #>> '{data,message,stickerMessage,fileLength}',
                message.raw_payload #>> '{message,stickerMessage,fileLength}',
                ''
              ) AS "fileSize",
              TO_CHAR(message.received_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') AS time,
              message.status,
              message.received_at
            FROM crm_messages message
            WHERE message.conversation_id = conversation_rows.id
            ORDER BY message.received_at DESC
            LIMIT 20
          ) message_row
        ), '[]'::json) AS messages
      FROM conversation_rows
      WHERE conversation_rows.instance_key = $2
        AND (
          conversation_rows.remote_jid IS NULL
          OR (
          conversation_rows.remote_jid NOT ILIKE '%@lid'
          AND conversation_rows.remote_jid NOT ILIKE '%@g.us'
          )
        )
      ORDER BY conversation_rows.last_message_at DESC NULLS LAST
      LIMIT $1 OFFSET $3
    `, [safeLimit + 1, env.evolution.instance, safeOffset]),
  ]);

  const summary = summaryResult.rows[0] || { total: 0, open: 0, unread: 0, pending_human_reply: 0 };
  const hasNext = conversationResult.rows.length > safeLimit;
  const pageRows = conversationResult.rows.slice(0, safeLimit);

  return {
    conversations: pageRows.map((row) => ({
      id: row.id,
      status: row.status,
      assignedUserId: row.assigned_user_id,
      assignedUserName: row.assigned_user_name || '',
      stage: row.stage || 'Yeni',
      contactName: row.latest_push_name || row.display_name || row.phone,
      displayName: row.latest_push_name || row.display_name || null,
      profilePictureUrl: row.latest_profile_picture_url || '',
      phone: row.phone,
      phoneIdentity: resolvePhoneIdentity(row.phone),
      tags: row.tags || [],
      notes: row.notes || '',
      tasks: row.tasks || [],
      productInterests: (row.product_interests || []).map((item) => ({
        ...(item.product || {}),
        eventId: item.eventId,
        createdAt: item.createdAt,
      })),
      quotes: (row.quotes || []).map((item) => ({
        ...(item.quote || {}),
        id: item.id,
        createdAt: item.createdAt,
      })),
      provider: row.provider,
      instanceKey: row.instance_key,
      remoteJid: row.remote_jid,
      unread: row.unread_count,
      lastMessageAt: row.last_message_at,
      messages: row.messages || [],
    })),
    summary: {
      total: summary.total || 0,
      open: summary.open || 0,
      unread: summary.unread || 0,
      pendingHumanReply: summary.pending_human_reply || 0,
      source: 'postgres',
    },
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      hasNext,
      nextOffset: hasNext ? safeOffset + safeLimit : null,
      total: summary.total || 0,
    },
    boundaries: [
      'Inbox is read-only.',
      'WhatsApp send is handled only by the dedicated send endpoint.',
      'ERP stock, finance and order mutations remain owned by the ERP API.',
    ],
  };
}
