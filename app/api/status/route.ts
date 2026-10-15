export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      configured: Boolean(
        process.env.AILIAO_API_KEY || process.env.OPENAI_API_KEY,
      ),
      accessRequired: Boolean(process.env.APP_ACCESS_TOKEN),
      deploymentLocked:
        process.env.NODE_ENV === "production" &&
        !process.env.APP_ACCESS_TOKEN &&
        process.env.ALLOW_PUBLIC_ACCESS !== "true",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
