import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, FileText, Globe, Paperclip, Square, X } from 'lucide-react';
import type { Attachment, ReasoningDepth } from '../types/chat';

interface ChatComposerProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  isGenerating: boolean;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  depth: ReasoningDepth;
  onChangeDepth: (depth: ReasoningDepth) => void;
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'html',
  'css',
  'xml',
  'yaml',
  'yml',
  'sql',
  'sh',
  'log',
]);

function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  if (file.type === 'application/json') return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTENSIONS.has(ext);
}

function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (isTextFile(file)) {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id,
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          textContent: String(reader.result ?? ''),
          isText: true,
        });
      };
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsText(file);
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? '');
        const base64 = dataUrl.split(',')[1] ?? '';
        resolve({
          id,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          data: base64,
          previewUrl: dataUrl,
          isText: false,
        });
      };
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
      return;
    }

    reject(new Error(`Unsupported file type: ${file.name}. Attach images or text/code files.`));
  });
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  onStop,
  isGenerating,
  webSearch,
  onToggleWebSearch,
  depth,
  onChangeDepth,
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setFileError(null);

    const incoming = Array.from(fileList);
    if (attachments.length + incoming.length > MAX_ATTACHMENTS) {
      setFileError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }

    const next: Attachment[] = [];
    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFileError(`${file.name} exceeds the 8 MB size limit.`);
        continue;
      }
      try {
        const att = await readFileAsAttachment(file);
        next.push(att);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'Failed to attach file.');
      }
    }

    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
    }
  };

  const handleSubmit = () => {
    if (isGenerating) return;
    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments);
    setInput('');
    setAttachments([]);
    setFileError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const canSubmit = (input.trim().length > 0 || attachments.length > 0) && !isGenerating;

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-3 pt-1">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-2xl border transition-colors bg-white dark:bg-[#11161D] ${
          isDragging
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-800 focus-within:border-slate-400 dark:focus-within:border-slate-600'
        }`}
      >
        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3.5 pt-3">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F14] p-1.5 pr-7"
              >
                {att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded bg-slate-200/70 dark:bg-slate-800 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                )}
                <span className="text-xs text-slate-700 dark:text-slate-300 max-w-[140px] truncate">
                  {att.name}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((item) => item.id !== att.id))
                  }
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                  aria-label={`Remove ${att.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {fileError && (
          <div className="px-4 pt-2.5 text-xs text-red-600 dark:text-red-400">
            {fileError}
          </div>
        )}

        {/* Textarea */}
        <div className="px-4 pt-3 pb-1.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Message Shoaib..."
            rows={1}
            aria-label="Message Shoaib"
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none max-h-[180px]"
          />
        </div>

        {/* Bottom Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.sql,.sh,.log"
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Attach image or text file"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Attach</span>
            </button>

            <button
              type="button"
              onClick={onToggleWebSearch}
              aria-pressed={webSearch}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                webSearch
                  ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/80'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
              }`}
              title="Automatically search the web for accurate answers"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Auto Search</span>
            </button>

            {/* Reasoning Depth Segmented Control */}
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#171E27]"
              role="group"
              aria-label="Response depth"
            >
              {(['fast', 'balanced', 'deep'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => onChangeDepth(level)}
                  className={`px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    depth === level
                      ? 'bg-white dark:bg-[#0B0F14] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white transition-colors cursor-pointer"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
                aria-label="Send message"
                title="Send message"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
        Shoaib verifies facts with live search when enabled. Verify critical details independently.
      </p>
    </div>
  );
};
