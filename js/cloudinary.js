/**
 * Cloudinary image hosting.
 *
 * Uploads use the public unsigned preset configured on the Cloudinary account.
 * The API secret is deliberately absent: anything secret must never ship to
 * the browser, which also means deleting an asset needs the Cloudinary console.
 */
const CLOUD_NAME = "f9rwcdyz";
const UPLOAD_PRESET = "dealership";
const UPLOAD_ENDPOINT = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const CLOUDINARY_DELIVERY_ROOT = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/`;

export function isCloudinaryUrl(value) {
  return typeof value === "string" && value.startsWith(CLOUDINARY_DELIVERY_ROOT);
}

/** Adds auto format/quality + a width cap to Cloudinary delivery URLs. */
export function cloudinaryUrl(url, width = 0) {
  if (!isCloudinaryUrl(url)) return url;
  if (/\/image\/upload\/[^/]*_[^/]+\//.test(url)) return url;
  const transform = ["f_auto", "q_auto", "c_limit"];
  if (width > 0) transform.push(`w_${Math.round(width)}`);
  return url.replace(CLOUDINARY_DELIVERY_ROOT, `${CLOUDINARY_DELIVERY_ROOT}${transform.join(",")}/`);
}

/**
 * Uploads a single image with the unsigned preset.
 * @returns {Promise<string>} the Cloudinary `secure_url`
 */
export async function uploadImage(file, { folder = "", tags = [], timeoutMs = 60000 } = {}) {
  if (!file || !ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Choose a JPG, PNG or WebP image.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Images must be smaller than 8 MB.");
  }

  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", UPLOAD_PRESET);
  if (folder) body.append("folder", folder);
  if (tags.length) body.append("tags", tags.join(","));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(UPLOAD_ENDPOINT, { method: "POST", body, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The image upload timed out. Check your connection and try again.");
    }
    throw new Error("The image could not be uploaded. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.secure_url) {
    throw new Error(uploadErrorMessage(payload, response.status));
  }
  return payload.secure_url;
}

function uploadErrorMessage(payload, status) {
  const raw = String(payload?.error?.message || "");
  if (/preset/i.test(raw)) return "Image uploads are not configured correctly — the upload preset was rejected.";
  if (/size|too large/i.test(raw)) return "That image is too large. Use one under 8 MB.";
  if (/format|invalid image/i.test(raw)) return "Use a JPG, PNG or WebP image.";
  if (status === 429) return "Too many uploads right now. Please wait a moment and try again.";
  return raw || "That image could not be uploaded. Please try again.";
}
