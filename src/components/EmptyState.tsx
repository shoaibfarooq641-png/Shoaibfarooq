import React from 'react';
import { BookOpen, Code2, Globe, User } from 'lucide-react';
import { ShoaibMark } from './ShoaibMark';

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

const STARTER_PROMPTS = [
  {
    icon: User,
    title: 'Anyone & biographies',
    prompt: 'Tell me everything important about Nikola Tesla — his life, major inventions, and legacy.',
  },
  {
    icon: Globe,
    title: 'Live news & facts',
    prompt: 'What are the latest major developments in global AI and space exploration in 2026?',
  },
  {
    icon: BookOpen,
    title: 'Anything explained clearly',
    prompt: 'Explain how black holes form, what event horizons are, and what Hawking radiation does.',
  },
  {
    icon: Code2,
    title: 'Code & technical answers',
    prompt: 'Compare PostgreSQL vs MongoDB for a modern web app with a clear recommendation table.',
  },
];

export const EmptyState: React.FC<EmptyStateProps> = ({ onSelectPrompt }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 max-w-3xl mx-auto w-full">
      <div className="flex flex-col items-center text-center mb-8">
        <ShoaibMark className="w-11 h-11 mb-4" />
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
          Ask Shoaib anything
        </h1>
        <p className="mt-2.5 text-sm sm:text-[15px] text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
          Fast, comprehensive answers about any person, topic, news event, science, or code—grounded in live multi-source search.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        {STARTER_PROMPTS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => onSelectPrompt(item.prompt)}
              className="group text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11161D] hover:border-teal-500/60 dark:hover:border-teal-500/50 hover:bg-slate-50/70 dark:hover:bg-[#151C25] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400 mb-1.5">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.title}</span>
              </div>
              <p className="text-[13.5px] leading-snug text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                {item.prompt}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
