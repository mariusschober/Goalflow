import React from 'react';

const CONFETTI_COUNT = 50;

export const Celebration: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
      {Array.from({ length: CONFETTI_COUNT }).map((_, i) => {
        const style: React.CSSProperties = {
          left: `${Math.random() * 100}%`,
          animation: `confetti-fall ${1 + Math.random() * 2}s ${Math.random() * 1}s ease-out forwards`,
          backgroundColor: `hsl(${Math.random() * 360}, 70%, 50%)`,
          width: `${Math.floor(Math.random() * 8) + 8}px`,
          height: `${Math.floor(Math.random() * 5) + 5}px`,
        };
        return <div key={i} className="absolute top-[-20px] rounded-sm" style={style} />;
      })}
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0vh) rotateZ(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotateZ(${Math.random() * 360}deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
