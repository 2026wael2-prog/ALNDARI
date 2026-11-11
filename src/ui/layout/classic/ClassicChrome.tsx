import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../../lib/hooks/useTranslation';
import ClassicMenuBar from './ClassicMenuBar';
import ClassicRibbon from './ClassicRibbon';
import ClassicTitleBar from './ClassicTitleBar';
import { findMenuItemForPath } from './ribbonModel';
import { useClassicChrome } from './useClassicChrome';

/**
 * القشرة الكلاسيكية (الميزان): شريط عنوان + قوائم + شريط أوامر.
 * تُعرض على الشاشات المتوسطة فأعلى فقط (md) — الهاتف يبقى على الشكل الحديث.
 */
const ClassicChrome: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const chrome = useClassicChrome();

  const currentItem = findMenuItemForPath(location.pathname);
  const pageTitle = currentItem ? t(currentItem.labelKey) : t('overview');

  // react-router v7 يُرجع Promise من navigate — نغلّفه لتوقيع void متوافق مع معالجات الواجهة
  const goTo = useCallback(
    (path: string): void => {
      void navigate(path);
    },
    [navigate]
  );

  return (
    <div className="no-print sticky top-0 z-50 flex flex-shrink-0 flex-col">
      <ClassicTitleBar pageTitle={pageTitle} />

      <ClassicMenuBar
        menus={chrome.menus}
        currentLayout={chrome.uiLayout}
        theme={chrome.theme}
        ribbonCollapsed={chrome.ribbonCollapsed}
        onNavigate={goTo}
        onAction={chrome.handleAction}
      />

      {!chrome.ribbonCollapsed && (
        <ClassicRibbon
          groups={chrome.ribbonGroups}
          activePath={location.pathname}
          onNavigate={goTo}
        />
      )}
    </div>
  );
};

export default ClassicChrome;
