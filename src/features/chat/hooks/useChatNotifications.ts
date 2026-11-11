/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unnecessary-condition */
import { useCallback, useRef } from 'react';
import { useSoundStore, useNotificationStore } from '../../notifications/store';
import { showDesktopNotification } from '../../notifications/desktopNotificationService';
import { useFeedbackStore } from '../../feedback/store';
import { useAuthStore } from '../../auth/store';
import { useChatStore } from '../stores/chatStore';
import { logger } from '../../../core/utils/logger';

// Cooldown so a burst of messages does not stack beeps/desktop popups.
const NOTIFY_COOLDOWN_MS = 3000;
let lastNotifyAt = 0;

/**
 * Hook for playing audio chime and triggering native desktop notifications for incoming chat messages.
 */
export const useChatNotifications = () => {
  const { isSoundEnabled } = useSoundStore();
  const audioContextRef = useRef<AudioContext | null>(null);

  /**
   * مُذكَّرة عبر `useCallback`: الهوية ثابتة ما لم يتغيّر خيار الصوت.
   * ثبات الهوية شرط لاستقرار اعتماديات `useChatRealtime` (بلا ذلك يُعاد إنشاء
   * اشتراك الـ websocket على كل رسم ⇒ رسائل مفقودة وحمل مضاعف).
   */
  const playIncomingBeep = useCallback(async () => {
    if (!isSoundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx();
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const ctx = audioContextRef.current;
      const now = ctx.currentTime;

      // Soft dual-tone ERP notification chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.12); // A5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880.0, now);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15); // D6

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.25);
      osc2.stop(now + 0.25);
    } catch (err) {
      logger.debug('ChatNotifications', 'Audio chime suppressed by browser policy', err);
    }
  }, [isSoundEnabled]);

  const notifyIncomingMessage = useCallback(
    (senderName: string, messageText: string, conversationId?: string) => {
      const now = Date.now();
      if (now - lastNotifyAt < NOTIFY_COOLDOWN_MS) return;
      lastNotifyAt = now;
      void playIncomingBeep();

      const chatState = useChatStore.getState();
      const isViewingActiveChannel =
        chatState.activeChannelId === conversationId &&
        typeof document !== 'undefined' &&
        !document.hidden;

      // إظهار إشعار شاشة منبثق عند ورود محادثة والمستخدم في صفحة أخرى أو في قناة مختلفة
      if (!isViewingActiveChannel) {
        const preview =
          messageText.length > 60 ? `${messageText.slice(0, 60)}...` : messageText;
        useFeedbackStore.getState().showToast(
          `💬 رسالة من [${senderName}]: ${preview}`,
          'info',
          undefined,
          {
            label: 'فتح المحادثة',
            onClick: () => {
              window.location.hash = conversationId ? `#/chat/${conversationId}` : '#/chat';
            },
          }
        );

        const user = useAuthStore.getState().user;
        if (user?.company_id) {
          useNotificationStore.getState().addNotification({
            companyId: user.company_id,
            title: `💬 رسالة محادثة - ${senderName}`,
            message: messageText,
            type: 'info',
            category: 'system',
            priority: 'normal',
            link: conversationId ? `#/chat/${conversationId}` : '#/chat',
            tag: `chat_${conversationId || 'channel'}`,
          });
        }
      }

      // If tab is in background or document hidden, dispatch OS desktop notification
      if (typeof document !== 'undefined' && document.hidden) {
        showDesktopNotification({
          title: `💬 رسالة جديدة من: ${senderName}`,
          body: messageText,
          link: conversationId ? `#/chat/${conversationId}` : '#/chat',
          requireInteraction: true,
        });
      }
    },
    [playIncomingBeep]
  );

  return { playIncomingBeep, notifyIncomingMessage };
};
