import React from 'react';
import { Keyboard, ArrowUpRight, Zap } from 'lucide-react';
import Modal from '../base/Modal';
import { RegisteredShortcut } from '../../core/shortcuts/types';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: RegisteredShortcut[];
}

export const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({
  isOpen,
  onClose,
  shortcuts,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="اختصارات لوحة المفاتيح السريعة"
      size="lg"
    >
      <div className="space-y-4 p-4 text-[var(--app-text)]">
        {/* Header banner */}
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-amber-900 dark:text-amber-200">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
            <Zap size={22} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-sm leading-relaxed">
            <p className="font-bold">وصول فوري وشامل لجميع الشاشات المحاسبية المهمة</p>
            <p className="text-xs opacity-90">
              تعمل هذه الاختصارات تلقائياً سواء كانت لوحة المفاتيح باللغة العربية أو الإنجليزية.
            </p>
          </div>
        </div>

        {/* Shortcuts list */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {shortcuts.map(item => {
            const isCtrl = (item.modifiers ?? ['ctrl']).includes('ctrl');
            const isShift = (item.modifiers ?? []).includes('shift');

            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white/70 p-3 shadow-xs transition-all hover:border-amber-500/40 hover:bg-amber-50/20 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-amber-500/30 dark:hover:bg-amber-950/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-extrabold text-slate-900 dark:text-slate-100">
                      {item.label}
                    </span>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                      {item.description}
                    </p>
                  </div>

                  {/* Keyboard badge */}
                  <div className="flex shrink-0 items-center gap-1">
                    {isCtrl && (
                      <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-black text-slate-700 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Ctrl
                      </kbd>
                    )}
                    {isShift && (
                      <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-black text-slate-700 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Shift
                      </kbd>
                    )}
                    <span className="text-xs text-slate-400">+</span>
                    <kbd className="rounded border border-amber-400/80 bg-amber-100/80 px-2 py-0.5 font-mono text-xs font-black text-amber-950 shadow-2xs dark:border-amber-600 dark:bg-amber-950/70 dark:text-amber-200">
                      {item.arKey}
                    </kbd>
                  </div>
                </div>

                {/* Direct Action trigger */}
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-800/80">
                  <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300">
                    {isCtrl ? `Ctrl + ${item.enKey.toUpperCase()}` : item.enKey}
                  </span>
                  <button
                    onClick={() => {
                      onClose();
                      item.action();
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100/60 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  >
                    <span>انتقل للشاشة</span>
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tip footer */}
        <div className="flex items-center justify-between border-t border-slate-200/80 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
          <div className="flex items-center gap-1.5">
            <Keyboard size={15} className="text-amber-600 dark:text-amber-400" />
            <span>يمكنك فتح هذا الدليل في أي وقت بالضغط على</span>
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1 py-0.2 font-mono text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Shift + ؟
            </kbd>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-3 py-1 font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ShortcutsHelpModal;
