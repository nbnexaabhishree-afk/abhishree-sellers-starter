import {
  CONVERSATION_STEPS,
  ConversationData,
  ConversationInput,
  ConversationStep,
  ConversationStepId
} from "./conversation-flow";

export type ConversationStatus = "active" | "completed";

export interface ConversationSnapshot {
  currentStep: ConversationStepId | null;
  collectedData: Partial<ConversationData>;
  status: ConversationStatus;
}

export type ProcessInputResult =
  | {
      accepted: false;
      completed: false;
      error: string;
      nextStep: ConversationStep;
      state: ConversationSnapshot;
    }
  | {
      accepted: true;
      completed: boolean;
      nextStep: ConversationStep | null;
      state: ConversationSnapshot;
    };

const STEP_INDEX = new Map(
  CONVERSATION_STEPS.map((step, index) => [step.id, index])
);

function cloneData(data: Partial<ConversationData>): Partial<ConversationData> {
  return structuredClone(data);
}

export class ConversationEngine {
  private currentStepId: ConversationStepId | null;
  private data: Partial<ConversationData>;
  private status: ConversationStatus;

  constructor(snapshot?: ConversationSnapshot) {
    if (!snapshot) {
      this.currentStepId = CONVERSATION_STEPS[0].id;
      this.data = {};
      this.status = "active";
      return;
    }

    if (snapshot.currentStep !== null && !STEP_INDEX.has(snapshot.currentStep)) {
      throw new Error(`Unknown conversation step: ${snapshot.currentStep}`);
    }
    if (snapshot.status === "completed" && snapshot.currentStep !== null) {
      throw new Error("A completed conversation cannot have a current step");
    }

    this.currentStepId = snapshot.currentStep;
    this.data = cloneData(snapshot.collectedData);
    this.status = snapshot.status;
  }

  getCurrentStep(): ConversationStep | null {
    if (this.currentStepId === null) return null;
    return CONVERSATION_STEPS[STEP_INDEX.get(this.currentStepId)!];
  }

  getState(): ConversationSnapshot {
    return {
      currentStep: this.currentStepId,
      collectedData: cloneData(this.data),
      status: this.status
    };
  }

  isComplete(): boolean {
    return this.status === "completed";
  }

  processInput(input: ConversationInput): ProcessInputResult {
    const step = this.getCurrentStep();
    if (!step) {
      throw new Error("Cannot process input for a completed conversation");
    }

    const parsed = step.parse(input);
    if (!parsed.ok) {
      return {
        accepted: false,
        completed: false,
        error: parsed.error,
        nextStep: step,
        state: this.getState()
      };
    }

    this.data = { ...this.data, [step.field]: parsed.value };
    const stepIndex = STEP_INDEX.get(step.id)!;
    const nextStep = CONVERSATION_STEPS[stepIndex + 1] ?? null;
    this.currentStepId = nextStep?.id ?? null;
    this.status = nextStep ? "active" : "completed";

    return {
      accepted: true,
      completed: this.isComplete(),
      nextStep,
      state: this.getState()
    };
  }
}
