export const CONVERSATION_STEP_IDS = [
  "seller_name",
  "seller_email",
  "property_type",
  "bhk",
  "area_sqft",
  "location",
  "expected_price",
  "documents_available",
  "property_media"
] as const;

export type ConversationStepId = (typeof CONVERSATION_STEP_IDS)[number];

export interface PropertyMediaInput {
  kind: "media";
  mediaId: string;
  mediaType: "image" | "video" | "document";
  mimeType?: string;
  filename?: string;
  caption?: string;
}

export type ConversationInput = string | PropertyMediaInput;

export interface ConversationData {
  seller_name: string;
  seller_email: string;
  property_type: string;
  bhk: string;
  area_sqft: number;
  location: string;
  expected_price: number;
  documents_available: boolean;
  property_media: PropertyMediaInput;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ConversationStep<K extends ConversationStepId = ConversationStepId> {
  id: K;
  field: K;
  question: string;
  invalidMessage: string;
  inputType: "text" | "media";
  parse: (input: ConversationInput) => ParseResult<ConversationData[K]>;
}

function textInput(input: ConversationInput): string | null {
  return typeof input === "string" ? input.trim() : null;
}

function requiredText(error: string, minLength = 1) {
  return (input: ConversationInput): ParseResult<string> => {
    const value = textInput(input);
    return value && value.length >= minLength
      ? { ok: true, value }
      : { ok: false, error };
  };
}

function positiveNumber(error: string) {
  return (input: ConversationInput): ParseResult<number> => {
    const value = textInput(input)?.replace(/[₹,$,\s]/g, "");
    if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return { ok: false, error };
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0
      ? { ok: true, value: parsed }
      : { ok: false, error };
  };
}

function email(input: ConversationInput): ParseResult<string> {
  const value = textInput(input)?.toLowerCase();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? { ok: true, value }
    : { ok: false, error: "Please enter a valid email address." };
}

function documents(input: ConversationInput): ParseResult<boolean> {
  const value = textInput(input)?.toLowerCase();
  if (["yes", "y", "available"].includes(value ?? "")) return { ok: true, value: true };
  if (["no", "n", "not available"].includes(value ?? "")) return { ok: true, value: false };
  return { ok: false, error: "Please reply yes or no." };
}

function media(input: ConversationInput): ParseResult<PropertyMediaInput> {
  if (typeof input !== "string" && input.kind === "media" && input.mediaId.trim()) {
    return { ok: true, value: { ...input, mediaId: input.mediaId.trim() } };
  }
  return { ok: false, error: "Please attach a property image, video, or document." };
}

export const CONVERSATION_STEPS: readonly ConversationStep[] = [
  {
    id: "seller_name",
    field: "seller_name",
    question: "What is your name?",
    invalidMessage: "Please enter your full name.",
    inputType: "text",
    parse: requiredText("Please enter your full name.", 2)
  },
  {
    id: "seller_email",
    field: "seller_email",
    question: "What is your email address?",
    invalidMessage: "Please enter a valid email address.",
    inputType: "text",
    parse: email
  },
  {
    id: "property_type",
    field: "property_type",
    question: "What type of property are you selling?",
    invalidMessage: "Please enter a property type, such as apartment, villa, plot, or commercial.",
    inputType: "text",
    parse: requiredText("Please enter a property type, such as apartment, villa, plot, or commercial.", 2)
  },
  {
    id: "bhk",
    field: "bhk",
    question: "What is the BHK configuration?",
    invalidMessage: "Please enter a BHK configuration, such as 2 BHK or studio.",
    inputType: "text",
    parse: requiredText("Please enter a BHK configuration, such as 2 BHK or studio.")
  },
  {
    id: "area_sqft",
    field: "area_sqft",
    question: "What is the property area in square feet?",
    invalidMessage: "Please enter a positive area in square feet.",
    inputType: "text",
    parse: positiveNumber("Please enter a positive area in square feet.")
  },
  {
    id: "location",
    field: "location",
    question: "Where is the property located?",
    invalidMessage: "Please enter the property location.",
    inputType: "text",
    parse: requiredText("Please enter the property location.", 2)
  },
  {
    id: "expected_price",
    field: "expected_price",
    question: "What is your expected price in rupees?",
    invalidMessage: "Please enter a positive expected price.",
    inputType: "text",
    parse: positiveNumber("Please enter a positive expected price.")
  },
  {
    id: "documents_available",
    field: "documents_available",
    question: "Are the property documents available? Reply yes or no.",
    invalidMessage: "Please reply yes or no.",
    inputType: "text",
    parse: documents
  },
  {
    id: "property_media",
    field: "property_media",
    question: "Please attach a property image, video, or document.",
    invalidMessage: "Please attach a property image, video, or document.",
    inputType: "media",
    parse: media
  }
];

export const conversationFlow = { steps: CONVERSATION_STEPS } as const;

export default conversationFlow;
