import type { AiSettings, AiUsage } from "@/state/userSettings";

/** months of usage kept */
const MONTHS_KEPT = 12;

/** The month of a date, as kept: YYYY-MM, local time. */
export const monthOf = (date: Date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** The settings with the tokens of a request added; the oldest months forgotten. */
export function withUsage(
  settings: AiSettings,
  provider: string,
  input: number,
  output: number,
  month: string = monthOf(),
): AiSettings {
  const months = { ...settings.usage };
  const byProvider = { ...(months[month] ?? {}) };
  const old: AiUsage = byProvider[provider] ?? {
    input: 0,
    output: 0,
    requests: 0,
  };
  byProvider[provider] = {
    input: old.input + Math.max(0, input || 0),
    output: old.output + Math.max(0, output || 0),
    requests: old.requests + 1,
  };
  months[month] = byProvider;
  const keep = Object.keys(months).sort().slice(-MONTHS_KEPT);
  return {
    ...settings,
    usage: Object.fromEntries(keep.map((m) => [m, months[m]])),
  };
}

/** The tokens used in a month, all providers. */
export function usageOf(
  settings: AiSettings,
  month: string = monthOf(),
): AiUsage {
  return Object.values(settings.usage[month] ?? {}).reduce(
    (sum, u) => ({
      input: sum.input + u.input,
      output: sum.output + u.output,
      requests: sum.requests + u.requests,
    }),
    { input: 0, output: 0, requests: 0 },
  );
}
