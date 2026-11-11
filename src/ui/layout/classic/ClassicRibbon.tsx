import React from 'react';
import { isRibbonPathActive } from './ribbonModel';
import type { RibbonGroup } from './ribbonModel';

interface ClassicRibbonProps {
  groups: RibbonGroup[];
  activePath: string;
  onNavigate: (path: string) => void;
}

const ClassicRibbon: React.FC<ClassicRibbonProps> = ({ groups, activePath, onNavigate }) => (
  <div className="classic-ribbon no-print overflow-x-auto custom-scrollbar-hide">
    <div className="flex items-stretch px-1 py-1">
      {groups.map(group => (
        <section key={group.id} className="classic-ribbon-group" aria-label={group.label}>
          <div className="flex flex-1 items-start justify-center gap-0.5">
            {group.items.map(item => {
              const Icon = item.icon;
              const isActive = isRibbonPathActive(activePath, item.path);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.path);
                  }}
                  title={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className="classic-ribbon-item"
                >
                  <span className="classic-ribbon-icon" aria-hidden="true">
                    <Icon size={15} strokeWidth={2} />
                  </span>
                  <span className="classic-ribbon-label">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="classic-ribbon-group-label">{group.label}</div>
        </section>
      ))}
    </div>
  </div>
);

export default ClassicRibbon;
