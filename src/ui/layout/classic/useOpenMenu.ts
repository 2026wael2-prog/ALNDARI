import { useCallback, useState } from 'react';

export interface OpenMenuModel {
  openMenuId: string | null;
  toggleMenu: (id: string) => void;
  hoverMenu: (id: string) => void;
  closeMenu: () => void;
}

/**
 * حالة فتح قوائم شريط القوائم: لوحة واحدة مفتوحة في كل لحظة،
 * والتحويم يبدّل بينها فقط بعد فتح أول قائمة (سلوك سطح المكتب الكلاسيكي).
 */
export const useOpenMenu = (): OpenMenuModel => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const closeMenu = useCallback((): void => {
    setOpenMenuId(null);
  }, []);

  const toggleMenu = useCallback((id: string): void => {
    setOpenMenuId(current => (current === id ? null : id));
  }, []);

  const hoverMenu = useCallback((id: string): void => {
    setOpenMenuId(current => (current === null ? null : id));
  }, []);

  return { openMenuId, toggleMenu, hoverMenu, closeMenu };
};
