"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  DIFFICULTY_LABELS,
  EVALUATION_PERSPECTIVE_LABELS,
  OUTPUT_FORMAT_LABELS,
  QUESTION_TYPE_LABELS,
  type Difficulty,
  type EvaluationPerspective,
  type OutputFormat,
  type QuestionType,
} from "@/lib/prompts";
import type { ChatStreamEvent } from "@/lib/chat-events";

interface Message {
  role: "user" | "assistant";
  content: string;
  statuses: string[];
  settingsSummary?: string;
}

const OUTPUT_FORMATS = Object.keys(OUTPUT_FORMAT_LABELS) as OutputFormat[];
const DIFFICULTIES = Object.keys(DIFFICULTY_LABELS) as Difficulty[];
const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];
const EVALUATION_PERSPECTIVES = Object.keys(EVALUATION_PERSPECTIVE_LABELS) as EvaluationPerspective[];

const QUESTION_COUNT_PRESETS = [5, 10, 15, 20];
const MAJOR_QUESTION_COUNT_PRESETS = [2, 3, 4, 5];

const QUICK_PROMPTS = [
  "現代社会の過去問を参考に、公共の「政治参加と選挙」の単元で選択式の小テストを10問作成してください",
  "「経済社会と私たちの生活」の単元で、記述式の練習問題を5問作成してください",
  "直近の共通テストの傾向を踏まえて、公共の総復習プリントを作成してください",
];

const DRAFT_STORAGE_KEY = "kyozai-agent:chat-draft";
const CUSTOM_PROMPTS_STORAGE_KEY = "kyozai-agent:custom-prompts";
const MAX_CUSTOM_PROMPTS = 10;

interface PersistedDraft {
  messages: Message[];
  input: string;
  outputFormat: OutputFormat;
  questionCountInput: string;
  majorQuestionCountInput: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  separateAnswerSheet: boolean;
  pageStart: string;
  pageEnd: string;
  includeGraphOrTableQuestion: boolean;
  evaluationPerspectives: EvaluationPerspective[];
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-zinc-200 p-1 dark:border-zinc-800">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={
            value === option.value
              ? "rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
              : "rounded-full px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function NumberChipInput({
  presets,
  value,
  onChange,
  disabled,
  unit,
  label,
}: {
  presets: number[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  unit: string;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {presets.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(String(n))}
          disabled={disabled}
          className={
            value === String(n)
              ? "rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
              : "rounded-full px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
          }
        >
          {n}
          {unit}
        </button>
      ))}
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="お任せ"
        aria-label={`${label}（自由入力、空欄でお任せ）`}
        className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
      />
    </div>
  );
}

function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="prose-message text-sm text-zinc-800 dark:text-zinc-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-black dark:text-zinc-50">{children}</strong>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline decoration-dotted hover:opacity-80"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => (
            <h1 className="mb-1 mt-2 font-serif text-base font-bold text-black first:mt-0 dark:text-zinc-50">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1 mt-2 font-serif text-sm font-bold text-black first:mt-0 dark:text-zinc-50">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-sm font-bold text-black first:mt-0 dark:text-zinc-50">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-accent/40 pl-3 text-zinc-600 last:mb-0 dark:text-zinc-400">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) =>
            className ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">{children}</code>
            ),
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100 last:mb-0">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-2 border-zinc-200 dark:border-zinc-800" />,
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto last:mb-0">
              <table className="border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-300 bg-zinc-50 px-2 py-1 text-left font-semibold dark:border-zinc-700 dark:bg-zinc-800">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-300 px-2 py-1 dark:border-zinc-700">{children}</td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function Avatar({ role }: { role: Message["role"] }) {
  return (
    <span
      aria-hidden
      className={
        role === "user"
          ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
          : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      }
    >
      {role === "user" ? "先生" : "AI"}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードAPIが使えない環境では何もしない
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="self-start text-xs text-zinc-400 transition-colors hover:text-accent"
    >
      {copied ? "コピーしました" : "コピー"}
    </button>
  );
}

interface ChatPanelProps {
  onMaterialCreated?: () => void;
}

export function ChatPanel({ onMaterialCreated }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("google_doc");
  const [questionCountInput, setQuestionCountInput] = useState("");
  const [majorQuestionCountInput, setMajorQuestionCountInput] = useState("");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("auto");
  const [questionType, setQuestionType] = useState<QuestionType>("auto");
  const [separateAnswerSheet, setSeparateAnswerSheet] = useState(false);
  const [pageStart, setPageStart] = useState("");
  const [pageEnd, setPageEnd] = useState("");
  const [includeGraphOrTableQuestion, setIncludeGraphOrTableQuestion] = useState(false);
  const [evaluationPerspectives, setEvaluationPerspectives] = useState<EvaluationPerspective[]>([]);
  const [customPrompts, setCustomPrompts] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUserText, setLastUserText] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasLoadedDraftRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!isSending) return;
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isSending]);

  // 誤ってタブを閉じても作業中の会話を失わないよう、下書きを復元・保存する。
  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as Partial<PersistedDraft>;
        if (Array.isArray(draft.messages)) setMessages(draft.messages);
        if (typeof draft.input === "string") setInput(draft.input);
        if (draft.outputFormat && OUTPUT_FORMATS.includes(draft.outputFormat)) {
          setOutputFormat(draft.outputFormat);
        }
        if (typeof draft.questionCountInput === "string") setQuestionCountInput(draft.questionCountInput);
        if (typeof draft.majorQuestionCountInput === "string") {
          setMajorQuestionCountInput(draft.majorQuestionCountInput);
        }
        if (draft.difficulty && DIFFICULTIES.includes(draft.difficulty)) setDifficulty(draft.difficulty);
        if (draft.questionType && QUESTION_TYPES.includes(draft.questionType)) setQuestionType(draft.questionType);
        if (typeof draft.separateAnswerSheet === "boolean") setSeparateAnswerSheet(draft.separateAnswerSheet);
        if (typeof draft.pageStart === "string") setPageStart(draft.pageStart);
        if (typeof draft.pageEnd === "string") setPageEnd(draft.pageEnd);
        if (typeof draft.includeGraphOrTableQuestion === "boolean") {
          setIncludeGraphOrTableQuestion(draft.includeGraphOrTableQuestion);
        }
        if (Array.isArray(draft.evaluationPerspectives)) {
          setEvaluationPerspectives(
            draft.evaluationPerspectives.filter((p): p is EvaluationPerspective =>
              EVALUATION_PERSPECTIVES.includes(p),
            ),
          );
        }

        const restoredHasAdvancedSettings =
          (!!draft.difficulty && draft.difficulty !== "auto") ||
          (!!draft.questionType && draft.questionType !== "auto") ||
          (typeof draft.pageStart === "string" && draft.pageStart.trim() !== "") ||
          (typeof draft.pageEnd === "string" && draft.pageEnd.trim() !== "") ||
          (Array.isArray(draft.evaluationPerspectives) && draft.evaluationPerspectives.length > 0) ||
          draft.includeGraphOrTableQuestion === true ||
          draft.separateAnswerSheet === true;
        if (restoredHasAdvancedSettings) setShowAdvancedSettings(true);

        const restoredHasAnySettings =
          restoredHasAdvancedSettings ||
          (!!draft.outputFormat && draft.outputFormat !== "google_doc") ||
          (typeof draft.majorQuestionCountInput === "string" && draft.majorQuestionCountInput.trim() !== "") ||
          (typeof draft.questionCountInput === "string" && draft.questionCountInput.trim() !== "");
        if (restoredHasAnySettings) setSettingsPanelOpen(true);
      }

      const rawPrompts = localStorage.getItem(CUSTOM_PROMPTS_STORAGE_KEY);
      if (rawPrompts) {
        const prompts: unknown = JSON.parse(rawPrompts);
        if (Array.isArray(prompts)) {
          setCustomPrompts(prompts.filter((p): p is string => typeof p === "string"));
        }
      }
    } catch {
      // 破損した保存データは無視する
    }
    hasLoadedDraftRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedDraftRef.current) return;
    const id = setTimeout(() => {
      try {
        const draft: PersistedDraft = {
          messages,
          input,
          outputFormat,
          questionCountInput,
          majorQuestionCountInput,
          difficulty,
          questionType,
          separateAnswerSheet,
          pageStart,
          pageEnd,
          includeGraphOrTableQuestion,
          evaluationPerspectives,
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // ストレージ容量超過などは無視する
      }
    }, 300);
    return () => clearTimeout(id);
  }, [
    messages,
    input,
    outputFormat,
    questionCountInput,
    majorQuestionCountInput,
    difficulty,
    questionType,
    separateAnswerSheet,
    pageStart,
    pageEnd,
    includeGraphOrTableQuestion,
    evaluationPerspectives,
  ]);

  useEffect(() => {
    if (!hasLoadedDraftRef.current) return;
    try {
      localStorage.setItem(CUSTOM_PROMPTS_STORAGE_KEY, JSON.stringify(customPrompts));
    } catch {
      // ストレージ容量超過などは無視する
    }
  }, [customPrompts]);

  // 生成中にタブを閉じて再試行が必要になるのを防ぐ。
  useEffect(() => {
    if (!isSending) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSending]);

  function updateLastAssistantMessage(update: (message: Message) => Message) {
    setMessages((current) => {
      const updated = [...current];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = update(last);
      return updated;
    });
  }

  function toggleEvaluationPerspective(perspective: EvaluationPerspective) {
    setEvaluationPerspectives((prev) =>
      prev.includes(perspective) ? prev.filter((p) => p !== perspective) : [...prev, perspective],
    );
  }

  function parsePositiveInt(value: string): number | null {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function parsedPageRange(): { start: number; end: number } | null {
    const start = Number.parseInt(pageStart, 10);
    const end = Number.parseInt(pageEnd, 10);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0 || end < start) {
      return null;
    }
    return { start, end };
  }

  function buildSettingsSummary(): string | undefined {
    const parts: string[] = [];
    const majorQuestionCount = parsePositiveInt(majorQuestionCountInput);
    if (majorQuestionCount) parts.push(`大問${majorQuestionCount}つ`);
    const questionCount = parsePositiveInt(questionCountInput);
    if (questionCount) parts.push(`${questionCount}問`);
    if (difficulty !== "auto") parts.push(DIFFICULTY_LABELS[difficulty]);
    if (questionType !== "auto") parts.push(QUESTION_TYPE_LABELS[questionType]);
    if (separateAnswerSheet) parts.push("解答別紙");
    const pageRange = parsedPageRange();
    if (pageRange) parts.push(`${pageRange.start}〜${pageRange.end}ページ`);
    for (const perspective of evaluationPerspectives) parts.push(EVALUATION_PERSPECTIVE_LABELS[perspective]);
    if (includeGraphOrTableQuestion) parts.push("グラフ/表問題");
    return parts.length > 0 ? parts.join(" ・ ") : undefined;
  }

  function buildComposerSummary(): string {
    return [OUTPUT_FORMAT_LABELS[outputFormat], buildSettingsSummary()].filter(Boolean).join(" ・ ");
  }

  async function sendMessage(text: string) {
    setError(null);
    setLastUserText(text);
    const settingsSummary = buildSettingsSummary();
    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: text, statuses: [], settingsSummary },
    ];
    setMessages([...nextMessages, { role: "assistant", content: "", statuses: [] }]);
    setInput("");
    setIsSending(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let hadError = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          outputFormat,
          materialOptions: {
            questionCount: parsePositiveInt(questionCountInput),
            majorQuestionCount: parsePositiveInt(majorQuestionCountInput),
            difficulty,
            questionType,
            separateAnswerSheet,
            pageRange: parsedPageRange(),
            includeGraphOrTableQuestion,
            evaluationPerspectives,
          },
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || "リクエストに失敗しました。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: ChatStreamEvent;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "delta") {
            updateLastAssistantMessage((m) => ({
              ...m,
              content: m.content + event.text,
            }));
          } else if (event.type === "status") {
            updateLastAssistantMessage((m) => ({
              ...m,
              statuses: [...m.statuses, event.text],
            }));
          } else if (event.type === "error") {
            hadError = true;
            setError(event.text);
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        updateLastAssistantMessage((m) => ({
          ...m,
          statuses: [...m.statuses, "生成を中止しました。"],
        }));
      } else {
        hadError = true;
        setError(err instanceof Error ? err.message : "エラーが発生しました。");
      }
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
      if (!hadError) onMaterialCreated?.();
    }
  }

  function handleRetry() {
    if (!lastUserText || isSending) return;
    void sendMessage(lastUserText);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;
    void sendMessage(text);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const text = input.trim();
      if (!text || isSending) return;
      void sendMessage(text);
    }
  }

  function handleReset() {
    setMessages([]);
    setError(null);
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
  }

  function handleSaveCustomPrompt() {
    const text = input.trim();
    if (!text || customPrompts.includes(text)) return;
    setCustomPrompts((prev) => [text, ...prev].slice(0, MAX_CUSTOM_PROMPTS));
  }

  function handleRemoveCustomPrompt(prompt: string) {
    setCustomPrompts((prev) => prev.filter((p) => p !== prompt));
  }

  return (
    <section className="card flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg font-bold text-black dark:text-zinc-50">
          教材作成チャット
        </h2>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isSending}
            className="text-xs text-zinc-500 underline decoration-dotted hover:text-accent disabled:opacity-50 dark:text-zinc-400"
          >
            新しい会話を始める
          </button>
        )}
      </div>

      <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto lg:max-h-[36rem]">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            {customPrompts.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">よく使う指示</p>
                {customPrompts.map((prompt) => (
                  <div key={prompt} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {prompt}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomPrompt(prompt)}
                      aria-label="よく使う指示から削除"
                      className="shrink-0 text-zinc-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              作成したい教材の内容を指示してください。例えば、こんな指示から試せます。
            </p>
            <div className="flex flex-col gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-left text-sm text-accent transition-colors hover:brightness-95"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "flex max-w-full items-end justify-end gap-2 self-end"
                : "flex max-w-full items-start gap-2 self-start"
            }
          >
            {message.role === "assistant" && <Avatar role="assistant" />}
            <div className="flex min-w-0 flex-col gap-1">
              {message.role === "assistant" && message.statuses.length > 0 && (
                <ul className="flex flex-col gap-0.5 pl-1 text-xs text-zinc-400 dark:text-zinc-500">
                  {message.statuses.map((status, statusIndex) => (
                    <li key={statusIndex}>{status}</li>
                  ))}
                </ul>
              )}
              {message.role === "user" && (
                <>
                  {message.settingsSummary && (
                    <span className="self-end text-xs text-zinc-400 dark:text-zinc-500">
                      {message.settingsSummary}
                    </span>
                  )}
                  <div className="rounded-2xl bg-accent px-4 py-2 text-sm break-words text-accent-foreground">
                    {message.content}
                  </div>
                </>
              )}
              {message.role === "assistant" && message.content && (
                <>
                  <div className="break-words rounded-2xl bg-zinc-100 px-4 py-2 dark:bg-zinc-900">
                    <MarkdownMessage text={message.content} />
                  </div>
                  {!isSending && <CopyButton text={message.content} />}
                </>
              )}
              {message.role === "assistant" &&
                !message.content &&
                message.statuses.length === 0 &&
                isSending &&
                index === messages.length - 1 && (
                  <div className="rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500">
                    …
                  </div>
                )}
            </div>
            {message.role === "user" && <Avatar role="user" />}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {isSending && (
        <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
          <span>作成中… {elapsedSeconds}秒経過</span>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-full border border-accent/40 px-2 py-0.5 font-medium hover:bg-accent/10"
          >
            中止
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <p>{error}</p>
          {lastUserText && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isSending}
              className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-900"
            >
              再試行
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setSettingsPanelOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                出題設定
              </span>
              <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                {buildComposerSummary()}
              </span>
            </span>
            <span className="shrink-0 text-xs font-medium text-accent">
              {settingsPanelOpen ? "閉じる ▲" : "編集する ▼"}
            </span>
          </button>

          {settingsPanelOpen && (
            <div className="flex flex-col gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-sm text-zinc-600 dark:text-zinc-400">出力形式</span>
                <SegmentedControl
                  options={OUTPUT_FORMATS.map((format) => ({ value: format, label: OUTPUT_FORMAT_LABELS[format] }))}
                  value={outputFormat}
                  onChange={setOutputFormat}
                  disabled={isSending}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-sm text-zinc-600 dark:text-zinc-400">大問数</span>
                <NumberChipInput
                  presets={MAJOR_QUESTION_COUNT_PRESETS}
                  value={majorQuestionCountInput}
                  onChange={setMajorQuestionCountInput}
                  disabled={isSending}
                  unit=""
                  label="大問数"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-sm text-zinc-600 dark:text-zinc-400">問題数</span>
                <NumberChipInput
                  presets={QUESTION_COUNT_PRESETS}
                  value={questionCountInput}
                  onChange={setQuestionCountInput}
                  disabled={isSending}
                  unit="問"
                  label="問題数"
                />
              </div>

              <div className="flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings((v) => !v)}
                  className="self-start text-xs text-accent underline decoration-dotted"
                >
                  {showAdvancedSettings
                    ? "詳細設定を隠す"
                    : "詳細設定を表示（難易度・出題形式・参照ページ・観点別評価など）"}
                </button>

                {showAdvancedSettings && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-20 shrink-0 text-sm text-zinc-600 dark:text-zinc-400">難易度</span>
                      <SegmentedControl
                        options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
                        value={difficulty}
                        onChange={setDifficulty}
                        disabled={isSending}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-20 shrink-0 text-sm text-zinc-600 dark:text-zinc-400">出題形式</span>
                      <SegmentedControl
                        options={QUESTION_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] }))}
                        value={questionType}
                        onChange={setQuestionType}
                        disabled={isSending}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-20 shrink-0 text-sm text-zinc-600 dark:text-zinc-400">参照ページ</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={pageStart}
                          onChange={(e) => setPageStart(e.target.value)}
                          disabled={isSending}
                          placeholder="開始"
                          aria-label="参照ページ範囲の開始ページ"
                          className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">〜</span>
                        <input
                          type="number"
                          min={1}
                          value={pageEnd}
                          onChange={(e) => setPageEnd(e.target.value)}
                          disabled={isSending}
                          placeholder="終了"
                          aria-label="参照ページ範囲の終了ページ"
                          className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">ページ</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="w-20 shrink-0 pt-1 text-sm text-zinc-600 dark:text-zinc-400">観点別評価</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {EVALUATION_PERSPECTIVES.map((perspective) => (
                          <label
                            key={perspective}
                            className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400"
                          >
                            <input
                              type="checkbox"
                              checked={evaluationPerspectives.includes(perspective)}
                              onChange={() => toggleEvaluationPerspective(perspective)}
                              disabled={isSending}
                              className="h-4 w-4 rounded border border-zinc-300 bg-white accent-accent dark:border-zinc-600 dark:bg-zinc-900"
                            />
                            {EVALUATION_PERSPECTIVE_LABELS[perspective]}
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <input
                        type="checkbox"
                        checked={includeGraphOrTableQuestion}
                        onChange={(e) => setIncludeGraphOrTableQuestion(e.target.checked)}
                        disabled={isSending}
                        className="h-4 w-4 rounded border border-zinc-300 bg-white accent-accent dark:border-zinc-600 dark:bg-zinc-900"
                      />
                      グラフ・表を用いた思考力・判断力・表現力を問う問題を含める
                    </label>
                    {outputFormat !== "google_form" && (
                      <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <input
                          type="checkbox"
                          checked={separateAnswerSheet}
                          onChange={(e) => setSeparateAnswerSheet(e.target.checked)}
                          disabled={isSending}
                          className="h-4 w-4 rounded border border-zinc-300 bg-white accent-accent dark:border-zinc-600 dark:bg-zinc-900"
                        />
                        解答・解説を別紙にする（問題と解答を改ページで分ける）
                      </label>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
          rows={3}
          placeholder="作成したい教材の内容を指示してください（Enterで送信、Shift+Enterで改行）"
          className="resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        />

        <div className="flex items-center justify-between gap-2">
          {input.trim() && !customPrompts.includes(input.trim()) ? (
            <button
              type="button"
              onClick={handleSaveCustomPrompt}
              className="text-xs text-zinc-500 underline decoration-dotted hover:text-accent dark:text-zinc-400"
            >
              この指示をよく使う指示として保存
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {isSending ? "作成中…" : "送信"}
          </button>
        </div>
      </form>
    </section>
  );
}
