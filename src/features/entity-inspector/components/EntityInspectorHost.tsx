import React, { lazy, Suspense } from 'react';
import { useEntityInspectorStore } from '../store';

const UniversalEntityInspectorModal = lazy(() =>
  import('./UniversalEntityInspectorModal').then(m => ({
    default: m.UniversalEntityInspectorModal,
  }))
);

/**
 * مضيف خفيف جداً لنافذة الاستعلام الفوري:
 * لا يتم تحميل حزمة النافذة المنبثقة ولا تصيير أي DOM حتى ينقر المستخدم
 * فعلياً على نقطة استعلام (`EntityInfoDot`) لأول مرة.
 */
export const EntityInspectorHost: React.FC = () => {
  const hasTarget = useEntityInspectorStore(s => s.stack.length > 0);
  if (!hasTarget) return null;

  return (
    <Suspense fallback={null}>
      <UniversalEntityInspectorModal />
    </Suspense>
  );
};
