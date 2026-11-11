import React, { useEffect, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../../auth/store';
import { useChatRealtime } from '../hooks/useChatRealtime';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';

export const ChatHubPage: React.FC = () => {
  const { user } = useAuthStore();
  const { fetchChannels, activeChannelId, setActiveChannel } = useChatStore();
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Initialize Realtime subscription
  useChatRealtime();

  useEffect(() => {
    if (user?.company_id && user?.id) {
      fetchChannels(user.company_id, user.id);
    }
  }, [user?.company_id, user?.id, fetchChannels]);

  useEffect(() => {
    if (activeChannelId) {
      setMobileView('chat');
    }
  }, [activeChannelId]);

  return (
    /**
     * الارتفاع: `h-full` نسبةً إلى حاوية الصفحة (MultiViewContainer) بدل
     * `h-[calc(100vh-4rem)]` — ذلك التعبير اليدوي كان يتجاهل شريط التبويبات
     * (2.5rem) وشريط التنقل السفلي وحشوة `<main>` (7rem على الهاتف)، فتصبح
     * الصفحة أطول من المساحة المتاحة ⇒ تُمرَّر `<main>` ويخرج صندوق الكتابة
     * أسفل الشاشة. الآن: المساحة الفعلية = ارتفاع الحاوية، والرسائل وحدها تُمرَّر.
     * `min-h-0` ضروري كي تتقلّص الأعمدة وتُمرَّر داخلياً بدل دفع المحتوى للخارج.
     */
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[var(--app-bg)]">
      {/* Sidebar List (Desktop: always visible, Mobile: toggled) */}
      <div
        className={`min-h-0 w-full flex-col lg:flex lg:w-80 lg:flex-shrink-0 ${
          mobileView === 'list' ? 'flex' : 'hidden'
        }`}
      >
        <ConversationList
          onSelectChannel={() => {
            setMobileView('chat');
          }}
        />
      </div>

      {/* Main Chat Area */}
      <div
        className={`min-h-0 min-w-0 flex-1 ${
          mobileView === 'chat' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
        }`}
      >
        <ConversationView
          onBack={() => {
            setMobileView('list');
            setActiveChannel(null);
          }}
        />
      </div>
    </div>
  );
};
