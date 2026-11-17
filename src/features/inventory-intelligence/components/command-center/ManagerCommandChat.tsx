import React, { useState } from 'react';
import { Bot, Send } from 'lucide-react';
import type { IntelligenceEngineOutput, OrchestrationResult } from '../../types';
import { parseManagerCommand } from '../../domain/orchestration/conversationalCommandParser';
import Button from '../../../../ui/base/Button';

interface Props {
  output: IntelligenceEngineOutput;
  orchestration: OrchestrationResult;
  onNavigateTab: (tabId: string) => void;
}

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestedTab?: string | undefined;
  suggestedTabLabel?: string | undefined;
}

const QUICK_PROMPTS = [
  'ما هي الأصناف المهددة بالنفاد؟',
  'فرص التحويل بين الفروع',
  'أولويات الشراء',
  'حالة الوكلاء وسلامة البيانات',
];

export const ManagerCommandChat: React.FC<Props> = ({
  output,
  orchestration,
  onNavigateTab,
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatEntry[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `مرحباً بك في مركز القيادة الذاتية. تم تنسيق ${orchestration.summary.totalDecisions} قراراً عبر 8 وكلاء متخصصين. اسألني عن النفاد، التحويلات، المشتريات، الموردين، أو حالة الوكلاء.`,
    },
  ]);

  const handleAsk = (textToAsk: string) => {
    const trimmed = textToAsk.trim();
    if (!trimmed) return;
    const reply = parseManagerCommand(trimmed, output, orchestration);
    setMessages(prev => [
      ...prev,
      { id: `u_${Date.now()}`, role: 'user', text: trimmed },
      {
        id: `a_${Date.now() + 1}`,
        role: 'assistant',
        text: reply.answer,
        suggestedTab: reply.suggestedTab,
        suggestedTabLabel: reply.suggestedTabLabel,
      },
    ]);
    setInput('');
  };

  return (
    <div className="flex flex-col rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bot size={16} className="text-blue-600" />
        <h4 className="text-xs font-bold text-[var(--app-text)]">
          مساعد القيادة الذاتية للمدير (قراءة واستعلام آمن)
        </h4>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map(prompt => (
          <button
            key={prompt}
            type="button"
            onClick={() => {
              handleAsk(prompt);
            }}
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mb-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3 text-xs">
        {messages.map(m => (
          <div
            key={m.id}
            className={`rounded-lg p-2.5 whitespace-pre-line ${
              m.role === 'user'
                ? 'mr-8 bg-blue-600 text-white'
                : 'ml-8 border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]'
            }`}
          >
            <div>{m.text}</div>
            {m.suggestedTab && m.suggestedTabLabel && (
              <button
                type="button"
                onClick={() => {
                  onNavigateTab(m.suggestedTab!);
                }}
                className="mt-2 inline-block rounded bg-blue-500/10 px-2 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-500/20"
              >
                {m.suggestedTabLabel} ←
              </button>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          handleAsk(input);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={e => {
            setInput(e.target.value);
          }}
          placeholder="اسأل عن صنف، نفاد، تحويل، مورد، أو حالة الوكلاء..."
          className="flex-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-1.5 text-xs text-[var(--app-text)]"
        />
        <Button type="submit" size="sm" variant="primary" leftIcon={<Send size={13} />}>
          إرسال
        </Button>
      </form>
    </div>
  );
};
