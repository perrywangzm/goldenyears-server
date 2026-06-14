import { ApiError } from "@/shared/errors/apiError";

const allowedTransitions = new Set([
  "pending_review:confirmed",
  "pending_review:declined",
  "confirmed:attended",
  "confirmed:no_show",
  "confirmed:cancelled",
]);

export function assertTourTransitionAllowed(from: string, to: string) {
  if (!allowedTransitions.has(`${from}:${to}`)) {
    throw new ApiError("conflict", `Cannot transition tour request from ${from} to ${to}.`, 409);
  }
}
