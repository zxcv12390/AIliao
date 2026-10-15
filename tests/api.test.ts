import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { POST } from "../app/api/analyze/route";
import { GET } from "../app/api/status/route";
import { checkRateLimit, readBoundedJson } from "../lib/server-security";
import { MAX_BODY_BYTES } from "../lib/contracts";
import { EXAMPLES } from "../lib/examples";

function request(body: unknown, token = "local-test-password") {
  return new Request("http://localhost:3000/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost:3000",
      origin: "http://localhost:3000",
      Authorization: `Bearer ${token}`,
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
}

test("API 完整链路：访问口令、图片请求、模型返回与不落缓存", async () => {
  const keys = [
    "AILIAO_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "APP_ACCESS_TOKEN",
    "ALLOW_PUBLIC_ACCESS",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const server = createServer(async (req, res) => {
    assert.equal(req.url, "/responses");
    assert.equal(req.headers.authorization, "Bearer fake-test-key");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(body.store, false);
    const {
      sources: _sources,
      searched: _searched,
      ...analysis
    } = EXAMPLES[0].result;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(analysis) }],
          },
        ],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    process.env.AILIAO_API_KEY = "fake-test-key";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.APP_ACCESS_TOKEN = "local-test-password";
    let response = await POST(request({ conversation: "帮我礼貌拒绝" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).replies.length, 3);
    response = await POST(request({ conversation: "测试" }, "wrong"));
    assert.equal(response.status, 401);
    response = await POST(request({ conversation: "" }));
    assert.equal(response.status, 400);
    response = await POST(request({ conversation: "x".repeat(12001) }));
    assert.equal(response.status, 400);
    response = await POST(
      request({
        conversation: "测试",
        images: ["data:image/png;base64,ZmFrZQ=="],
      }),
    );
    assert.equal(response.status, 400);
    response = await POST(request({ conversation: "测试", webSearch: true }));
    assert.equal(response.status, 400);
    const crossOrigin = request({ conversation: "测试" });
    crossOrigin.headers.set("origin", "https://other.example");
    response = await POST(crossOrigin);
    assert.equal(response.status, 403);
    delete process.env.AILIAO_API_KEY;
    delete process.env.OPENAI_API_KEY;
    response = await POST(request({ conversation: "测试" }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /模型尚未配置/);
    const status = await GET().json();
    assert.equal(status.configured, false);
    assert.equal(status.accessRequired, true);
    assert.ok(!JSON.stringify(status).includes("local-test-password"));
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("无 Content-Length 的超大请求也被拒绝，错误 JSON 不进入模型", async () => {
  const tooLarge = new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "x".repeat(MAX_BODY_BYTES + 1),
  });
  await assert.rejects(readBoundedJson(tooLarge), /内容过大/);
  const badJson = new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  await assert.rejects(readBoundedJson(badJson), /有效的 JSON/);
  const badType = new Request("http://localhost/", {
    method: "POST",
    body: "{}",
  });
  await assert.rejects(readBoundedJson(badType), /JSON 提交/);
});

test("单实例限流拒绝第九次请求，并在窗口过期后恢复", () => {
  const req = new Request("http://localhost/", {
    headers: { "x-forwarded-for": crypto.randomUUID() },
  });
  for (let index = 0; index < 8; index++) checkRateLimit(req, 1000);
  assert.throws(() => checkRateLimit(req, 1000), /最多生成 8 次/);
  assert.doesNotThrow(() => checkRateLimit(req, 61001));
});
