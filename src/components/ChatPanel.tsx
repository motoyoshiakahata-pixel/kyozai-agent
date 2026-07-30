"use client";

import { useState, useRef, type FormEvent } from "react";
import { OUTPUT_FORMAT_LABELS, type OutputFormat } from "@/lib/prompts";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const OUTPUT_FORMATS = Object.keys(OUTPUT_FORMAT_LABELS) as OutputFormat[];

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("google_doc");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;

    setError(null);
    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setIsSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, outputFormat }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || "リクエストに失敗しました。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((current) => {
          const updated = [...current];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + chunk,
          };
          return updated;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました。");
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
        教材作成チャット
      </h2>

      <div className="flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            例：「現代社会の過去問を参考に、公共の『政治参加と選挙』の単元で選択式の小テストを10問作成してください」
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "self-end rounded-2xl bg-foreground px-4 py-2 text-sm text-background"
                : "self-start whitespace-pre-wrap rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
            }
          >
            {message.content || (isSending && index === messages.length - 1 ? "…" : "")}
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="output-format" className="text-sm text-zinc-600 dark:text-zinc-400">
            出力形式
          </label>
          <select
            id="output-format"
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {OUTPUT_FORMATS.map((format) => (
              <option key={format} value={format}>
                {OUTPUT_FORMAT_LABELS[format]}
              </option>
            ))}
          </select>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="作成したい教材の内容を指示してください"
          className="resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />

        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="self-end rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isSending ? "作成中…" : "送信"}
        </button>
      </form>
    </section>
  );
}
