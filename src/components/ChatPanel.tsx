"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  DIFFICULTY_LABELS,
  OUTPUT_FORMAT_LABELS,
  QUESTION_TYPE_LABELS,
  type Difficulty,
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

type QuestionCountOption = "auto" | "5" | "10" | "15" | "20";

const QUESTION_COUNT_OPTIONS: { value: QuestionCountOption; label: string }[] = [
  { value: "auto", label: "お任せ" },
  { value: "5", label: "5問" },
  { value: "10", label: "10問" },
  { value: "15", label: "15問" },
  { value: "20", label: "20問" },
];

const QUICK_PROMPTS = [
  "現代社会の過去問を参考に、公共の「政治参加と選挙」の単元で選択式の小テストを10問作成してください",
  "「経済社会と私たちの生活」の単元で、記述式の練習問題を5問作成してください",
  "直近の共通テストの傾向を踏まえて、公共の総復習プリントを作成してください",
];

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

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function renderWithLinks(text: string) {
  const parts = text.split(URL_PATTERN);
  return parts.map((part, index) =>
    URL_PATTERN.test(part) ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline decoration-dotted hover:opacity-80"
      >
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
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
  const [questionCountOption, setQuestionCountOption] = useState<QuestionCountOption>("auto");
  const [difficulty, setDifficulty] = useState<Difficulty>("auto");
  const [questionType, setQuestionType] = useState<QuestionType>("auto");
  const [separateAnswerSheet, setSeparateAnswerSheet] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUserText, setLastUserText] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  function updateLastAssistantMessage(update: (message: Message) => Message) {
    setMessages((current) => {
      const updated = [...current];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = update(last);
      return updated;
    });
  }

  function buildSettingsSummary(): string | undefined {
    const parts: string[] = [];
    if (questionCountOption !== "auto") parts.push(`${questionCountOption}問`);
    if (difficulty !== "auto") parts.push(DIFFICULTY_LABELS[difficulty]);
    if (questionType !== "auto") parts.push(QUESTION_TYPE_LABELS[questionType]);
    if (separateAnswerSheet) parts.push("解答別紙");
    return parts.length > 0 ? parts.join(" ・ ") : undefined;
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
            questionCount: questionCountOption === "auto" ? null : Number(questionCountOption),
            difficulty,
            questionType,
            separateAnswerSheet,
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

      <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
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
                ? "flex items-end justify-end gap-2 self-end"
                : "flex items-start gap-2 self-start"
            }
          >
            {message.role === "assistant" && <Avatar role="assistant" />}
            <div className="flex flex-col gap-1">
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
                  <div className="rounded-2xl bg-accent px-4 py-2 text-sm text-accent-foreground">
                    {message.content}
                  </div>
                </>
              )}
              {message.role === "assistant" && message.content && (
                <>
                  <div className="whitespace-pre-wrap rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                    {renderWithLinks(message.content)}
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
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            出題設定（任意）
          </span>
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
            <span className="w-20 shrink-0 text-sm text-zinc-600 dark:text-zinc-400">問題数</span>
            <SegmentedControl
              options={QUESTION_COUNT_OPTIONS}
              value={questionCountOption}
              onChange={setQuestionCountOption}
              disabled={isSending}
            />
          </div>
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
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={separateAnswerSheet}
              onChange={(e) => setSeparateAnswerSheet(e.target.checked)}
              disabled={isSending}
              className="h-4 w-4 accent-accent"
            />
            解答・解説を別紙にする（問題と解答を改ページで分ける）
          </label>
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

        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="self-end rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {isSending ? "作成中…" : "送信"}
        </button>
      </form>
    </section>
  );
}
