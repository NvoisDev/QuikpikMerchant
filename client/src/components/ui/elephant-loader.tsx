import { motion } from 'framer-motion';

interface ElephantLoaderProps {
  message?: string;
}

export default function ElephantLoader({ message = 'Loading products...' }: ElephantLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg viewBox="0 0 160 140" width="160" height="140" xmlns="http://www.w3.org/2000/svg">

          {/* Shadow */}
          <ellipse cx="80" cy="134" rx="38" ry="6" fill="rgba(0,0,0,0.08)" />

          {/* Left ear — flaps */}
          <motion.ellipse
            cx="34" cy="68" rx="20" ry="26"
            fill="#b0b8c1"
            animate={{ scaleX: [1, 0.6, 1], originX: '100%' }}
            style={{ transformOrigin: '54px 68px' }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.ellipse
            cx="36" cy="68" rx="13" ry="18"
            fill="#c8d0d8"
            animate={{ scaleX: [1, 0.6, 1] }}
            style={{ transformOrigin: '54px 68px' }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Right ear — flaps opposite phase */}
          <motion.ellipse
            cx="126" cy="68" rx="20" ry="26"
            fill="#b0b8c1"
            animate={{ scaleX: [1, 0.6, 1] }}
            style={{ transformOrigin: '106px 68px' }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
          />
          <motion.ellipse
            cx="124" cy="68" rx="13" ry="18"
            fill="#c8d0d8"
            animate={{ scaleX: [1, 0.6, 1] }}
            style={{ transformOrigin: '106px 68px' }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
          />

          {/* Body */}
          <ellipse cx="80" cy="90" rx="38" ry="34" fill="#9aa5b1" />

          {/* Belly */}
          <ellipse cx="80" cy="98" rx="24" ry="20" fill="#c8d0d8" />

          {/* Head */}
          <ellipse cx="80" cy="58" rx="30" ry="28" fill="#9aa5b1" />

          {/* Left tusk — tiny green friendly */}
          <ellipse cx="60" cy="80" rx="4" ry="8" fill="#22c55e"
            transform="rotate(-20 60 80)" />

          {/* Right tusk */}
          <ellipse cx="100" cy="80" rx="4" ry="8" fill="#22c55e"
            transform="rotate(20 100 80)" />

          {/* Trunk — swings */}
          <motion.g
            animate={{ rotate: [0, 18, -18, 0] }}
            style={{ transformOrigin: '80px 78px' }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path
              d="M 72 78 Q 60 100 58 116 Q 56 126 66 124 Q 74 122 72 112 Q 70 102 80 90"
              fill="none"
              stroke="#9aa5b1"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Trunk tip */}
            <circle cx="63" cy="120" r="6" fill="#9aa5b1" />
          </motion.g>

          {/* Left eye */}
          <circle cx="66" cy="50" r="5" fill="white" />
          <circle cx="67" cy="50" r="2.5" fill="#1f2937" />
          <circle cx="68" cy="49" r="0.8" fill="white" />

          {/* Right eye */}
          <circle cx="94" cy="50" r="5" fill="white" />
          <circle cx="95" cy="50" r="2.5" fill="#1f2937" />
          <circle cx="96" cy="49" r="0.8" fill="white" />

          {/* Smile */}
          <path d="M 70 66 Q 80 74 90 66" stroke="#6b7280" strokeWidth="2" fill="none" strokeLinecap="round" />

          {/* Front left leg */}
          <motion.rect
            x="52" y="116" width="16" height="20" rx="8"
            fill="#9aa5b1"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
          />
          {/* Front right leg */}
          <motion.rect
            x="92" y="116" width="16" height="20" rx="8"
            fill="#9aa5b1"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          />

          {/* Tail — wags via rotation to avoid SVG path morphing errors */}
          <motion.g
            style={{ transformOrigin: '118px 84px' }}
            animate={{ rotate: [0, 20, -20, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path
              d="M 118 84 Q 132 78 128 90"
              stroke="#9aa5b1"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
            />
          </motion.g>
        </svg>
      </motion.div>

      {/* Message */}
      <motion.p
        className="text-sm font-medium text-gray-500"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {message}
      </motion.p>

      {/* Bouncing dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-green-500"
            animate={{ scale: [1, 1.6, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}
