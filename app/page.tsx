"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Briefcase,
  Check,
  Copy,
  FileText,
  Globe2,
  Heart,
  ImagePlus,
  Leaf,
  Lightbulb,
  Loader2,
  LockKeyhole,
  Menu,
  MessageCircle,
  MessageSquare,
  MonitorUp,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  AnalysisSchema,
  MAX_IMAGES,
  SCENES,
  TONES,
  type AdviceResult,
  type SavedReply,
} from "@/lib/contracts";
import { EXAMPLES } from "@/lib/examples";
import { captureScreen, prepareImage } from "@/lib/images";

type ModalName = "preferences" | "saved" | "guide" | null;
type Attachment = { id: string; src: string; name: string };

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function Home() {
  const [scene, setScene] = useState<string>("自动识别");
  const [tone, setTone] = useState<string>("自然一点");
  const [conversation, setConversation] = useState(EXAMPLES[0].conversation);
  const [goal, setGoal] = useState(EXAMPLES[0].goal);
  const [images, setImages] = useState<Attachment[]>([]);
  const [result, setResult] = useState<AdviceResult | null>(EXAMPLES[0].result);
  const [isDemo, setIsDemo] = useState(true);
  const [running, setRunning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState<{
    configured: boolean;
    accessRequired: boolean;
    deploymentLocked: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalName>(null);
  const [preferences, setPreferences] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [knowledgeName, setKnowledgeName] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [saved, setSaved] = useState<SavedReply[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setError("无法读取服务状态，请刷新页面重试。"));
    try {
      setPreferences(localStorage.getItem("huiyi-preferences") || "");
      const stored = JSON.parse(localStorage.getItem("huiyi-saved") || "[]");
      if (Array.isArray(stored))
        setSaved(
          stored
            .filter(
              (x) =>
                typeof x?.id === "string" &&
                typeof x?.text === "string" &&
                typeof x?.label === "string" &&
                typeof x?.date === "string",
            )
            .slice(0, 50),
        );
    } catch {
      /* Storage is optional, including in private browsing. */
    }
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  function edited() {
    controller.current?.abort();
    setResult(null);
    setIsDemo(false);
    setError("");
  }
  function reset() {
    controller.current?.abort();
    setConversation("");
    setGoal("");
    setImages([]);
    setResult(null);
    setError("");
    setIsDemo(false);
    setSidebarOpen(false);
    setKnowledge("");
    setKnowledgeName("");
    setWebSearch(false);
    setSearchQuery("");
    textRef.current?.focus();
  }
  function loadExample(index: number) {
    if (running) return;
    const example = EXAMPLES[index];
    setConversation(example.conversation);
    setGoal(example.goal);
    setScene(example.tag);
    setTone("自然一点");
    setResult(example.result);
    setIsDemo(true);
    setImages([]);
    setError("");
    setWebSearch(false);
    setSearchQuery("");
  }
  async function addImages(files: File[]) {
    if (!files.length || running) return;
    if (images.length >= MAX_IMAGES) {
      setError("一次最多上传 3 张截图。");
      return;
    }
    setPreparing(true);
    setError("");
    try {
      const slots = MAX_IMAGES - images.length;
      if (files.length > slots)
        setToast(`本次只添加前 ${slots} 张图片，最多支持 3 张。`);
      const prepared = await Promise.all(
        files
          .slice(0, slots)
          .map(async (file) => ({
            id: crypto.randomUUID(),
            name: file.name,
            src: await prepareImage(file),
          })),
      );
      setImages((previous) => [...previous, ...prepared].slice(0, MAX_IMAGES));
      edited();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "图片读取失败，请重新选择。",
      );
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  async function screenshot() {
    try {
      await addImages([await captureScreen()]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError")
        setToast("已取消屏幕截取。也可以用系统截图后粘贴。");
      else
        setError(
          err instanceof Error ? err.message : "无法截取屏幕，请改用截图上传。",
        );
    }
  }
  async function analyze() {
    if (running || preparing) return;
    setError("");
    if (!conversation.trim() && !images.length) {
      setError("先贴一段聊天，或者上传一张截图吧。");
      textRef.current?.focus();
      return;
    }
    if (webSearch && searchQuery.trim().length < 2) {
      setError("请填写不含隐私的公开检索主题。");
      return;
    }
    if (status && !status.configured) {
      setError(
        "还未连接模型。请在部署平台设置 AILIAO_API_KEY；下方场景卡片可体验示例。",
      );
      return;
    }
    if (status?.deploymentLocked) {
      setError(
        "请先在部署平台设置 APP_ACCESS_TOKEN 站点访问口令，再重新部署。",
      );
      return;
    }
    if (status?.accessRequired && !accessToken) {
      setModal("preferences");
      setError("请先在「我的表达」中填写站点访问口令。");
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setIsDemo(false);
    setResult(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          conversation,
          images: images.map((image) => image.src),
          scene,
          tone,
          goal,
          preferences,
          knowledge,
          webSearch,
          searchQuery,
        }),
        signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败，请稍后重试。");
      const parsed = AnalysisSchema.safeParse(data);
      if (!parsed.success) throw new Error("没有收到完整回复，请重新生成。");
      if (abort.signal.aborted)
        throw new DOMException("请求已取消", "AbortError");
      setResult({
        ...parsed.data,
        sources: Array.isArray(data.sources) ? data.sources : [],
        searched: data.searched === true,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError")
        setToast("已停止本次生成。");
      else
        setError(
          err instanceof Error ? err.message : "网络暂时不太顺畅，请稍后重试。",
        );
    } finally {
      setRunning(false);
      controller.current = null;
    }
  }
  async function copy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setToast("已复制，发送前再确认一下是否符合你的意思。");
      setTimeout(() => setCopied(null), 2200);
    } catch {
      setError("浏览器未允许复制，请选中文字后手动复制。");
    }
  }
  function persistSaved(items: SavedReply[]) {
    setSaved(items);
    try {
      localStorage.setItem("huiyi-saved", JSON.stringify(items));
    } catch {
      setToast("当前浏览器不能保存数据，收藏仅在本次打开期间有效。");
    }
  }
  function saveReply(text: string, label: string) {
    if (saved.some((item) => item.text === text)) {
      setToast("这句话已经在收藏里了。");
      return;
    }
    persistSaved(
      [
        {
          id: crypto.randomUUID(),
          text,
          label,
          date: new Date().toLocaleDateString("zh-CN"),
        },
        ...saved,
      ].slice(0, 50),
    );
    setToast("已收藏到这台设备，可以在「回复收藏」里查看。");
  }
  async function importKnowledge(file?: File) {
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 100_000) {
      setError("请上传 100 KB 以内的 TXT 或 Markdown 资料。");
      return;
    }
    const text = await file.text();
    if (text.length > 16000) {
      setError("参考资料不能超过 16,000 字符，请先精简内容。");
      return;
    }
    setKnowledge(text);
    setKnowledgeName(file.name);
    edited();
    setToast("资料已加入本次对话，生成时会一并提交给模型。");
  }

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <a className="brand" href="/" aria-label="会意首页">
          <span className="brand-icon">
            <MessageSquare size={23} />
            <span />
          </span>
          <div>
            <strong>
              会意<span>HUIYI</span>
            </strong>
            <small>你的高情商聊天搭子</small>
          </div>
        </a>
        <button className="new-chat" onClick={reset}>
          <Plus size={18} /> 开始新的对话
        </button>
        <div className="nav-label">我的工作台</div>
        <nav className="main-nav" aria-label="主要导航">
          <button
            className="active"
            onClick={() => {
              setSidebarOpen(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <MessageCircle size={18} />
            回复工作台
            <span className="nav-dot" />
          </button>
          <button
            onClick={() => {
              setModal("saved");
              setSidebarOpen(false);
            }}
          >
            <Bookmark size={18} />
            回复收藏
            {saved.length > 0 && (
              <span className="nav-count">{saved.length}</span>
            )}
          </button>
          <button
            onClick={() => {
              setModal("preferences");
              setSidebarOpen(false);
            }}
          >
            <SlidersHorizontal size={18} />
            我的表达
          </button>
        </nav>
        <div className="nav-label scene-nav-label">总有一句，适合此刻</div>
        <nav className="scene-nav" aria-label="沟通场景">
          {[
            { icon: Briefcase, label: "职场沟通" },
            { icon: Heart, label: "亲密关系" },
            { icon: Users, label: "朋友家人" },
            { icon: MessageSquare, label: "客户商务" },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              className={scene === label ? "chosen" : ""}
              onClick={() => {
                setScene(label);
                edited();
                setSidebarOpen(false);
              }}
            >
              <Icon size={16} />
              {label}
              <span>↗</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <Leaf size={23} />
            <p>
              会说话，不是说漂亮话。
              <br />
              <strong>是把真心，表达得更好。</strong>
            </p>
          </div>
          <button className="guide-link" onClick={() => setModal("guide")}>
            <BookOpen size={17} />
            使用指南
            <ArrowUpRight size={15} />
          </button>
          <div className="sidebar-footer">
            <span className="mini-mark">会</span>
            <div>
              为自己，好好表达
              <small>A little understanding goes a long way.</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>会意</span>
            <span className="slash">/</span>
            <strong>回复工作台</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection ${status?.configured && !status.deploymentLocked ? "live" : ""}`}
            >
              <i />
              {status?.configured && !status.deploymentLocked
                ? "模型已配置"
                : "示例体验"}
            </span>
            <span className="topbar-divider" />
            <button onClick={() => setModal("guide")}>
              <BookOpen size={16} />
              <span>使用指南</span>
            </button>
          </div>
        </header>

        <main className="workspace">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span />
                懂语境，有分寸，更像你
              </div>
              <h1>
                把难开口的话，
                <br className="mobile-break" />
                <span>说得刚刚好。</span>
                <svg viewBox="0 0 218 14" aria-hidden="true">
                  <path d="M3 10 Q105 -4 215 7" />
                </svg>
              </h1>
              <p>分享一段聊天，让会意帮你接住情绪，也说清自己。</p>
            </div>
            <div className="hero-art" aria-hidden="true">
              <span className="art-star">✳</span>
              <div className="art-bubble first">
                有些话，不知怎么说…<span>···</span>
              </div>
              <div className="art-bubble second">
                <span className="art-spark">✧</span>慢慢来，我们一起想。
              </div>
              <span className="art-orbit" />
            </div>
          </section>

          <div className="work-grid">
            <div className="work-main">
              <section
                className={`panel composer ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                    setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void addImages(Array.from(e.dataTransfer.files));
                }}
              >
                <div className="section-heading">
                  <div>
                    <span className="step-number">01</span>
                    <h2>说说你的情况</h2>
                  </div>
                  <span className="quiet-label">
                    一段文字，一张截图，都可以
                  </span>
                </div>
                <div className="scene-tabs" aria-label="选择沟通场景">
                  {SCENES.map((label) => (
                    <button
                      className={scene === label ? "selected" : ""}
                      key={label}
                      onClick={() => {
                        setScene(label);
                        edited();
                      }}
                    >
                      {label === "自动识别" && <Sparkles size={14} />} {label}
                    </button>
                  ))}
                </div>
                <label className="sr-only" htmlFor="conversation">
                  聊天内容
                </label>
                <div className="conversation-box">
                  <textarea
                    ref={textRef}
                    id="conversation"
                    value={conversation}
                    maxLength={12000}
                    disabled={running}
                    onChange={(e) => {
                      setConversation(e.target.value);
                      edited();
                    }}
                    onPaste={(e) => {
                      const files = Array.from(e.clipboardData.files).filter(
                        (f) => f.type.startsWith("image/"),
                      );
                      if (files.length) {
                        e.preventDefault();
                        void addImages(files);
                      }
                    }}
                    placeholder={
                      "把聊天内容粘贴在这里…\n也可以直接粘贴截图（Ctrl / ⌘ + V）"
                    }
                  />
                  {images.length > 0 && (
                    <div className="attachments">
                      {images.map((image) => (
                        <div className="attachment" key={image.id}>
                          <img src={image.src} alt={image.name} />
                          <span>{image.name}</span>
                          <button
                            disabled={running}
                            aria-label={`移除${image.name}`}
                            onClick={() => {
                              setImages((previous) =>
                                previous.filter((i) => i.id !== image.id),
                              );
                              edited();
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="input-toolbar">
                    <div>
                      <button
                        disabled={running || preparing}
                        onClick={() => inputRef.current?.click()}
                      >
                        <ImagePlus size={16} />
                        {preparing ? "处理图片中…" : "上传截图"}
                      </button>
                      <button
                        disabled={running || preparing}
                        onClick={() => void screenshot()}
                      >
                        <MonitorUp size={16} />
                        <span>截取屏幕</span>
                      </button>
                    </div>
                    <span>{conversation.length.toLocaleString()} / 12,000</span>
                  </div>
                </div>
                <input
                  ref={inputRef}
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  aria-label="上传聊天截图"
                  onChange={(e) =>
                    void addImages(Array.from(e.target.files || []))
                  }
                />
                <div className="goal-heading">
                  <label htmlFor="goal">
                    你想怎么回应？<span>选填，让回复更懂你</span>
                  </label>
                </div>
                <input
                  id="goal"
                  className="goal-input"
                  value={goal}
                  maxLength={800}
                  disabled={running}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    edited();
                  }}
                  placeholder="比如：礼貌拒绝，但不想把关系弄僵"
                />
                <div className="tone-row">
                  <span>
                    <SlidersHorizontal size={14} />
                    回复语气
                  </span>
                  <div>
                    {TONES.map((label) => (
                      <button
                        key={label}
                        disabled={running}
                        className={tone === label ? "selected" : ""}
                        onClick={() => {
                          setTone(label);
                          edited();
                        }}
                      >
                        {label}
                        {tone === label && <Check size={11} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="composer-options">
                  <button
                    role="switch"
                    aria-checked={webSearch}
                    className={`search-toggle ${webSearch ? "on" : ""}`}
                    disabled={running}
                    onClick={() => {
                      setWebSearch(!webSearch);
                      edited();
                    }}
                  >
                    <span className="switch-track">
                      <i />
                    </span>
                    <Globe2 size={14} />
                    联网查证
                  </button>
                  <label className="knowledge-button">
                    <FileText size={14} />
                    {knowledgeName || "添加参考资料"}
                    <input
                      type="file"
                      accept=".md,.txt"
                      disabled={running}
                      onChange={(e) => {
                        void importKnowledge(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {knowledgeName && (
                    <button
                      className="remove-knowledge"
                      aria-label="移除参考资料"
                      onClick={() => {
                        setKnowledge("");
                        setKnowledgeName("");
                        edited();
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                {webSearch && (
                  <div className="search-options">
                    <label htmlFor="searchQuery">公开检索主题</label>
                    <input
                      id="searchQuery"
                      maxLength={300}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        edited();
                      }}
                      placeholder="例如：某平台的退款规则，别填写姓名、电话或私聊原文"
                    />
                    <p>仅此主题用于联网检索；聊天正文和截图不放进检索请求。</p>
                  </div>
                )}
                {error && (
                  <div className="error-message" role="alert">
                    {error}
                  </div>
                )}
                <div className="generate-row">
                  <span>
                    <ShieldCheck size={14} />
                    仅在你点击生成时提交内容给模型
                  </span>
                  <button
                    className="generate-button"
                    disabled={running || preparing}
                    onClick={() => void analyze()}
                  >
                    {running ? (
                      <Loader2 size={17} className="spin" />
                    ) : (
                      <Sparkles size={17} />
                    )}{" "}
                    {running ? "正在想一句合适的话…" : "帮我想想怎么回"}
                    {!running && <ArrowRight size={16} />}
                  </button>
                  {running && (
                    <button
                      className="stop-button"
                      onClick={() => controller.current?.abort()}
                    >
                      停止
                    </button>
                  )}
                </div>
              </section>

              <section
                className="replies-section"
                aria-live="polite"
                aria-busy={running}
              >
                <div className="reply-section-header">
                  <div>
                    <span className="step-number">02</span>
                    <h2>这样回，刚刚好</h2>
                    {isDemo && <span className="demo-badge">示例回复</span>}
                  </div>
                  {result && <span>保留你的真诚，多一点分寸</span>}
                </div>
                {running ? (
                  <div className="empty-replies">
                    <Loader2 size={28} className="spin" />
                    <h3>
                      {webSearch
                        ? "先查证，再好好表达"
                        : "正在理解语境，斟酌措辞"}
                    </h3>
                    <p>不急着给标准答案，先找到适合你的表达。</p>
                  </div>
                ) : result ? (
                  <div className="reply-list">
                    {result.replies.map((reply, index) => (
                      <article
                        className={`reply-card ${index === 0 ? "recommended" : ""}`}
                        key={`${reply.label}-${index}`}
                      >
                        <div className="reply-card-top">
                          <div>
                            <span className="reply-icon">
                              {index === 0 ? (
                                <Sparkles size={15} />
                              ) : index === 1 ? (
                                <Leaf size={15} />
                              ) : (
                                <MessageCircle size={15} />
                              )}
                            </span>
                            <h3>{reply.label}</h3>
                            {index === 0 && (
                              <span className="recommended-badge">推荐</span>
                            )}
                          </div>
                          <div className="reply-actions">
                            <button
                              className={
                                saved.some((item) => item.text === reply.text)
                                  ? "is-saved"
                                  : ""
                              }
                              aria-label={`收藏${reply.label}`}
                              onClick={() => saveReply(reply.text, reply.label)}
                            >
                              <Bookmark size={15} />
                            </button>
                            <button
                              onClick={() => void copy(reply.text, index)}
                            >
                              {copied === index ? (
                                <Check size={14} />
                              ) : (
                                <Copy size={14} />
                              )}
                              <span>
                                {copied === index ? "已复制" : "复制"}
                              </span>
                            </button>
                          </div>
                        </div>
                        <p className="reply-text">{reply.text}</p>
                        <p className="reply-reason">{reply.reason}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-replies">
                    <MessageCircle size={29} />
                    <h3>好的表达，从理解开始</h3>
                    <p>说说发生了什么，我们一起找到合适的回复。</p>
                  </div>
                )}
                {result && (
                  <p className="reply-footnote">
                    <Smile size={13} />
                    回复是草稿，发送前选一句最像你的。
                  </p>
                )}
              </section>
            </div>

            <aside className="context-column">
              <section className="panel insight-panel">
                <div className="insight-heading">
                  <span>
                    <Lightbulb size={18} />
                  </span>
                  <h2>先读懂，再回应</h2>
                  <span className="tiny-stars">✧</span>
                </div>
                {result ? (
                  <>
                    <span className="scene-badge">
                      <i />
                      {result.scene}
                    </span>
                    <div className="insight-block">
                      <h3>发生了什么</h3>
                      <p>{result.summary}</p>
                    </div>
                    <div className="insight-block">
                      <h3>换个角度看</h3>
                      <p>{result.insight}</p>
                    </div>
                    <div className="gentle-reminder">
                      <Leaf size={16} />
                      <div>
                        <strong>分寸小提醒</strong>
                        <p>{result.caution}</p>
                      </div>
                    </div>
                    {result.sources.length > 0 && (
                      <div className="sources">
                        <h3>
                          <Globe2 size={13} />
                          查证来源
                        </h3>
                        {result.sources.map(
                          (source) =>
                            /^https?:\/\//.test(source.url) && (
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                key={source.url}
                              >
                                {source.title}
                                <ArrowUpRight size={12} />
                              </a>
                            ),
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="insight-empty">
                    <div className="insight-doodle">
                      <MessageCircle size={38} />
                      <span>✧</span>
                    </div>
                    <p>
                      不急着判断对错，
                      <br />
                      先看看话里真正的意思。
                    </p>
                    <small>生成后，这里会呈现场景理解与分寸提醒。</small>
                  </div>
                )}
                {isDemo && (
                  <p className="demo-note">当前为预设场景示例，未调用模型。</p>
                )}
              </section>
              <section className="inspiration-panel">
                <div className="small-section-heading">
                  <h2>一时没思路？</h2>
                  <span>试试这些场景</span>
                </div>
                {EXAMPLES.map((example, index) => (
                  <button
                    className="example-card"
                    key={example.title}
                    onClick={() => loadExample(index)}
                    disabled={running}
                  >
                    <span className={`example-icon example-${index}`}>
                      {index === 0 ? (
                        <Briefcase size={17} />
                      ) : index === 1 ? (
                        <Heart size={17} />
                      ) : (
                        <Users size={17} />
                      )}
                    </span>
                    <span>
                      <strong>{example.title}</strong>
                      <small>{example.tag}</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </section>
              <div className="quiet-quote">
                <span>“</span>
                <p>
                  真正舒服的沟通，
                  <br />
                  是照顾别人，也不委屈自己。
                </p>
                <small>一 会意的小小坚持</small>
              </div>
            </aside>
          </div>
          <footer className="page-footer">
            <span className="footer-brand">
              <MessageSquare size={13} />
              会意 HUIYI
            </span>
            <span>让每一次表达，都离理解更近一点。</span>
            <button onClick={() => setModal("guide")}>
              关于会意
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>

      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
      {modal === "preferences" && (
        <Modal title="我的表达" onClose={() => setModal(null)}>
          <p className="modal-description">
            不用变成别人。让回复更接近你平时说话的样子。
          </p>
          <label className="field-label" htmlFor="preferences">
            表达偏好
          </label>
          <textarea
            id="preferences"
            className="preference-textarea"
            value={preferences}
            maxLength={1200}
            onChange={(e) => setPreferences(e.target.value)}
            placeholder="例如：说话简短，不叫亲爱的，不用表情。拒绝时不要替我找借口。"
          />
          <p className="field-note">
            偏好保存在当前浏览器，生成时会发送给模型；不包含 API Key。
          </p>
          {status?.accessRequired && (
            <>
              <label className="field-label" htmlFor="accessToken">
                <LockKeyhole size={14} />
                站点访问口令
              </label>
              <input
                id="accessToken"
                className="modal-input"
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                autoComplete="off"
                placeholder="由网站管理员设置的访问口令"
              />
              <p className="field-note">
                只在本次打开期间使用，刷新后需要重新输入。
              </p>
            </>
          )}
          <button
            className="primary-button"
            onClick={() => {
              try {
                localStorage.setItem("huiyi-preferences", preferences);
                setToast("表达偏好已保存在这台设备。");
              } catch {
                setToast("当前无法保存到浏览器，偏好仅在本次打开期间有效。");
              }
              edited();
              setModal(null);
            }}
          >
            保存偏好
            <Check size={16} />
          </button>
        </Modal>
      )}
      {modal === "saved" && (
        <Modal title="回复收藏" onClose={() => setModal(null)}>
          <p className="modal-description">
            只保存在当前浏览器，最多 50 条。清除浏览器数据也会清除收藏。
          </p>
          {saved.length ? (
            <div className="saved-list">
              {saved.map((item, index) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.date}</small>
                  </div>
                  <p>{item.text}</p>
                  <div className="saved-actions">
                    <button onClick={() => void copy(item.text, index)}>
                      <Copy size={14} />
                      复制
                    </button>
                    <button
                      aria-label={`删除收藏${index + 1}`}
                      onClick={() =>
                        persistSaved(saved.filter((x) => x.id !== item.id))
                      }
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="saved-empty">
              <Bookmark size={32} />
              <p>还没有收藏。遇到喜欢的表达，点一下书签就能留下。</p>
            </div>
          )}
        </Modal>
      )}
      {modal === "guide" && (
        <Modal title="让会意更懂你" onClose={() => setModal(null)}>
          <div className="guide-content">
            <section>
              <span>01</span>
              <div>
                <h3>给一点上下文</h3>
                <p>
                  粘贴聊天或上传最多 3
                  张截图，告诉会意哪边是你、你想达到什么目的。截图先打码会更安心。
                </p>
              </div>
            </section>
            <section>
              <span>02</span>
              <div>
                <h3>选择适合你的分寸</h3>
                <p>
                  选场景、调语气，或在「我的表达」中保存偏好。会意提供草稿，由你决定怎样表达。
                </p>
              </div>
            </section>
            <section>
              <span>03</span>
              <div>
                <h3>需要事实，再联网</h3>
                <p>
                  开启联网后，填写不含私聊原文的公开主题。也可以上传 TXT /
                  Markdown 作为本次参考资料。资料和截图会发送到配置的模型服务。
                </p>
              </div>
            </section>
            <section>
              <span>04</span>
              <div>
                <h3>你的桌面，由你决定</h3>
                <p>
                  「截取屏幕」需要浏览器授权，仅截取一帧并结束共享；不支持时可使用系统截图后粘贴。没有后台读取或自动发送功能。
                </p>
              </div>
            </section>
          </div>
          <div className="guide-note">
            <ShieldCheck size={17} />
            <p>
              网站不主动将聊天和图片写入数据库。模型服务和部署平台的数据处理规则仍然适用；请勿提交密码、密钥或未经同意的敏感资料。
            </p>
          </div>
          <button className="primary-button" onClick={() => setModal(null)}>
            开始好好表达
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
