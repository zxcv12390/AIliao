import { z } from "zod";

export const SCENES = [
  "自动识别",
  "职场沟通",
  "亲密关系",
  "朋友家人",
  "客户商务",
] as const;
export const TONES = ["自然一点", "温柔一点", "坚定一点", "轻松一点"] as const;
export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_BODY_BYTES = 4_400_000;

const ImageSchema = z
  .string()
  .max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 100)
  .regex(
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    "请上传 PNG、JPEG 或 WebP 图片",
  );

export const InputSchema = z
  .object({
    conversation: z.string().max(12000).default(""),
    images: z.array(ImageSchema).max(MAX_IMAGES).default([]),
    scene: z.enum(SCENES).default("自动识别"),
    tone: z.enum(TONES).default("自然一点"),
    goal: z.string().max(800).default(""),
    preferences: z.string().max(1200).default(""),
    knowledge: z.string().max(16000).default(""),
    webSearch: z.boolean().default(false),
    searchQuery: z.string().max(300).default(""),
  })
  .superRefine((input, ctx) => {
    if (!input.conversation.trim() && !input.images.length) {
      ctx.addIssue({
        code: "custom",
        path: ["conversation"],
        message: "请先填写聊天内容或上传截图",
      });
    }
    if (input.webSearch && input.searchQuery.trim().length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["searchQuery"],
        message: "请填写不含隐私的检索主题",
      });
    }
  });

export const AnalysisSchema = z.object({
  scene: z.string().min(1).max(80),
  summary: z.string().min(1).max(500),
  insight: z.string().min(1).max(600),
  caution: z.string().min(1).max(400),
  replies: z
    .array(
      z.object({
        label: z.string().min(1).max(30),
        text: z.string().min(1).max(1200),
        reason: z.string().min(1).max(240),
      }),
    )
    .length(3),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type AdviceInput = z.infer<typeof InputSchema>;
export type Source = { title: string; url: string };
export type AdviceResult = Analysis & { sources: Source[]; searched: boolean };
export type SavedReply = {
  id: string;
  text: string;
  label: string;
  date: string;
};

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scene: { type: "string" },
    summary: { type: "string" },
    insight: { type: "string" },
    caution: { type: "string" },
    replies: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          text: { type: "string" },
          reason: { type: "string" },
        },
        required: ["label", "text", "reason"],
      },
    },
  },
  required: ["scene", "summary", "insight", "caution", "replies"],
};
