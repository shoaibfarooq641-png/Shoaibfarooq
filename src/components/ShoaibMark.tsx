import React from 'react';

interface ShoaibMarkProps {
  className?: string;
}

export const ShoaibMark: React.FC<ShoaibMarkProps> = ({ className = 'w-6 h-6' }) => {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        className="fill-teal-600 dark:fill-teal-500"
      />
      <path
        d="M19.75 10.75C19.75 9.50736 18.0711 8.5 16 8.5C13.9289 8.5 12.25 9.50736 12.25 10.75C12.25 12.4 14.1 13.1 16 13.75C17.9 14.4 19.75 15.1 19.75 17.25C19.75 18.4926 18.0711 19.5 16 19.5C13.9289 19.5 12.25 18.4926 12.25 17.25"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M16 22.5V23.5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
};
