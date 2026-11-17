import React from 'react';
import MetaSelect from '../MetaSelect';

export interface MetaBlockProps {
  label: string;
  value: string;
  icon: React.ElementType;
  isSelect?: boolean;
  options?: Array<{ id: string; label: string }>;
  field: string;
  colorClass?: string;
  type?: 'text' | 'date' | 'input';
  onChange: (field: string, value: string) => void;
}

export const MetaBlock: React.FC<MetaBlockProps> = ({
  label,
  value,
  icon: Icon,
  isSelect,
  options,
  field,
  colorClass,
  type = 'text',
  onChange,
}) => (
  <div className="relative flex min-w-0 flex-1 flex-col justify-center bg-[var(--app-surface)] p-1.5">
    <div className="mb-0.5 flex items-center gap-1">
      <Icon size={10} className={colorClass ?? 'text-blue-500'} />
      <span className="truncate text-[10px] font-bold uppercase leading-none tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
    </div>
    {isSelect === true ? (
      <MetaSelect
        value={value}
        onChange={selected => {
          onChange(field, selected);
        }}
        options={options ?? []}
        placeholder={
          field === 'cashboxId' ? 'الصندوق...' : field === 'warehouseId' ? 'المستودع...' : 'اختر...'
        }
      />
    ) : type === 'date' || type === 'input' ? (
      <input
        type={type}
        value={value}
        onChange={event => {
          onChange(field, event.target.value);
        }}
        className="min-h-4 w-full bg-transparent font-mono text-[11px] font-bold leading-none text-blue-950 outline-none dark:text-white max-md:text-[10px]"
      />
    ) : (
      <span className="truncate font-mono text-[11px] font-bold leading-none text-blue-950 dark:text-gray-100 max-md:text-[10px]">
        {value}
      </span>
    )}
  </div>
);
