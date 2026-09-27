import { ApiError } from "@/shared/errors/apiError";

export type AvailabilityStatus =
	| "available"
	| "limited"
	| "waitlist"
	| "unavailable"
	| "full";

export interface NormalizeAvailabilityInput {
	status: AvailabilityStatus;
	beds_available?: number | null;
	note?: string | null;
}

export interface NormalizedAvailabilityUpdate {
	status: AvailabilityStatus;
	beds_available: number | null;
	note: string | null;
}

export interface TourAvailabilityWindowInput {
	day_of_week: number;
	start_time: string;
	end_time: string;
}

export interface TourAvailabilityExceptionInput {
	date: string;
	status: "available" | "limited" | "unavailable";
	windows?: TourAvailabilityWindowInput[];
	note?: string | null;
}

export interface NormalizeTourAvailabilityInput {
	status: "available" | "limited" | "unavailable";
	timezone?: "Asia/Singapore";
	weekly_windows?: TourAvailabilityWindowInput[];
	exceptions?: TourAvailabilityExceptionInput[];
	notes?: string | null;
}

export interface NormalizedTourAvailabilityWindow {
	day_of_week: number;
	start_time: string;
	end_time: string;
}

export interface NormalizedTourAvailabilityException {
	date: string;
	status: "available" | "limited" | "unavailable";
	windows: NormalizedTourAvailabilityWindow[];
	note: string | null;
}

export interface NormalizedTourAvailabilityUpdate {
	status: "available" | "limited" | "unavailable";
	timezone: "Asia/Singapore";
	weekly_windows: NormalizedTourAvailabilityWindow[];
	exceptions: NormalizedTourAvailabilityException[];
	notes: string | null;
}

const availabilityStatuses = new Set<AvailabilityStatus>([
	"available",
	"limited",
	"waitlist",
	"unavailable",
	"full",
]);

const tourAvailabilityStatuses = new Set<
	NormalizedTourAvailabilityUpdate["status"]
>(["available", "limited", "unavailable"]);

export function normalizeAvailabilityUpdate(
	input: NormalizeAvailabilityInput,
): NormalizedAvailabilityUpdate {
	if (!availabilityStatuses.has(input.status)) {
		throw validationFailed("Unsupported availability status.", {
			field: "status",
			value: input.status,
		});
	}

	const bedsAvailable =
		input.beds_available === undefined ? null : input.beds_available;
	if (bedsAvailable !== null && (!Number.isInteger(bedsAvailable) || bedsAvailable < 0)) {
		throw validationFailed("Beds available must be a non-negative integer.", {
			field: "beds_available",
		});
	}

	return {
		status: input.status,
		beds_available: shouldClearBedsAvailable(input.status)
			? null
			: bedsAvailable,
		note: normalizeNullableText(input.note),
	};
}

export function normalizeTourAvailabilityUpdate(
	input: NormalizeTourAvailabilityInput,
): NormalizedTourAvailabilityUpdate {
	if (!tourAvailabilityStatuses.has(input.status)) {
		throw validationFailed("Unsupported tour availability status.", {
			field: "status",
			value: input.status,
		});
	}
	if (input.timezone !== undefined && input.timezone !== "Asia/Singapore") {
		throw validationFailed("Tour availability timezone must be Asia/Singapore.", {
			field: "timezone",
		});
	}

	const weeklyWindows =
		input.status === "unavailable"
			? []
			: normalizeWindows(input.weekly_windows ?? [], "weekly_windows");
	const exceptions =
		input.status === "unavailable"
			? []
			: normalizeExceptions(input.exceptions ?? []);

	return {
		status: input.status,
		timezone: "Asia/Singapore",
		weekly_windows: weeklyWindows,
		exceptions,
		notes: normalizeNullableText(input.notes),
	};
}

function shouldClearBedsAvailable(status: AvailabilityStatus) {
	return status === "full" || status === "unavailable";
}

function normalizeExceptions(
	exceptions: TourAvailabilityExceptionInput[],
): NormalizedTourAvailabilityException[] {
	return exceptions
		.map((exception, index) => {
			if (!isIsoDate(exception.date)) {
				throw validationFailed("Tour availability exception date is invalid.", {
					field: `exceptions.${index}.date`,
				});
			}
			if (!tourAvailabilityStatuses.has(exception.status)) {
				throw validationFailed(
					"Unsupported tour availability exception status.",
					{ field: `exceptions.${index}.status` },
				);
			}
			return {
				date: exception.date,
				status: exception.status,
				windows:
					exception.status === "unavailable"
						? []
						: normalizeWindows(
								exception.windows ?? [],
								`exceptions.${index}.windows`,
							),
				note: normalizeNullableText(exception.note),
			};
		})
		.toSorted((left, right) => left.date.localeCompare(right.date));
}

function normalizeWindows(
	windows: TourAvailabilityWindowInput[],
	fieldPrefix: string,
): NormalizedTourAvailabilityWindow[] {
	return windows
		.map((window, index) => {
			if (!Number.isInteger(window.day_of_week) || window.day_of_week < 0 || window.day_of_week > 6) {
				throw validationFailed("Tour availability day must be 0 through 6.", {
					field: `${fieldPrefix}.${index}.day_of_week`,
				});
			}
			if (!isClockTime(window.start_time) || !isClockTime(window.end_time)) {
				throw validationFailed("Tour availability times must use HH:MM.", {
					field: `${fieldPrefix}.${index}`,
				});
			}
			if (window.start_time >= window.end_time) {
				throw validationFailed("Tour availability start time must precede end time.", {
					field: `${fieldPrefix}.${index}`,
				});
			}
			return {
				day_of_week: window.day_of_week,
				start_time: window.start_time,
				end_time: window.end_time,
			};
		})
		.toSorted(
			(left, right) =>
				left.day_of_week - right.day_of_week ||
				left.start_time.localeCompare(right.start_time) ||
				left.end_time.localeCompare(right.end_time),
		);
}

function normalizeNullableText(value: string | null | undefined) {
	if (value === undefined || value === null) return null;
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function isClockTime(value: string) {
	return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isIsoDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function validationFailed(message: string, details?: Record<string, unknown>) {
	return new ApiError("validation_failed", message, 422, details);
}
