export type AvailabilityFreshness = "fresh" | "stale" | "unknown";

const freshWindowMs = 14 * 24 * 60 * 60 * 1000;

export function availabilityFreshness(updatedAt: Date | string | null | undefined, now = new Date()) {
  if (!updatedAt) {
    return "unknown" satisfies AvailabilityFreshness;
  }

  const updatedAtMs = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedAtMs)) {
    return "unknown" satisfies AvailabilityFreshness;
  }

  return now.getTime() - updatedAtMs <= freshWindowMs
    ? ("fresh" satisfies AvailabilityFreshness)
    : ("stale" satisfies AvailabilityFreshness);
}
