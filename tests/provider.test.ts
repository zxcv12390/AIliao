import { test } from "node:test";
import assert from "node:assert/strict";
import { InputSchema } from "../lib/contracts";
import { extractOutput, generateAdvice, ServiceError } from "../lib/provider";
import { EXAMPLES } from "../lib/examples";

const config = {
  key: "test-key-never-public",
  model: "test-vision-model",
  baseUrl: "https://provider.example/v1",
};
const {
  sources: _sources,
  searched: _searched,
  ...analysis
} = EXAMPLES[0].result;
function output(
  text: string,
  annotations: { type: string; url: string; title: string }[] = [],
) {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text, annotations }],
      },
    ],
  });
}

test("图片和参考资料进入分析调用，模型密钥仅在 Authorization 头中", async () => {
  const image = "data:image/png;base64,iVBORw0KGgo=";
  const input = InputSchema.parse({
    conversation: "私聊内容",
    images: [image],
    preferences: "不答应借钱",
    knowledge: "组织自己的术语",
  });
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://provider.example/v1/responses");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Bearer ${config.key}`,
    );
    const body = JSON.parse(init?.body as string);
    assert.equal(body.store, false);
    assert.equal(body.model, config.model);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.input[0].content[1].image_url, image);
    assert.equal(
      JSON.parse(body.input[0].content[0].text).knowledge,
      input.knowledge,
    );
    assert.ok(!(init?.body as string).includes(config.key));
    assert.equal(body.tools, undefined);
    return output(JSON.stringify(analysis));
  };
  const result = await generateAdvice(input, config, undefined, fetcher);
  assert.equal(result.replies[0].text, analysis.replies[0].text);
  assert.deepEqual(result.sources, []);
  assert.equal(result.searched, false);
});

test("联网只发送公开主题，私聊、偏好、截图和资料不进入检索请求", async () => {
  const input = InputSchema.parse({
    conversation: "PRIVATE_CHAT_13900000000",
    preferences: "PRIVATE_PREFERENCES",
    knowledge: "PRIVATE_DOCUMENT",
    images: ["data:image/png;base64,iVBORw0KGgo="],
    webSearch: true,
    searchQuery: "某产品官方退款规则",
  });
  const bodies: Record<string, any>[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init?.body as string);
    bodies.push(body);
    if (bodies.length === 1)
      return output("已核对公开规则，存在适用范围限制。", [
        {
          type: "url_citation",
          title: "官方规则",
          url: "https://example.com/policy",
        },
      ]);
    return output(JSON.stringify(analysis));
  };
  const result = await generateAdvice(input, config, undefined, fetcher);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].input, input.searchQuery);
  assert.equal(bodies[0].tools[0].type, "web_search");
  assert.equal(bodies[0].tool_choice, "required");
  for (const privateField of [
    input.conversation,
    input.preferences,
    input.knowledge,
    input.images[0],
  ])
    assert.ok(!JSON.stringify(bodies[0]).includes(privateField));
  assert.equal(bodies[1].tools, undefined);
  assert.match(bodies[1].input[0].content[0].text, /适用范围限制/);
  assert.deepEqual(result.sources, [
    { title: "官方规则", url: "https://example.com/policy" },
  ]);
});

test("检索缺少真实引用时终止，不把无来源检索当成功", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return output("声称搜索成功但没有引用");
  };
  await assert.rejects(
    generateAdvice(
      InputSchema.parse({
        conversation: "测试",
        webSearch: true,
        searchQuery: "退款规则",
      }),
      config,
      undefined,
      fetcher,
    ),
    /可核验的来源/,
  );
  assert.equal(calls, 1);
});

test("上游错误不会把原始错误体或密钥返回给浏览器", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(`PRIVATE_INPUT ${config.key}`, { status: 401 });
  await assert.rejects(
    generateAdvice(
      InputSchema.parse({ conversation: "测试" }),
      config,
      undefined,
      fetcher,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceError);
      assert.equal(error.status, 502);
      assert.ok(!error.message.includes(config.key));
      assert.ok(!error.message.includes("PRIVATE_INPUT"));
      return true;
    },
  );
});

test("不完整结构、模型拒绝、截断和危险引用不会显示成正常建议", async () => {
  const input = InputSchema.parse({ conversation: "测试" });
  await assert.rejects(
    generateAdvice(input, config, undefined, async () =>
      output('{"replies":[]}'),
    ),
    /格式不完整/,
  );
  assert.throws(
    () =>
      extractOutput({
        status: "incomplete",
        output: [
          { type: "message", content: [{ type: "output_text", text: "{}" }] },
        ],
      }),
    /没有完成/,
  );
  assert.throws(
    () =>
      extractOutput({
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      }),
    /无法处理/,
  );
  const citations = extractOutput({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "资料",
            annotations: [
              {
                type: "url_citation",
                url: "javascript:alert(1)",
                title: "不安全",
              },
              {
                type: "url_citation",
                url: "https://example.com/",
                title: "来源",
              },
              {
                type: "url_citation",
                url: "https://example.com/",
                title: "来源",
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(citations.sources.length, 1);
});
