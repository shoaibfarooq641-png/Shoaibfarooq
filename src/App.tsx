import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Moon, PanelLeftOpen, Plus, Sun } from 'lucide-react';
import { ChatComposer } from './components/ChatComposer';
import { EmptyState } from './components/EmptyState';
import { MessageItem } from './components/MessageItem';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ShoaibMark } from './components/ShoaibMark';
import { Sidebar } from './components/Sidebar';
import type {
  Attachment,
  ChatMessage,
  Conversation,
  GroundingSource,
  ReasoningDepth,
} from './types/chat';

const STORAGE_KEY = 'shoaib_conversations_v1';
const THEME_KEY = 'shoaib_theme';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadStoredConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((conv) => ({
      ...conv,
      messages: Array.isArray(conv.messages)
        ? conv.messages.map((m: ChatMessage) => ({ ...m, isStreaming: false }))
        : [],
    }));
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // If quota exceeded due to large base64 attachments, strip raw attachment data from older messages
    try {
      const compact = conversations.map((c, idx) =>
        idx > 2
          ? {
              ...c,
              messages: c.messages.map((m) => ({
                ...m,
                attachments: m.attachments?.map((a) => ({
                  ...a,
                  data: undefined,
                  previewUrl: undefined,
                })),
              })),
            }
          : c
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore persistent storage errors
    }
  }
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadStoredConversations()
  );
  const [activeId, setActiveId] = useState<string | null>(() => {
    const loaded = loadStoredConversations();
    if (loaded.length === 0) return null;
    const latest = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return latest?.id ?? null;
  });

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  const [webSearch, setWebSearch] = useState(true);
  const [depth, setDepth] = useState<ReasoningDepth>('fast');
  const [isGenerating, setIsGenerating] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem(THEME_KEY, 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem(THEME_KEY, 'light');
      }
      return next;
    });
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (userScrolledUpRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    scrollToBottom('auto');
  }, [activeId, scrollToBottom]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 120;
  };

  const handleNewChat = useCallback(() => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
    setActiveId(null);
    userScrolledUpRef.current = false;
  }, [isGenerating]);

  const generateSmartTitle = async (conversationId: string, promptText: string) => {
    try {
      const res = await fetch('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { title?: string };
      if (data.title && data.title.trim()) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, title: data.title!.trim() } : c
          )
        );
      }
    } catch {
      // Keep fallback title
    }
  };

  const streamAssistantResponse = async (
    conversationId: string,
    historyForRequest: ChatMessage[],
    assistantMessageId: string,
    useWebSearch: boolean,
    selectedDepth: ReasoningDepth,
    isFirstTurn: boolean,
    firstPromptText: string
  ) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    userScrolledUpRef.current = false;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          webSearch: useWebSearch,
          depth: selectedDepth,
          messages: historyForRequest.map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments?.map((a) => ({
              name: a.name,
              mimeType: a.mimeType,
              data: a.data,
              textContent: a.textContent,
              isText: a.isText,
            })),
          })),
        }),
      });

      if (!res.ok) {
        let errText = `Server returned status ${res.status}`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) errText = json.error;
        } catch {
          // Ignore JSON parse failure
        }
        throw new Error(errText);
      }

      if (!res.body) {
        throw new Error('Streaming response body was empty.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let finalSources: GroundingSource[] = [];
      let finalQueries: string[] = [];

      const processFrame = (frame: string) => {
        const lines = frame.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payloadRaw = line.slice(6).trim();
          if (!payloadRaw) continue;

          let event: {
            type?: string;
            text?: string;
            sources?: GroundingSource[];
            searchQueries?: string[];
            error?: string;
          };
          try {
            event = JSON.parse(payloadRaw);
          } catch {
            continue;
          }

          if (event.type === 'chunk' && event.text) {
            accumulatedText += event.text;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      updatedAt: Date.now(),
                      messages: c.messages.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, content: accumulatedText }
                          : m
                      ),
                    }
                  : c
              )
            );
            scrollToBottom('auto');
          } else if (event.type === 'meta') {
            finalSources = event.sources ?? [];
            finalQueries = event.searchQueries ?? [];
          } else if (event.type === 'error') {
            throw new Error(event.error || 'An error occurred while generating a response.');
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            processFrame(buffer.replace(/\r\n/g, '\n'));
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          processFrame(frame);
        }
      }

      if (!accumulatedText.trim()) {
        throw new Error('Shoaib did not receive a response from the server. Please retry.');
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: accumulatedText,
                        sources: finalSources,
                        searchQueries: finalQueries,
                        isStreaming: false,
                      }
                    : m
                ),
              }
            : c
        )
      );

      if (isFirstTurn && firstPromptText.trim()) {
        void generateSmartTitle(conversationId, firstPromptText);
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        isStreaming: false,
                        error: isAbort
                          ? undefined
                          : err instanceof Error
                            ? err.message
                            : 'Failed to generate response.',
                      }
                    : m
                ),
              }
            : c
        )
      );
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  const handleSend = (text: string, attachments: Attachment[]) => {
    if (isGenerating) return;
    const now = Date.now();
    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content: text || (attachments.length > 0 ? 'Please analyze the attached file(s).' : ''),
      createdAt: now,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const assistantMessage: ChatMessage = {
      id: createId(),
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      webSearchUsed: webSearch,
      depth,
      isStreaming: true,
    };

    let targetConversationId = activeId;
    let updatedHistory: ChatMessage[] = [];
    let isFirstTurn = false;

    if (!targetConversationId || !activeConversation) {
      targetConversationId = createId();
      isFirstTurn = true;
      const initialTitle =
        userMessage.content.slice(0, 44) + (userMessage.content.length > 44 ? '…' : '');
      const newConversation: Conversation = {
        id: targetConversationId,
        title: initialTitle || 'New chat',
        createdAt: now,
        updatedAt: now,
        messages: [userMessage, assistantMessage],
      };
      updatedHistory = [userMessage];
      setConversations((prev) => [newConversation, ...prev]);
      setActiveId(targetConversationId);
    } else {
      updatedHistory = [...activeConversation.messages, userMessage];
      isFirstTurn = activeConversation.messages.length === 0;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetConversationId
            ? {
                ...c,
                updatedAt: now,
                messages: [...c.messages, userMessage, assistantMessage],
              }
            : c
        )
      );
    }

    setTimeout(() => scrollToBottom('smooth'), 30);

    void streamAssistantResponse(
      targetConversationId,
      updatedHistory,
      assistantMessage.id,
      webSearch,
      depth,
      isFirstTurn,
      userMessage.content
    );
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleRegenerate = () => {
    if (!activeConversation || isGenerating) return;
    const messages = activeConversation.messages;
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    const historyWithoutLast =
      lastMsg.role === 'assistant' ? messages.slice(0, -1) : messages;

    if (historyWithoutLast.length === 0) return;

    const newAssistantId = createId();
    const newAssistant: ChatMessage = {
      id: newAssistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      webSearchUsed: webSearch,
      depth,
      isStreaming: true,
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? {
              ...c,
              updatedAt: Date.now(),
              messages: [...historyWithoutLast, newAssistant],
            }
          : c
      )
    );

    void streamAssistantResponse(
      activeConversation.id,
      historyWithoutLast,
      newAssistantId,
      webSearch,
      depth,
      false,
      ''
    );
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    if (!activeConversation || isGenerating) return;
    const idx = activeConversation.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    const target = activeConversation.messages[idx];
    const updatedUserMsg: ChatMessage = {
      ...target,
      content: newContent,
      createdAt: Date.now(),
    };
    const truncatedHistory = [...activeConversation.messages.slice(0, idx), updatedUserMsg];

    const newAssistantId = createId();
    const newAssistant: ChatMessage = {
      id: newAssistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now() + 1,
      webSearchUsed: webSearch,
      depth,
      isStreaming: true,
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? {
              ...c,
              updatedAt: Date.now(),
              messages: [...truncatedHistory, newAssistant],
            }
          : c
      )
    );

    void streamAssistantResponse(
      activeConversation.id,
      truncatedHistory,
      newAssistantId,
      webSearch,
      depth,
      idx === 0,
      newContent
    );
  };

  const handleRenameConversation = (id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (activeId === id) {
        const nextLatest = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        setActiveId(nextLatest?.id ?? null);
      }
      return remaining;
    });
  };

  const handleClearAll = () => {
    if (isGenerating) abortControllerRef.current?.abort();
    setConversations([]);
    setActiveId(null);
  };

  const latestAssistantId = useMemo(() => {
    if (!activeConversation) return null;
    for (let i = activeConversation.messages.length - 1; i >= 0; i--) {
      if (activeConversation.messages[i].role === 'assistant') {
        return activeConversation.messages[i].id;
      }
    }
    return null;
  }, [activeConversation]);

  return (
    <div className="h-dvh w-full flex overflow-hidden bg-white dark:bg-[#0B0F14] text-slate-900 dark:text-slate-100">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        onCollapseDesktop={() => setSidebarOpen(false)}
        onSelectConversation={(id) => {
          if (isGenerating) abortControllerRef.current?.abort();
          setActiveId(id);
          userScrolledUpRef.current = false;
        }}
        onNewChat={handleNewChat}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onClearAll={handleClearAll}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top Header */}
        <header className="h-14 shrink-0 px-3 sm:px-5 flex items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-[#0B0F14]/95 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-2 min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Open sidebar"
                title="Open sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer group"
            >
              <ShoaibMark className="w-6 h-6" />
              <span className="font-display font-bold text-[17px] tracking-tight text-slate-900 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                Shoaib
              </span>
            </button>

            {activeConversation && (
              <>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
                  /
                </span>
                <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-400 truncate max-w-[320px]">
                  {activeConversation.title}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11161D] text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>
          </div>
        </header>

        {/* Chat Scroll Viewport */}
        <main
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto flex flex-col"
        >
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <EmptyState onSelectPrompt={(prompt) => handleSend(prompt, [])} />
          ) : (
            <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-7 flex-1">
              {activeConversation.messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isLatestAssistant={message.id === latestAssistantId}
                  isGenerating={isGenerating}
                  onRegenerate={handleRegenerate}
                  onEditMessage={handleEditMessage}
                />
              ))}
              <div ref={messagesEndRef} className="h-2" />
            </div>
          )}
        </main>

        {/* Bottom Composer */}
        <div className="shrink-0 bg-gradient-to-t from-white via-white to-white/80 dark:from-[#0B0F14] dark:via-[#0B0F14] dark:to-[#0B0F14]/80">
          <ChatComposer
            onSend={handleSend}
            onStop={handleStop}
            isGenerating={isGenerating}
            webSearch={webSearch}
            onToggleWebSearch={() => setWebSearch((prev) => !prev)}
            depth={depth}
            onChangeDepth={setDepth}
          />
        </div>
        <OfflineIndicator />
      </div>
    </div>
  );
}
