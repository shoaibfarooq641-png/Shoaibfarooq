import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import type { ChatMessage } from '../types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ShoaibMark } from './ShoaibMark';

interface MessageItemProps {
  message: ChatMessage;
  isLatestAssistant: boolean;
  isGenerating: boolean;
  onRegenerate: () => void;
  onEditMessage: (messageId: string, newContent: string) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isLatestAssistant,
  isGenerating,
  onRegenerate,
  onEditMessage,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [showAllSources, setShowAllSources] = useState(false);

  const handleCopy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleSaveEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setIsEditing(false);
    onEditMessage(message.id, trimmed);
  };

  if (message.role === 'user') {
    return (
      <div className="group flex flex-col items-end">
        <div className="max-w-[88%] sm:max-w-[78%] w-fit">
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2 mb-2">
              {message.attachments.map((att) =>
                att.previewUrl ? (
                  <img
                    key={att.id}
                    src={att.previewUrl}
                    alt={att.name}
                    referrerPolicy="no-referrer"
                    className="max-h-48 max-w-[240px] rounded-lg object-cover border border-slate-200 dark:border-slate-800"
                  />
                ) : (
                  <div
                    key={att.id}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131A23] text-xs text-slate-700 dark:text-slate-300"
                  >
                    <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span className="truncate max-w-[180px]">{att.name}</span>
                  </div>
                )
              )}
            </div>
          )}

          {isEditing ? (
            <div className="w-full min-w-[260px] sm:min-w-[380px] rounded-xl border border-teal-500/60 bg-white dark:bg-[#11161D] p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                  if (e.key === 'Escape') {
                    setDraft(message.content);
                    setIsEditing(false);
                  }
                }}
                className="w-full resize-none bg-transparent text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(message.content);
                    setIsEditing(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={!draft.trim() || isGenerating}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Save & Send
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl px-4 py-3 bg-slate-100 dark:bg-[#171E27] border border-slate-200/80 dark:border-slate-800/80 text-slate-900 dark:text-slate-100 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <span className="tabular-nums">{formatTime(message.createdAt)}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              aria-label="Copy prompt"
              title="Copy"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {!isGenerating && (
              <button
                type="button"
                onClick={() => {
                  setDraft(message.content);
                  setIsEditing(true);
                }}
                className="p-1 rounded hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                aria-label="Edit message"
                title="Edit & resend"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const sources = message.sources ?? [];
  const visibleSources = showAllSources ? sources : sources.slice(0, 4);

  return (
    <div className="flex items-start gap-3.5 sm:gap-4">
      <div className="shrink-0 mt-0.5">
        <ShoaibMark className="w-7 h-7" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Clean Header Metadata (Zero Pills) */}
        <div className="flex items-center gap-2 mb-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-display font-semibold text-sm text-slate-900 dark:text-white">
            Shoaib
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatTime(message.createdAt)}</span>
          {message.webSearchUsed && (
            <>
              <span aria-hidden="true">·</span>
              <span>Auto search</span>
            </>
          )}
          {message.depth && message.depth !== 'fast' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{message.depth}</span>
            </>
          )}
        </div>

        {/* Body / Streaming / Error */}
        {message.isStreaming && !message.content ? (
          <div className="py-2 text-sm text-slate-500 dark:text-slate-400">
            {message.webSearchUsed
              ? 'Searching & answering...'
              : 'Answering...'}
          </div>
        ) : message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : null}

        {message.error && (
          <div className="mt-2 p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 text-sm text-red-800 dark:text-red-300 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{message.error}</span>
            </div>
            {isLatestAssistant && !isGenerating && (
              <button
                type="button"
                onClick={onRegenerate}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {/* Grounded Sources */}
        {!message.isStreaming && sources.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-xs text-slate-500 dark:text-slate-400 min-w-0">
                <span className="font-medium">Sources ({sources.length})</span>
                {message.searchQueries && message.searchQueries.length > 0 && (
                  <span className="ml-2 text-slate-400 dark:text-slate-500">
                    · Searched: {message.searchQueries.slice(0, 2).join(', ')}
                  </span>
                )}
              </div>
              {sources.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllSources((prev) => !prev)}
                  className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer shrink-0"
                >
                  {showAllSources ? 'Show fewer' : `Show all ${sources.length}`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {visibleSources.map((source, idx) => (
                <a
                  key={source.uri}
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#11161D] hover:border-teal-500/60 dark:hover:border-teal-500/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate group-hover:text-teal-700 dark:group-hover:text-teal-300">
                      <span className="tabular-nums text-slate-400 dark:text-slate-500 mr-1.5">
                        {idx + 1}.
                      </span>
                      {source.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {source.domain}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 shrink-0 mt-0.5" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Message Actions */}
        {!message.isStreaming && message.content && (
          <div className="mt-2.5 flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {isLatestAssistant && !isGenerating && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Regenerate</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
