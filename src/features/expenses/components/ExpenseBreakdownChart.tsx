import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';
import type { PieSectorShapeProps, TooltipContentProps } from 'recharts';
import type { ExpenseCategorySummary } from '../types';
import { formatCurrency } from '../../../core/utils';
import { useThemeStore } from '@/lib/themeStore';
import { cn } from '@/core/utils';

interface Props {
  data: ExpenseCategorySummary[];
}

/**
 * recharts يمرّر `payload` في بيانات الشريحة بـ`any` (لأنه ينسخ كائن البيانات
 * الأصلي كما هو). نُعيد تغليفه مرة واحدة بدل تمرير `any` في كل موضع بالرسم.
 */
const readCategory = (payload: unknown): ExpenseCategorySummary | undefined =>
  typeof payload === 'object' && payload !== null
    ? (payload as ExpenseCategorySummary)
    : undefined;

/** قيم التلميح تحمل `number | string | ReadonlyArray` — نُثبّتها كرقم قبل التنسيق. */
const readNumericValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/** تدرّجات الشرائح المبنية على ألوان التصنيفات. */
const PieGradients: React.FC<Props> = ({ data }) => (
  <defs>
    {data.map((entry, index) => (
      <linearGradient
        key={`pieGrad-${String(index)}`}
        id={`pieGrad-${String(index)}`}
        x1="0"
        y1="0"
        x2="0"
        y2="1"
      >
        <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
        <stop offset="100%" stopColor={entry.color} stopOpacity={0.7} />
      </linearGradient>
    ))}
  </defs>
);

interface SectorLabelsProps {
  cx: number;
  cy: number;
  fill?: string | undefined;
  name?: string | undefined;
}

/** وسم الشريحة النشطة: اسم التصنيف في مركز الدائرة. */
const SectorLabels: React.FC<SectorLabelsProps> = ({ cx, cy, fill, name }) => (
  <>
    <text
      x={cx}
      y={cy}
      dy={-10}
      textAnchor="middle"
      fill={fill}
      fontSize={12}
      fontWeight="black"
      className="uppercase tracking-widest opacity-40"
    >
      CATEGORY
    </text>
    <text
      x={cx}
      y={cy}
      dy={15}
      textAnchor="middle"
      fill={fill}
      fontSize={18}
      fontWeight="black"
      className="font-mono"
    >
      {name}
    </text>
  </>
);


/**
 * شكل الشريحة: في recharts 3 صار التخصيص عبر `shape` + `isActive`
 * (بديل `activeShape` المهجورة)، والشريحة غير النشطة تُرسم بالخصائص الهندسية
 * القياسية نفسها التي كانت تُرسم بها سابقاً.
 */
const renderSector = (props: PieSectorShapeProps): React.ReactNode => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, cornerRadius, isActive } =
    props;

  if (!isActive) {
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        cornerRadius={cornerRadius ?? 0}
        fill={fill}
      />
    );
  }

  return (
    <g>
      <SectorLabels cx={cx} cy={cy} fill={fill} name={readCategory(props.payload)?.name} />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 14}
        fill={fill}
      />
    </g>
  );
};

type TooltipPayloadList = TooltipContentProps<number, string>['payload'];

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadList;
  isDark: boolean;
  total: number;
}

/** محتوى التلميح مُستخرج خارج المكوّن الرئيسي (يحافظ على حدّ الطول والوضوح). */
const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, isDark, total }) => {
  const entry = payload?.[0];
  const category = readCategory(entry?.payload);

  if (active !== true || !entry || !category) return null;

  const value = readNumericValue(entry.value);
  const share = total > 0 ? (value / total) * 100 : 0;

  return (
    <div
      className={cn(
        'rounded-3xl border p-4 shadow-2xl backdrop-blur-xl transition-all duration-300',
        isDark
          ? 'border-slate-700/50 bg-slate-900/80 shadow-black/50'
          : 'border-slate-200/50 bg-white/90 shadow-slate-200/50'
      )}
    >
      <div className="mb-2 flex items-center gap-3">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {category.name}
        </p>
      </div>
      <p className="font-mono text-xl font-bold tracking-tight" style={{ color: category.color }}>
        {formatCurrency(value)}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">
        نسبة الإنفاق: {share.toFixed(1)}%
      </p>
    </div>
  );
};

const ExpenseBreakdownChart: React.FC<Props> = ({ data }) => {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="group relative h-[320px] w-full">
      <div className="absolute right-0 top-0 text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
        Interactive Analysis
      </div>
      <ResponsiveContainer width="100%" height={320} minWidth={1} minHeight={1}>
        <PieChart>
          <PieGradients data={data} />
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={95}
            paddingAngle={4}
            dataKey="value"
            stroke="none"
            shape={renderSector}
            animationBegin={0}
            animationDuration={1500}
          >
            {data.map((_entry, index) => (
              <Cell
                key={`cell-${String(index)}`}
                fill={`url(#pieGrad-${String(index)})`}
                className="cursor-pointer transition-all duration-500"
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip isDark={isDark} total={total} />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ExpenseBreakdownChart;
