import { InputSchema } from "@/lib/contracts";
import { generateAdvice, ServiceError } from "@/lib/provider";
import {
  checkAccess,
  checkRateLimit,
  readBoundedJson,
  validateImages,
} from "@/lib/server-security";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host")) {
      throw new ServiceError(403, "不允许从其他网站提交请求。");
    }
    checkAccess(request);
    checkRateLimit(request);
    const parsed = InputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.issues[0]?.message || "输入内容无效" },
        { status: 400, headers },
      );
    validateImages(parsed.data.images);
    const result = await generateAdvice(parsed.data, undefined, request.signal);
    return Response.json(result, { headers });
  } catch (error) {
    const known = error instanceof ServiceError;
    return Response.json(
      { error: known ? error.message : "服务暂时遇到问题，请稍后重试。" },
      {
        status: known ? error.status : 500,
        headers,
      },
    );
  }
}
