import React from 'react';
import { Activity, WifiOff } from 'lucide-react';

interface NetworkStatusPillProps {
  isOnline: boolean;
  isUnstable: boolean;
}

/**
 * Floating network status pill anchored above mobile navigation so network
 * state changes never cause layout shifts in main content.
 */
export const NetworkStatusPill: React.FC<NetworkStatusPillProps> = ({ isOnline, isUnstable }) => {
  if (isOnline && !isUnstable) {
    return null;
  }

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-24 z-[280] flex flex-col items-center gap-2 px-3">
      {!isOnline ? (
        <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center justify-center gap-2 rounded-full bg-rose-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg duration-300">
          <WifiOff size={11} className="animate-bounce" />
          <span>وضع عدم الاتصال — البيانات المحلية المخزّنة مؤقتاً</span>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center justify-center gap-2 rounded-full bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg duration-300">
          <Activity size={11} className="animate-pulse" />
          <span>الاتصال غير مستقر — جارٍ إعادة المحاولة</span>
        </div>
      )}
    </div>
  );
};
