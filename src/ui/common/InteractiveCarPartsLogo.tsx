import React, { useState, useCallback } from 'react';
import { cn } from '../../core/utils';

interface InteractiveCarPartsLogoProps {
  size?: number;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
  title?: string;
}

/**
 * أيقونة التطبيق التفاعلية — سيارة تتفكك إلى قطع غيار (سقف، غطاء محرك، ترس محرك دوار،
 * هيكل، إطارات أمامية وخلفية، صدام) ثم تعود وتنطبق بسلاسة بحركة ميكانيكية مستمرة وتفاعلية
 * عند التمرير (Hover) والنقر (Click).
 */
export const InteractiveCarPartsLogo: React.FC<InteractiveCarPartsLogoProps> = ({
  size = 24,
  className,
  interactive = true,
  onClick,
  title = 'النظاري لقطع غيار السيارات — انقر للتفكيك وإعادة التركيب',
}) => {
  const [bursting, setBursting] = useState(false);

  const handleClick = useCallback(() => {
    if (interactive) {
      setBursting(false);
      // إعادة تشغيل النبضة التفاعلية في الإطار التالي
      requestAnimationFrame(() => {
        setBursting(true);
      });
      window.setTimeout(() => {
        setBursting(false);
      }, 1450);
    }
    onClick?.();
  }, [interactive, onClick]);

  return (
    <span
      onClick={handleClick}
      title={title}
      className={cn(
        'car-parts-logo inline-flex items-center justify-center select-none',
        interactive && 'cursor-pointer',
        bursting && 'is-bursting',
        className
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
        aria-hidden="true"
      >
        {/* 1. ترس المحرك الداخلي — يظهر ويدور عند تفكك السيارة */}
        <g className="car-part car-part-gear" style={{ transformOrigin: '24px 25px' }}>
          <circle
            cx="24"
            cy="25"
            r="5.2"
            stroke="#fde047"
            strokeWidth="2"
            strokeDasharray="3.2 2.2"
          />
          <circle cx="24" cy="25" r="2" fill="#fef08a" />
        </g>

        {/* 2. سقف السيارة والزجاج (Roof & Cabin) */}
        <g className="car-part car-part-roof" style={{ transformOrigin: '24px 18px' }}>
          <path
            d="M14.5 22L17.6 14.5C18.2 13.1 19.6 12.2 21.1 12.2H27.8C29.4 12.2 30.8 13.2 31.4 14.7L34.3 22H14.5Z"
            fill="currentColor"
            fillOpacity="0.95"
          />
          {/* الزجاج الأمامي والخلفي */}
          <path
            d="M17.2 20.5L19.2 15.4C19.5 14.7 20.2 14.2 21 14.2H23.2V20.5H17.2Z"
            fill="#0f172a"
            fillOpacity="0.45"
          />
          <path
            d="M25.1 14.2H27.5C28.3 14.2 29 14.7 29.3 15.4L31.4 20.5H25.1V14.2Z"
            fill="#0f172a"
            fillOpacity="0.45"
          />
        </g>

        {/* 3. غطاء المحرك الأمامي والمصباح (Hood & Headlight) */}
        <g className="car-part car-part-hood" style={{ transformOrigin: '36px 24px' }}>
          <path
            d="M32 21.5H39.8C41.5 21.5 42.8 22.8 42.8 24.5V29.5H32V21.5Z"
            fill="currentColor"
          />
          <rect x="39.4" y="23.6" width="3.2" height="2.4" rx="1" fill="#fde047" />
        </g>

        {/* 4. الجزء الخلفي / الصدام الخلفي (Rear Trunk & Tail) */}
        <g className="car-part car-part-bumper" style={{ transformOrigin: '10px 25px' }}>
          <path
            d="M5.2 24.5C5.2 22.8 6.5 21.5 8.2 21.5H15.5V29.5H5.2V24.5Z"
            fill="currentColor"
          />
          <rect x="5.4" y="23.8" width="2.6" height="2.4" rx="0.8" fill="#fb7185" />
        </g>

        {/* 5. الشاصيه / الهيكل الأوسط (Chassis / Doors) */}
        <g className="car-part car-part-body" style={{ transformOrigin: '24px 26px' }}>
          <rect x="14.2" y="21.5" width="19.2" height="8.5" rx="1.4" fill="currentColor" />
          <line
            x1="24"
            y1="22.5"
            x2="24"
            y2="29"
            stroke="#0f172a"
            strokeOpacity="0.28"
            strokeWidth="1.3"
          />
          <rect x="18.2" y="24.2" width="3" height="1.2" rx="0.6" fill="#0f172a" fillOpacity="0.35" />
          <rect x="26.5" y="24.2" width="3" height="1.2" rx="0.6" fill="#0f172a" fillOpacity="0.35" />
        </g>

        {/* 6. الإطار الخلفي (Rear Wheel) */}
        <g className="car-part car-part-wheel-rear" style={{ transformOrigin: '13.5px 31.5px' }}>
          <circle cx="13.5" cy="31.5" r="5" fill="#0f172a" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="13.5" cy="31.5" r="2" fill="#fb923c" />
        </g>

        {/* 7. الإطار الأمامي (Front Wheel) */}
        <g className="car-part car-part-wheel-front" style={{ transformOrigin: '34.5px 31.5px' }}>
          <circle cx="34.5" cy="31.5" r="5" fill="#0f172a" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="34.5" cy="31.5" r="2" fill="#fb923c" />
        </g>
      </svg>
    </span>
  );
};

export default InteractiveCarPartsLogo;
