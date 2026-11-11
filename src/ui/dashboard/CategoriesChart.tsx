import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from 'recharts';
import { useThemeStore } from '../../lib/themeStore';

interface CategoriesChartProps {
  data: Array<{ name: string; value: number }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill} fontSize={16} fontWeight="bold">
        {payload.name}
      </text>
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
        innerRadius={outerRadius + 8}
        outerRadius={outerRadius + 12}
        fill={fill}
      />
    </g>
  );
};

const CategoriesChart: React.FC<CategoriesChartProps> = ({ data }) => {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    const checkDimensions = () => {
      if (
        containerRef.current &&
        containerRef.current.offsetWidth > 0 &&
        containerRef.current.offsetHeight > 0
      ) {
        setIsMounted(true);
        return true;
      }
      return false;
    };

    if (checkDimensions()) return;

    const interval = setInterval(() => {
      if (checkDimensions()) clearInterval(interval);
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const onPieEnter = (_: any, _index: number) => {
    // setActiveIndex(index);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-[300px] min-h-[300px] w-full overflow-hidden"
    >
      {isMounted ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
          <PieChart>
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#1e293b' : '#ffffff',
                border: '1px solid var(--app-border)',
                borderRadius: '8px',
                color: 'var(--app-text)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                fontWeight: 'bold',
                padding: '8px 12px',
              }}
              itemStyle={{ color: 'var(--app-text-secondary)', fontWeight: 'bold' }}
              formatter={(value: any) => [
                new Intl.NumberFormat('en-US').format(value || 0),
                'القيمة',
              ]}
            />
            <Pie
              activeShape={renderActiveShape}
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={95}
              paddingAngle={4}
              dataKey="value"
              onMouseEnter={onPieEnter}
              stroke="none"
            >
              {data.map((_entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  className="cursor-pointer outline-none transition-opacity hover:opacity-80"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full w-full animate-pulse items-center justify-center rounded-3xl bg-slate-50/50 dark:bg-slate-800/10 max-md:rounded-xl">
          <div className="h-32 w-32 animate-spin rounded-full border-8 border-slate-200 border-t-blue-500 opacity-20 dark:border-slate-700" />
        </div>
      )}
    </div>
  );
};

export default CategoriesChart;
