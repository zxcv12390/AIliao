import { test, expect } from "@playwright/test";
import { EXAMPLES } from "../../lib/examples";

test("示例、语气、收藏和偏好可以实际操作", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /把难开口的话，\s*说得刚刚好。/ }),
  ).toBeVisible();
  await expect(
    page.getByText("当前为预设场景示例，未调用模型。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "“随便你”该怎么接" }).click();
  await expect(page.getByLabel("聊天内容")).toHaveValue(
    EXAMPLES[1].conversation,
  );
  await page.getByRole("button", { name: "收藏自然确认" }).click();
  await page.getByRole("button", { name: /回复收藏/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    EXAMPLES[1].result.replies[0].text,
  );
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "我的表达", exact: true }).click();
  await page.getByLabel("表达偏好").fill("不要用亲爱的，句子简短一点。");
  await page.getByRole("button", { name: "保存偏好" }).click();
  await page.reload();
  await page.getByRole("button", { name: "我的表达", exact: true }).click();
  await expect(page.getByLabel("表达偏好")).toHaveValue(
    "不要用亲爱的，句子简短一点。",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /开始新的对话/ }).click();
  await expect(page.getByLabel("聊天内容")).toHaveValue("");
  await page.getByRole("button", { name: "帮我想想怎么回" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "先贴一段聊天" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "坚定一点", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "坚定一点", exact: true }),
  ).toHaveClass("selected");
});

test("图片上传、知识资料、联网主题及生成请求可以联动（模拟模型响应）", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        accessRequired: false,
        deploymentLocked: false,
      },
    }),
  );
  let submitted: Record<string, any> | undefined;
  await page.route("**/api/analyze", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      json: {
        ...EXAMPLES[0].result,
        searched: true,
        sources: [{ title: "实际测试来源", url: "https://example.com/policy" }],
      },
    });
  });
  await page.goto("/");
  await expect(page.getByText("模型已配置")).toBeVisible();
  await page.getByRole("button", { name: /开始新的对话/ }).click();
  await page.getByLabel("聊天内容").fill("对方让我临时接一个任务，我想拒绝。");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 80, 80);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("上传聊天截图")
    .setInputFiles({
      name: "test-chat.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
  await expect(page.getByRole("img", { name: "test-chat.png" })).toBeVisible();
  await page
    .locator('input[accept=".md,.txt"]')
    .setInputFiles({
      name: "context.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("只帮忙看思路，不接整份任务。"),
    });
  await page.getByRole("switch", { name: "联网查证" }).click();
  await page.getByLabel("公开检索主题").fill("公开的职场沟通方法");
  await page.getByRole("button", { name: "帮我想想怎么回" }).click();
  await expect(
    page.getByText(EXAMPLES[0].result.replies[0].text, { exact: true }),
  ).toBeVisible();
  expect(submitted?.images).toHaveLength(1);
  expect(submitted?.images[0]).toMatch(/^data:image\/jpeg;base64,/);
  expect(submitted?.knowledge).toBe("只帮忙看思路，不接整份任务。");
  expect(submitted?.searchQuery).toBe("公开的职场沟通方法");
  await expect(
    page.getByRole("link", { name: "实际测试来源" }),
  ).toHaveAttribute("href", "https://example.com/policy");
  await expect(page.getByText("示例回复", { exact: true })).not.toBeVisible();
});

test("未配置模型时不伪造生成，手机布局可操作且无横向溢出", async ({ page }) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        configured: false,
        accessRequired: false,
        deploymentLocked: true,
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("聊天内容").fill("这是一段新的聊天，和示例不同。");
  await page.getByRole("button", { name: "帮我想想怎么回" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "还未连接模型" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "我的表达", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("屏幕捕获拿到一帧后停止共享（模拟浏览器授权的视频流）", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    canvas.getContext("2d")!.fillRect(0, 0, 200, 100);
    const stream = canvas.captureStream(5);
    const track = stream.getVideoTracks()[0];
    const stop = track.stop.bind(track);
    track.stop = () => {
      stop();
      document.documentElement.dataset.captureStopped = "true";
    };
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      value: async () => stream,
    });
  });
  await page.getByRole("button", { name: "截取屏幕", exact: true }).click();
  await expect(page.getByRole("img", { name: "屏幕截图.png" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-capture-stopped",
    "true",
  );
  await page.getByRole("button", { name: "移除屏幕截图.png" }).click();
  await expect(
    page.getByRole("img", { name: "屏幕截图.png" }),
  ).not.toBeVisible();
});
