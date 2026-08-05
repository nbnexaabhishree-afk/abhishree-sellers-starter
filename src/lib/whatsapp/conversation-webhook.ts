import { ConversationSnapshot } from "./conversation-engine";
import {
  CONVERSATION_STEP_IDS,
  ConversationData,
  ConversationInput,
  ConversationStepId,
  PropertyMediaInput
} from "./conversation-flow";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSellerConversationStart(body: string | null): boolean {
  return body !== null && /\b(sell|seller|selling)\b/i.test(body);
}

export function toConversationInput(
  message: Record<string, unknown>,
  body: string | null
): ConversationInput | null {
  const type = typeof message.type === "string" ? message.type : "";
  if (["image", "video", "document"].includes(type)) {
    const payload = message[type];
    if (!isRecord(payload) || typeof payload.id !== "string" || !payload.id.trim()) return null;

    return {
      kind: "media",
      mediaId: payload.id,
      mediaType: type as PropertyMediaInput["mediaType"],
      ...(typeof payload.mime_type === "string" ? { mimeType: payload.mime_type } : {}),
      ...(typeof payload.filename === "string" ? { filename: payload.filename } : {}),
      ...(typeof payload.caption === "string" ? { caption: payload.caption } : {})
    };
  }
  return body;
}

export function snapshotFromConversationRow(row: Record<string, unknown>): ConversationSnapshot | null {
  const currentStep = row.current_step;
  const collectedData = row.collected_data;
  if (
    typeof currentStep !== "string"
    || !CONVERSATION_STEP_IDS.includes(currentStep as ConversationStepId)
    || !isRecord(collectedData)
  ) {
    return null;
  }
  return {
    currentStep: currentStep as ConversationStepId,
    collectedData: collectedData as Partial<ConversationData>,
    status: "active"
  };
}

export function toSellerLeadInsert(
  data: Partial<ConversationData>,
  ids: { contactId: string | null; whatsappContactId: string; conversationStateId: string }
) {
  return {
    contact_id: ids.contactId,
    whatsapp_contact_id: ids.whatsappContactId,
    conversation_state_id: ids.conversationStateId,
    flow_type: "seller",
    status: "completed",
    seller_name: data.seller_name,
    seller_email: data.seller_email,
    property_type: data.property_type,
    bhk: data.bhk,
    area_sqft: data.area_sqft,
    location: data.location,
    expected_price: data.expected_price,
    documents_available: data.documents_available,
    raw_collected_data: data
  };
}

export function toPropertyMediaInsert(
  data: Partial<ConversationData>,
  ids: {
    sellerLeadId: string;
    conversationStateId: string;
    whatsappMessageId: string;
  }
) {
  const media = data.property_media;
  if (!media) return null;

  return {
    enquiry_id: null,
    seller_lead_id: ids.sellerLeadId,
    conversation_state_id: ids.conversationStateId,
    whatsapp_message_id: ids.whatsappMessageId,
    media_id: media.mediaId,
    media_type: media.mediaType,
    storage_path: null,
    original_filename: media.filename ?? null,
    mime_type: media.mimeType ?? null,
    caption: media.caption ?? null
  };
}
