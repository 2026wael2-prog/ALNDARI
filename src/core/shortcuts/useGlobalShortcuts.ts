import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SYSTEM_SHORTCUTS, matchesKeyboardShortcut } from './shortcutsRegistry';
import { RegisteredShortcut } from './types';
import { ROUTES } from '../routes/paths';

interface UseGlobalShortcutsOptions {
  enabled?: boolean;
}

export function useGlobalShortcuts(options: UseGlobalShortcutsOptions = {}) {
  const { enabled = true } = options;
  const navigate = useNavigate();
  const location = useLocation();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);
  const toggleHelp = useCallback(() => setIsHelpOpen(prev => !prev), []);

  const registeredShortcuts: RegisteredShortcut[] = useMemo(() => {
    return SYSTEM_SHORTCUTS.map(shortcut => {
      let action: () => void;

      switch (shortcut.id) {
        case 'new_sales_invoice':
          action = () => {
            navigate(`${ROUTES.DASHBOARD.SALES}?tab=create`);
          };
          break;

        case 'customer_statement':
          action = () => {
            navigate(`${ROUTES.DASHBOARD.CLIENTS}?tab=statements`);
          };
          break;

        case 'new_product':
          action = () => {
            if (location.pathname === ROUTES.DASHBOARD.INVENTORY) {
              window.dispatchEvent(new CustomEvent('alzhra-open-add-product'));
            } else {
              navigate(`${ROUTES.DASHBOARD.INVENTORY}?action=new`);
            }
          };
          break;

        case 'product_explorer':
          action = () => {
            const isSalesCreate =
              location.pathname === ROUTES.DASHBOARD.SALES &&
              new URLSearchParams(location.search).get('tab') === 'create';

            if (isSalesCreate) {
              window.dispatchEvent(new CustomEvent('alzhra-open-product-selection'));
            } else {
              navigate(`${ROUTES.DASHBOARD.SALES}?tab=create&action=explore-products`);
            }
          };
          break;

        case 'receipt_bond':
          action = () => {
            if (location.pathname === ROUTES.DASHBOARD.BONDS) {
              window.dispatchEvent(
                new CustomEvent('alzhra-open-bond-modal', { detail: { type: 'receipt' } })
              );
            } else {
              navigate(`${ROUTES.DASHBOARD.BONDS}?tab=receipt&action=new`);
            }
          };
          break;

        case 'payment_bond':
          action = () => {
            if (location.pathname === ROUTES.DASHBOARD.BONDS) {
              window.dispatchEvent(
                new CustomEvent('alzhra-open-bond-modal', { detail: { type: 'payment' } })
              );
            } else {
              navigate(`${ROUTES.DASHBOARD.BONDS}?tab=payment&action=new`);
            }
          };
          break;

        case 'shortcuts_help':
          action = toggleHelp;
          break;

        default:
          action = () => {};
      }

      return {
        ...shortcut,
        action,
      };
    });
  }, [navigate, location.pathname, location.search, toggleHelp]);

  useEffect(() => {
    const handleToggle = () => toggleHelp();
    window.addEventListener('alzhra-toggle-shortcuts-help', handleToggle);
    return () => {
      window.removeEventListener('alzhra-toggle-shortcuts-help', handleToggle);
    };
  }, [toggleHelp]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an editable element and shortcut does not allow it
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      for (const shortcut of registeredShortcuts) {
        if (isInput && !shortcut.allowInInputs) {
          continue;
        }

        if (matchesKeyboardShortcut(e, shortcut)) {
          e.preventDefault();
          e.stopPropagation();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, registeredShortcuts]);

  return {
    isHelpOpen,
    setIsHelpOpen,
    openHelp,
    closeHelp,
    toggleHelp,
    shortcuts: registeredShortcuts,
  };
}
