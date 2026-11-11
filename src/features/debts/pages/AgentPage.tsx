import React, { useState } from 'react';
import { ListOrdered, Terminal, Sliders, Landmark } from 'lucide-react';
import { cn } from '../../../core/utils';
import { useDebtAgent } from '../hooks/useDebtAgent';
import { useDebtFollowupConfig } from '../hooks/useDebtQueries';
import { AgentMissionControl } from '../components/agent/AgentMissionControl';
import { AgentGovernancePanel } from '../components/agent/AgentGovernancePanel';
import { AgentUpcomingQueue } from '../components/agent/AgentUpcomingQueue';
import { AgentLiveFeed } from '../components/agent/AgentLiveFeed';
import { AgentKnowledgeCard } from '../components/agent/AgentKnowledgeCard';

type AgentSubTab = 'queue' | 'feed' | 'governance' | 'knowledge';

export const AgentPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AgentSubTab>('queue');

  const {
    telemetry,
    isLoadingTelemetry,
    feed,
    isLoadingFeed,
    queue,
    isLoadingQueue,
    toggleAutonomous,
    isToggling,
    updateGovernance,
    isUpdatingGovernance,
    drainQueueNow,
    isDraining,
    refetchAll,
  } = useDebtAgent();

  const { data: config } = useDebtFollowupConfig();

  const SUB_TABS: Array<{
    id: AgentSubTab;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    count?: number;
  }> = [
    { id: 'queue', label: 'طابور الإرسال القادم', icon: ListOrdered, count: queue.length },
    { id: 'feed', label: 'سجل الرصد الحي', icon: Terminal, count: feed.length },
    { id: 'governance', label: 'سياسات وقواعد الوكيل', icon: Sliders },
    { id: 'knowledge', label: 'الحسابات البنكية والتذييل', icon: Landmark },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      {/* 1. Sleek Compact Control Header & 4 KPIs */}
      <AgentMissionControl
        telemetry={telemetry}
        isLoading={isLoadingTelemetry}
        isToggling={isToggling}
        onToggleAutonomous={toggleAutonomous}
        onRefresh={refetchAll}
      />

      {/* 2. Clean Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--app-border)] pb-2">
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all',
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]'
              )}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.2 text-[10px] font-mono font-bold',
                    isActive ? 'bg-white/20 text-white' : 'bg-[var(--app-bg)] text-[var(--app-text)]'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Focused Tab Content Area (Full Width, Zero Clutter) */}
      <div className="pt-1">
        {activeTab === 'queue' && (
          <AgentUpcomingQueue
            queue={queue}
            isLoading={isLoadingQueue}
            isDraining={isDraining}
            onDrainNow={drainQueueNow}
          />
        )}

        {activeTab === 'feed' && (
          <AgentLiveFeed activities={feed} isLoading={isLoadingFeed} />
        )}

        {activeTab === 'governance' && (
          <AgentGovernancePanel
            config={config}
            isSaving={isUpdatingGovernance}
            onSave={updateGovernance}
          />
        )}

        {activeTab === 'knowledge' && (
          <AgentKnowledgeCard
            config={config}
            isSaving={isUpdatingGovernance}
            onSave={updateGovernance}
          />
        )}
      </div>
    </div>
  );
};

export default AgentPage;
