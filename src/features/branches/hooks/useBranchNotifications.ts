/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-type-assertion */
import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { useBranchFilter } from './useBranchFilter';
import { useFeedbackStore } from '@/features/feedback/store';
import { useSoundStore, useNotificationStore } from '@/features/notifications/store';
import { useBranches } from '@/features/settings/hooks';
import type { Branch } from '@/features/settings/types';
import {
  subscribeToCrossBranchActivity,
  type CrossBranchActivityPayload,
} from '../services/crossBranchActivityService';

export const useBranchNotifications = (): void => {
  const { user } = useAuthStore();
  const { branchId: activeBranchId } = useBranchFilter();
  const { showToast } = useFeedbackStore();
  const { playNotificationSound } = useSoundStore();
  const { addNotification } = useNotificationStore();
  const { data: branches = [] } = useBranches();

  // Ref to hold the latest branches list for realtime callback resolution
  const branchesRef = useRef<Branch[]>([]);
  useEffect(() => {
    branchesRef.current = (branches as Branch[]) || [];
  }, [branches]);

  const resolveBranchName = useCallback((bId?: string | null): string => {
    if (!bId) return 'الفرع الرئيسي';
    const found = branchesRef.current.find(b => b.id === bId);
    return found?.name || 'أحد الفروع';
  }, []);

  const handleActivity = useCallback(
    (payload: CrossBranchActivityPayload) => {
      if (!user?.company_id) return;

      const branchName = payload.branch_name || resolveBranchName(payload.branch_id);
      const targetBranchName =
        payload.target_branch_name || (payload.target_branch_id ? resolveBranchName(payload.target_branch_id) : undefined);

      const amountFormatted =
        typeof payload.amount === 'number' && payload.amount > 0
          ? `${payload.amount.toLocaleString()} ${payload.currency_code || 'ر.ي'}`
          : '';

      const docNumberText = payload.document_number ? `(${payload.document_number})` : '';

      switch (payload.type) {
        // ── 1. طلبات المناقلة بين الفروع ────────────────────────────────────
        case 'transfer_request': {
          const isTarget = payload.target_branch_id === activeBranchId;
          if (isTarget) {
            void playNotificationSound('urgent', true);
            showToast(
              `🚨 طلب مناقلة وارد من [${branchName}]: يطلب قطع غيار لفرعه`,
              'warning',
              undefined,
              {
                label: 'عرض المناقلات',
                onClick: () => {
                  window.location.hash = '#/inventory';
                },
              }
            );

            addNotification({
              companyId: user.company_id,
              title: `🚨 طلب مناقلة وارد من ${branchName}`,
              message: payload.message || `قام ${branchName} بطلب مناقلة قطع غيار من فرعك`,
              type: 'warning',
              category: 'inventory',
              priority: 'urgent',
              link: '#/inventory',
              tag: `transfer_in_${payload.id}`,
            });
          } else {
            void playNotificationSound('normal');
            showToast(
              `🔄 طلب مناقلة مخزون بين [${branchName}] و [${targetBranchName || 'فرع آخر'}]`,
              'info',
              undefined,
              {
                label: 'عرض',
                onClick: () => {
                  window.location.hash = '#/inventory';
                },
              }
            );

            addNotification({
              companyId: user.company_id,
              title: '🔄 طلب مناقلة بين الفروع',
              message: `طلب مناقلة بين ${branchName} و ${targetBranchName || 'فرع شقيق'}`,
              type: 'info',
              category: 'inventory',
              priority: 'normal',
              link: '#/inventory',
              tag: `transfer_peer_${payload.id}`,
            });
          }
          break;
        }

        case 'transfer_approved': {
          const isRequester = payload.target_branch_id === activeBranchId;
          void playNotificationSound(isRequester ? 'high' : 'normal', isRequester);
          showToast(
            isRequester
              ? `✅ تم اعتماد وشحن طلب المناقلة من قبل [${branchName}]!`
              : `📦 شحن مناقلة مخزون من [${branchName}] إلى [${targetBranchName || 'فرع آخر'}]`,
            'success',
            undefined,
            {
              label: 'عرض',
              onClick: () => {
                window.location.hash = '#/inventory';
              },
            }
          );

          addNotification({
            companyId: user.company_id,
            title: isRequester ? '✅ اعتماد وشحن طلب المناقلة' : '📦 شحن مناقلة مخزون',
            message: payload.message || `تم اعتماد وشحن المناقلة من ${branchName}`,
            type: 'success',
            category: 'inventory',
            priority: isRequester ? 'high' : 'normal',
            link: '#/inventory',
            tag: `transfer_app_${payload.id}`,
          });
          break;
        }

        case 'transfer_rejected': {
          const isRequester = payload.target_branch_id === activeBranchId;
          void playNotificationSound('normal', true);
          showToast(
            isRequester
              ? `❌ تم رفض طلب المناقلة من قبل [${branchName}]`
              : `تم رفض مناقلة بين [${branchName}] و [${targetBranchName || 'فرع آخر'}]`,
            'error',
            undefined,
            {
              label: 'عرض',
              onClick: () => {
                window.location.hash = '#/inventory';
              },
            }
          );

          addNotification({
            companyId: user.company_id,
            title: '❌ رفض طلب مناقلة',
            message: payload.message || `تم رفض طلب المناقلة من قبل ${branchName}`,
            type: 'error',
            category: 'inventory',
            priority: 'normal',
            link: '#/inventory',
            tag: `transfer_rej_${payload.id}`,
          });
          break;
        }

        // ── 2. مبيعات الفروع ───────────────────────────────────────────────
        case 'sale_created': {
          void playNotificationSound('normal');
          showToast(
            `🛍️ مبيعات في [${branchName}]: ${payload.title} ${docNumberText} ${amountFormatted}`,
            'info',
            undefined,
            {
              label: 'عرض المبيعات',
              onClick: () => {
                window.location.hash = '#/sales';
              },
            }
          );

          addNotification({
            companyId: user.company_id,
            title: `${payload.title} - ${branchName}`,
            message: `${payload.message} ${docNumberText} ${amountFormatted ? `بقيمة ${amountFormatted}` : ''}`,
            type: 'info',
            category: 'sales',
            priority: 'normal',
            link: '#/sales',
            tag: `sale_${payload.id}`,
          });
          break;
        }

        // ── 3. مشتريات الفروع ──────────────────────────────────────────────
        case 'purchase_created': {
          void playNotificationSound('normal');
          showToast(
            `📥 مشتريات في [${branchName}]: ${payload.title} ${docNumberText} ${amountFormatted}`,
            'info',
            undefined,
            {
              label: 'عرض المشتريات',
              onClick: () => {
                window.location.hash = '#/purchases';
              },
            }
          );

          addNotification({
            companyId: user.company_id,
            title: `${payload.title} - ${branchName}`,
            message: `${payload.message} ${docNumberText} ${amountFormatted ? `بقيمة ${amountFormatted}` : ''}`,
            type: 'info',
            category: 'sales',
            priority: 'normal',
            link: '#/purchases',
            tag: `purchase_${payload.id}`,
          });
          break;
        }

        // ── 4. السندات المالية (قبض / صرف) ──────────────────────────────────
        case 'bond_created': {
          void playNotificationSound('normal');
          showToast(
            `💳 ${payload.title} في [${branchName}] ${docNumberText} ${amountFormatted}`,
            'info',
            undefined,
            {
              label: 'عرض السندات',
              onClick: () => {
                window.location.hash = '#/bonds';
              },
            }
          );

          addNotification({
            companyId: user.company_id,
            title: `${payload.title} - ${branchName}`,
            message: `${payload.message} ${docNumberText} ${amountFormatted ? `بمبلغ ${amountFormatted}` : ''}`,
            type: 'info',
            category: 'finance',
            priority: 'normal',
            link: '#/bonds',
            tag: `bond_${payload.id}`,
          });
          break;
        }

        // ── 5. عروض الأسعار ───────────────────────────────────────────────
        case 'quotation_created': {
          void playNotificationSound('normal');
          showToast(
            `📑 عرض أسعار جديد في [${branchName}] ${docNumberText} ${amountFormatted}`,
            'info',
            undefined,
            {
              label: 'عرض الأسعار',
              onClick: () => {
                window.location.hash = '#/sales';
              },
            }
          );

          addNotification({
            companyId: user.company_id,
            title: `عرض أسعار - ${branchName}`,
            message: `${payload.message} ${docNumberText} ${amountFormatted ? `بقيمة ${amountFormatted}` : ''}`,
            type: 'info',
            category: 'sales',
            priority: 'normal',
            link: '#/sales',
            tag: `quote_${payload.id}`,
          });
          break;
        }

        // ── 6. المنتجات المطلوبة (المطلوبات) ──────────────────────────────
        case 'requisition_created': {
          void playNotificationSound('normal');
          showToast(
            `📋 طلب منتجات مطلوبة جديد في [${branchName}] ${docNumberText}`,
            'info',
            undefined,
            {
              label: 'عرض المطلوبات',
              onClick: () => {
                window.location.hash = '#/sales';
              },
            }
          );

          addNotification({
            companyId: user.company_id,
            title: `طلب منتجات مطلوبة - ${branchName}`,
            message: `${payload.message} ${docNumberText}`,
            type: 'info',
            category: 'inventory',
            priority: 'normal',
            link: '#/sales',
            tag: `req_${payload.id}`,
          });
          break;
        }

        // ── 7. مبيعات داخلية مسجلة في جدول branch_notifications ───────────
        case 'internal_sale': {
          if (payload.target_branch_id === activeBranchId) {
            void playNotificationSound('high', true);
            showToast(
              `تنبيه مبيعات داخلية 🔄\n${payload.message}`,
              'info',
              undefined,
              {
                label: 'عرض المبيعات',
                onClick: () => {
                  window.location.hash = '#/sales';
                },
              }
            );

            addNotification({
              companyId: user.company_id,
              title: 'تنبيه مبيعات داخلية بين الفروع',
              message: payload.message,
              type: 'info',
              category: 'sales',
              priority: 'high',
              link: '#/sales',
              tag: `internal_sale_${payload.id}`,
            });
          }
          break;
        }

        default:
          break;
      }
    },
    [user?.company_id, activeBranchId, playNotificationSound, showToast, addNotification, resolveBranchName]
  );

  useEffect(() => {
    if (!user?.company_id) return;

    const unsubscribe = subscribeToCrossBranchActivity(
      user.company_id,
      user.id,
      handleActivity
    );

    return () => {
      unsubscribe();
    };
  }, [user?.company_id, user?.id, handleActivity]);
};
