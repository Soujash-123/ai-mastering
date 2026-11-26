import emailjs from "@emailjs/browser";
import { ApiError, submitEarlyAccessRequest } from "./auth";
import { readUtm, utmTag } from "./utm";

export type AccessRequestInput = { name: string; email: string; phone: string; reason: string };

/** Shown when the email already has a PENDING request (backend returns 409). */
export const DUPLICATE_REQUEST_MESSAGE = "You've already requested access — we'll be in touch.";

/**
 * Saves an early-access request, used by /access-request and the in-app modal.
 *
 * - The reason is optional; a campaign tag " [src: source/medium/campaign]" is
 *   appended when the visitor arrived through a UTM-tagged link (lib/utm.ts).
 * - Resolves "duplicate" when the email already has a pending request.
 * - Once the backend has saved the request it resolves "ok", even if the
 *   EmailJS notification fails (that error only goes to the console).
 * - Throws for any other failure (validation, network).
 */
export async function sendAccessRequest(input: AccessRequestInput): Promise<"ok" | "duplicate"> {
  const payload = {
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    reason: `${input.reason.trim()}${utmTag(readUtm())}`.trim(),
  };

  try {
    await submitEarlyAccessRequest(payload);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return "duplicate";
    throw err;
  }

  const enabled = process.env.NEXT_PUBLIC_ENABLE_EARLY_ACCESS_REQUESTS !== "false";
  const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (enabled && serviceId && templateId && publicKey) {
    try {
      await emailjs.send(serviceId, templateId, { ...payload, time: new Date().toLocaleString() }, publicKey);
    } catch (err) {
      console.error("EmailJS notification failed (the request itself was saved):", err);
    }
  }
  return "ok";
}
