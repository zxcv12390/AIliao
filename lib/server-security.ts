import { timingSafeEqual } from "node:crypto";
import { ServiceError } from "./provider";
import { MAX_BODY_BYTES } from "./contracts";

export function checkAccess(request: Request) {
  const token = process.env.APP_ACCESS_TOKEN;
  if (
    process.env.NODE_ENV === "production" &&
    !token &&
    process.env.ALLOW_PUBLIC_ACCESS !== "true"
  ) {
    throw new ServiceError(
      503,
      "请先在部署平台设置 APP_ACCESS_TOKEN 访问口令，或明确启用 ALLOW_PUBLIC_ACCESS。",
    );
  }
  if (token) {
    const supplied =
      request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const expectedBuffer = Buffer.from(token);
    const suppliedBuffer = Buffer.from(supplied);
    if (
      expectedBuffer.length !== suppliedBuffer.length ||
      !timingSafeEqual(expectedBuffer, suppliedBuffer)
    ) {
      throw new ServiceError(401, "请在「我的表达」中填写正确的站点访问口令。");
    }
  }
}

// Best-effort per-instance limiter. Production multi-instance quotas require a shared store.
const requests = new Map<string, { count: number; expires: number }>();
export function checkRateLimit(request: Request, now = Date.now()) {
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (requests.size >= 1000) {
    for (const [key, value] of requests)
      if (value.expires <= now) requests.delete(key);
    if (requests.size >= 1000 && !requests.has(address))
      throw new ServiceError(429, "当前访问较多，请稍后再试。");
  }
  const current = requests.get(address);
  if (!current || current.expires <= now) {
    requests.set(address, { count: 1, expires: now + 60_000 });
    return;
  }
  if (current.count >= 8)
    throw new ServiceError(
      429,
      "操作有点快，每分钟最多生成 8 次，请稍后再试。",
    );
  current.count++;
}

export async function readBoundedJson(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new ServiceError(415, "请使用 JSON 提交内容。");
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES)
    throw new ServiceError(413, "内容过大，请减少图片或文字后重试。");
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError(400, "没有收到聊天内容。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ServiceError(413, "内容过大，请减少图片或文字后重试。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ServiceError(400, "提交内容不是有效的 JSON。");
  }
}

export function validateImages(images: string[]) {
  for (const image of images) {
    const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(image)!;
    const bytes = Buffer.from(match[2], "base64");
    const valid =
      match[1] === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : match[1] === "jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid)
      throw new ServiceError(400, "图片内容与格式不符，请重新上传有效截图。");
  }
}
