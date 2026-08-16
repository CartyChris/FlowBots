import {
  type ActivityFinishInput,
  ActivityLedger,
  type ActivitySpan,
  type ActivityStartInput,
} from "@rakazo/core";

export interface ManagedActivityController {
  abort(): Promise<void>;
}

export type ActivitySubscriber = (spans: ActivitySpan[]) => void;

export interface ActivityCancelResult {
  cancelled: boolean;
  reason?: string;
}

export class ActivityBus {
  private readonly subscribers = new Set<ActivitySubscriber>();
  private readonly controllers = new Map<string, ManagedActivityController>();

  constructor(private readonly ledger: ActivityLedger = new ActivityLedger()) {}

  start(input: ActivityStartInput): ActivitySpan {
    const span = this.ledger.start(input);
    this.publish();
    return span;
  }

  finish(spanId: string, input: ActivityFinishInput): ActivitySpan {
    const span = this.ledger.finish(spanId, input);
    this.controllers.delete(spanId);
    this.publish();
    return span;
  }

  snapshot(): ActivitySpan[] {
    return this.ledger.snapshot();
  }

  subscribe(listener: ActivitySubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  attachManagedSession(spanId: string, controller: ManagedActivityController): void {
    const span = this.ledger.get(spanId);
    if (!span) throw new Error(`Unknown activity span ${spanId}`);
    if (span.coverage !== "managed") {
      throw new Error("Only managed activity can attach a Rakazo control session.");
    }
    if (span.state !== "running") {
      throw new Error(`Cannot attach a controller to ${span.state} activity.`);
    }
    this.controllers.set(spanId, controller);
  }

  async cancel(spanId: string): Promise<ActivityCancelResult> {
    const span = this.ledger.get(spanId);
    if (!span) return { cancelled: false, reason: "Activity was not found." };
    if (span.coverage !== "managed") {
      return {
        cancelled: false,
        reason: "Observed external activity is not managed by Rakazo and cannot be cancelled here.",
      };
    }
    if (span.state !== "running") {
      return { cancelled: false, reason: `Activity is already ${span.state}.` };
    }

    const controller = this.controllers.get(spanId);
    if (!controller) {
      return {
        cancelled: false,
        reason: "Rakazo has no active control session for this managed activity.",
      };
    }

    try {
      await controller.abort();
    } catch (error) {
      return {
        cancelled: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    this.controllers.delete(spanId);
    this.ledger.finish(spanId, { state: "cancelled" });
    this.publish();
    return { cancelled: true };
  }

  private publish(): void {
    if (this.subscribers.size === 0) return;
    for (const listener of this.subscribers) listener(this.ledger.snapshot());
  }
}
