import { MAX_IMAGE_BYTES } from "./contracts";

export async function prepareImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("请选择 PNG、JPEG 或 WebP 截图。");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("原图不能超过 12 MB，请先裁剪需要分析的聊天区域。");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器暂时无法读取图片，请改用文字。");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.75, 0.6, 0.45]) {
      const result = canvas.toDataURL("image/jpeg", quality);
      if ((result.length - result.indexOf(",") - 1) * 0.75 <= MAX_IMAGE_BYTES)
        return result;
    }
    throw new Error("截图内容过大，请裁剪到需要分析的聊天区域再上传。");
  } finally {
    bitmap.close();
  }
}

export async function captureScreen(): Promise<File> {
  if (!navigator.mediaDevices?.getDisplayMedia)
    throw new Error("当前浏览器不支持屏幕截取，请用系统截图后粘贴或上传。");
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    if (!video.videoWidth || !video.videoHeight)
      throw new Error("还没有获取到画面，请重试或上传截图。");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("截取失败，请改用系统截图。");
    return new File([blob], "屏幕截图.png", { type: "image/png" });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
