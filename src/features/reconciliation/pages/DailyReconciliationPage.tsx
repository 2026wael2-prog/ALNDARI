import React from 'react';
import { ReconciliationPageView } from './ReconciliationPageView';
import { useReconciliationPageController } from './useReconciliationPageController';

/**
 * المطابقة اليومية وإقفال الصندوق.
 * الصفحة طبقة عرض رقيقة: `useReconciliationPageController` يجمع الحالة والاستعلامات
 * والمُعالِجات، و`ReconciliationPageView` يعرض الأقسام (الترويسة، نطاق المنشأة،
 * الأرقام الحاسمة، جرد العملات، الشبكة، التوريد، التفاصيل، والاعتماد) بلا منطق أعمال.
 */
const DailyReconciliationPage: React.FC = () => {
  const page = useReconciliationPageController();

  return <ReconciliationPageView page={page} />;
};

export default DailyReconciliationPage;
