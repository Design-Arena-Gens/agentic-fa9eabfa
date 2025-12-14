"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

type GmailMessage = {
  id: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  date?: string;
  bodyText: string;
  bodyHtml?: string;
};

type DraftState = {
  reply: string;
  autoSend: boolean;
  reasoning: string;
  subject: string;
};

const REFRESH_INTERVAL_MS = 60_000;

function extractEmailAddress(input: string): string {
  const match = input.match(/<([^>]+)>/);
  if (match) {
    return match[1];
  }
  return input.trim();
}

function formatDateLabel(date?: string) {
  if (!date) return "Unknown";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return `${formatDistanceToNow(parsed, { addSuffix: true })}`;
}

export default function Home() {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [draftIsLoading, setDraftIsLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [autoReplyStatus, setAutoReplyStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoReplyRunning, setAutoReplyRunning] = useState(false);

  const selectedMessage = useMemo(() => {
    if (!messages.length) return null;
    const fallback = messages[0];
    return messages.find((msg) => msg.id === selectedId) ?? fallback;
  }, [messages, selectedId]);

  const fetchMailbox = useCallback(async (showSpinner = true) => {
    try {
      if (showSpinner) {
        setIsLoading(true);
      }
      setError(null);
      const response = await fetch("/api/mailbox");
      if (!response.ok) {
        throw new Error("Mailbox request failed");
      }
      const data = await response.json();
      setMessages(data.messages ?? []);
      if (!selectedId && data.messages?.length) {
        setSelectedId(data.messages[0].id);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError("Unable to load inbox. Check API credentials.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchMailbox();
    const interval = setInterval(() => {
      fetchMailbox(false);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchMailbox]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setDraft(null);
    setDraftError(null);
  };

  const generateDraft = async () => {
    if (!selectedMessage) return;
    setDraftIsLoading(true);
    setDraftError(null);
    setAutoReplyStatus(null);

    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageId: selectedMessage.id,
          threadId: selectedMessage.threadId,
          subject: selectedMessage.subject,
          from: selectedMessage.from,
          bodyText: selectedMessage.bodyText || selectedMessage.snippet,
        }),
      });

      if (!response.ok) {
        throw new Error("Draft generation failed");
      }

      const data = await response.json();
      setDraft({
        reply: data.draft.reply,
        autoSend: Boolean(data.draft.autoSend),
        reasoning: data.draft.reasoning,
        subject: data.recommendedSubject ?? selectedMessage.subject,
      });
    } catch (err) {
      console.error(err);
      setDraftError("Failed to generate reply. See server logs.");
    } finally {
      setDraftIsLoading(false);
    }
  };

  const sendDraft = async (reply: string, subjectOverride?: string) => {
    if (!selectedMessage || !reply.trim()) {
      return;
    }
    setIsSending(true);
    setDraftError(null);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: extractEmailAddress(selectedMessage.from),
          body: reply,
          threadId: selectedMessage.threadId,
          messageId: selectedMessage.id,
          inReplyTo: selectedMessage.messageId,
          subject: subjectOverride ?? selectedMessage.subject,
        }),
      });

      if (!response.ok) {
        throw new Error("Send failed");
      }

      setAutoReplyStatus("Reply sent");
      await fetchMailbox(false);
    } catch (err) {
      console.error(err);
      setDraftError("Failed to send reply. Inspect server logs.");
    } finally {
      setIsSending(false);
    }
  };

  const handleAutoReply = async () => {
    if (!messages.length) return;
    setAutoReplyRunning(true);
    setAutoReplyStatus("Running auto-reply on latest messages...");

    let sent = 0;
    let skipped = 0;

    for (const message of messages) {
      try {
        const draftResponse = await fetch("/api/draft", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messageId: message.id,
            threadId: message.threadId,
            subject: message.subject,
            from: message.from,
            bodyText: message.bodyText || message.snippet,
          }),
        });

        if (!draftResponse.ok) {
          throw new Error("Draft request failed");
        }

        const { draft: autoDraft, recommendedSubject } = await draftResponse.json();

        if (autoDraft.autoSend && autoDraft.reply.trim().length > 0) {
          const sendResponse = await fetch("/api/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: extractEmailAddress(message.from),
              body: autoDraft.reply,
              threadId: message.threadId,
              messageId: message.id,
              inReplyTo: message.messageId,
              subject: recommendedSubject ?? message.subject,
            }),
          });

          if (!sendResponse.ok) {
            throw new Error("Auto send failed");
          }
          sent += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        console.error("Auto reply failure", err);
        skipped += 1;
      }
    }

    setAutoReplyStatus(
      sent
        ? `Auto reply complete: ${sent} sent, ${skipped} held for review.`
        : "Auto reply complete: no messages qualified for auto-send."
    );
    setAutoReplyRunning(false);
    await fetchMailbox(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <header className="border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Inbox Agent</h1>
            <p className="text-sm text-slate-400">
              Monitor, draft, and auto-reply to your Gmail inbox.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            {lastUpdated && (
              <span>
                Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchMailbox()}
              className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-white/40 hover:bg-white/10"
              disabled={isLoading}
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={handleAutoReply}
              className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={autoReplyRunning || isLoading}
            >
              {autoReplyRunning ? "Auto replying..." : "Auto Reply Basic"}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-4 w-full max-w-6xl rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {autoReplyStatus && (
        <div className="mx-auto mt-4 w-full max-w-6xl rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {autoReplyStatus}
        </div>
      )}

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 divide-y divide-white/10 border-x border-white/10 bg-slate-950 md:grid-cols-[320px_minmax(0,1fr)] md:divide-x md:divide-y-0">
        <section className="flex flex-col">
          <div className="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
            Inbox
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading && !messages.length ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Loading inbox...
              </div>
            ) : messages.length ? (
              <ul>
                {messages.map((message) => (
                  <li key={message.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(message.id)}
                      className={`flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/5 ${
                        selectedMessage?.id === message.id ? "bg-white/10" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between text-sm font-medium text-slate-100">
                        <span className="truncate">{message.subject || "(No subject)"}</span>
                        <span className="ml-2 shrink-0 text-xs text-slate-400">
                          {formatDateLabel(message.date)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {message.from}
                      </div>
                      <p className="line-clamp-2 text-xs text-slate-500">
                        {message.snippet || message.bodyText.slice(0, 120)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Inbox empty.
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col">
          {selectedMessage ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-white/10 px-6 py-5">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  From
                </p>
                <p className="text-sm font-medium text-slate-100">
                  {selectedMessage.from}
                </p>
                <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">
                  Subject
                </p>
                <h2 className="text-lg font-semibold text-white">
                  {selectedMessage.subject || "(No subject)"}
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-200">
                {selectedMessage.bodyText ? (
                  <pre className="whitespace-pre-wrap font-sans">
                    {selectedMessage.bodyText}
                  </pre>
                ) : (
                  <p className="text-slate-400">No body content available.</p>
                )}
              </div>

              <div className="border-t border-white/10 bg-slate-900 px-6 py-5">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>
                      Replying to {extractEmailAddress(selectedMessage.from)}
                    </span>
                    {draft?.autoSend && (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-200">
                        Auto-send ready
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={generateDraft}
                      className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={draftIsLoading}
                    >
                      {draftIsLoading ? "Generating draft..." : "Generate Draft"}
                    </button>
                    <button
                      type="button"
                      onClick={() => draft && sendDraft(draft.reply, draft.subject)}
                      className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={!draft || isSending}
                    >
                      {isSending ? "Sending..." : "Send Reply"}
                    </button>
                  </div>

                  {draft?.reasoning && (
                    <p className="text-xs text-slate-400">
                      Assistant: {draft.reasoning}
                    </p>
                  )}

                  {draftError && (
                    <p className="text-xs text-red-300">{draftError}</p>
                  )}

                  {draft && (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-300">
                        Draft reply
                      </label>
                      <textarea
                        className="min-h-[160px] w-full rounded-md border border-white/10 bg-slate-950 p-3 text-sm text-slate-50 shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        value={draft.reply}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  reply: event.target.value,
                                }
                              : null
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Select an email to begin.
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-white/10 bg-slate-950/80 px-6 py-4 text-center text-xs text-slate-500">
        Agent runs locally every minute. Configure Gmail + OpenAI credentials in environment variables before deploying.
      </footer>
    </div>
  );
}
