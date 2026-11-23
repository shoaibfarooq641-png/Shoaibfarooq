import React, { useMemo, useState } from 'react';
import {
  MessageSquare,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import type { Conversation } from '../types/chat';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  onCloseMobile: () => void;
  onCollapseDesktop: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onClearAll: () => void;
}

function getDateGroup(timestamp: number): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 7 * 86_400_000;

  if (timestamp >= startOfToday) return 'Today';
  if (timestamp >= startOfYesterday) return 'Yesterday';
  if (timestamp >= startOfWeek) return 'Previous 7 Days';
  return 'Older';
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  isOpen,
  onCloseMobile,
  onCollapseDesktop,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  const grouped = useMemo(() => {
    const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];
    const map = new Map<string, Conversation[]>();
    for (const label of order) map.set(label, []);
    for (const conv of filteredConversations) {
      const group = getDateGroup(conv.updatedAt);
      map.get(group)?.push(conv);
    }
    return order
      .map((label) => ({ label, items: map.get(label) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filteredConversations]);

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const commitRename = (id: string) => {
    const trimmed = editTitle.trim();
    if (trimmed) {
      onRenameConversation(id, trimmed);
    }
    setEditingId(null);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[268px] flex flex-col bg-[#F7F8FA] dark:bg-[#11161D] border-r border-slate-200 dark:border-slate-800/80 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
        }`}
        aria-label="Conversation history"
      >
        {/* Top Controls */}
        <div className="p-3 flex items-center gap-2 border-b border-slate-200/80 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onCloseMobile();
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[40px] rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCollapseDesktop();
              onCloseMobile();
            }}
            className="p-2.5 min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              aria-label="Search conversations"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white dark:bg-[#0B0F14] border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
          {grouped.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {searchQuery.trim()
                  ? 'No conversations match your search.'
                  : 'No saved conversations yet.'}
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label}>
                <div className="px-2.5 pb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {group.label}
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((conv) => {
                    const isActive = conv.id === activeId;
                    const isEditing = editingId === conv.id;

                    return (
                      <li key={conv.id}>
                        <div
                          onClick={() => {
                            if (!isEditing) {
                              onSelectConversation(conv.id);
                              onCloseMobile();
                            }
                          }}
                          className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-500" />

                          {isEditing ? (
                            <div
                              className="flex-1 flex items-center gap-1 min-w-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename(conv.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                autoFocus
                                className="w-full px-1.5 py-0.5 text-xs rounded bg-white dark:bg-[#0B0F14] border border-teal-500 text-slate-900 dark:text-white focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => commitRename(conv.id)}
                                className="p-1 text-teal-600 dark:text-teal-400 hover:text-teal-700"
                                aria-label="Save title"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="p-1 text-slate-400 hover:text-slate-600"
                                aria-label="Cancel rename"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="flex-1 truncate text-[13px]">{conv.title}</span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => startRename(conv, e)}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                  aria-label={`Rename ${conv.title}`}
                                  title="Rename"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteConversation(conv.id);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                                  aria-label={`Delete ${conv.title}`}
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer Clear History */}
        {conversations.length > 0 && (
          <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80">
            {confirmClear ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 dark:text-slate-300">Delete all chats?</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll();
                      setConfirmClear(false);
                    }}
                    className="px-2.5 py-1 rounded bg-red-600 text-white font-medium hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear all history</span>
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
