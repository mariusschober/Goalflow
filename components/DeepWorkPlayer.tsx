
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { somaFmChannels, SomaFmChannel } from '../utils/somaFmChannels';
import { PlayIcon, Volume2Icon, VolumeXIcon, RadioIcon, ChevronDownIcon } from './Icons';

export const DeepWorkPlayer: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStation, setCurrentStation] = useState<SomaFmChannel>(somaFmChannels[0]);
  const [volume, setVolume] = useState(0.5);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Initialize Audio
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.volume = volume;
    audioRef.current = audio;

    const onPlay = () => {
        setIsLoading(false);
        setIsPlaying(true);
        setError(null);
    };
    
    const onPause = () => setIsPlaying(false);
    
    const onError = (e: Event) => {
        console.error("Stream Error", e);
        setIsLoading(false);
        setIsPlaying(false);
        setError("Stream unavailable");
    };

    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);

    audio.addEventListener('playing', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
        audio.pause();
        audio.removeEventListener('playing', onPlay);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('waiting', onWaiting);
        audio.removeEventListener('canplay', onCanPlay);
        audioRef.current = null;
    };
  }, []);

  // Sync Volume
  useEffect(() => {
      if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const playStation = (station: SomaFmChannel) => {
      if (!audioRef.current) return;
      
      setIsLoading(true);
      setError(null);
      
      // Use standard mp3 stream. 
      const streamUrl = `https://ice1.somafm.com/${station.id}-128-mp3`;
      
      if (audioRef.current.src !== streamUrl) {
          audioRef.current.src = streamUrl;
          audioRef.current.load();
      }
      
      audioRef.current.play().catch(e => {
          console.error("Autoplay prevented or stream error", e);
          setIsLoading(false);
          setIsPlaying(false);
      });
  };

  // Handle Play/Pause Logic
  const togglePlay = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!audioRef.current) return;

      if (isPlaying) {
          audioRef.current.pause();
      } else {
          playStation(currentStation);
      }
  };

  const selectStation = (station: SomaFmChannel) => {
      setCurrentStation(station);
      playStation(station);
      setIsMenuOpen(false); 
  };

  const toggleMenu = () => {
      if (isMenuOpen) {
          setIsMenuOpen(false);
      } else if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          const menuWidth = 320;
          let left = rect.right - menuWidth;
          
          if (left < 10) left = 10;
          
          setMenuPos({
              top: rect.bottom + 8,
              left: left
          });
          setIsMenuOpen(true);
      }
  };

  // Global Keyboard Shortcut (M)
  const stateRef = useRef({ isPlaying, currentStation });
  useEffect(() => {
      stateRef.current = { isPlaying, currentStation };
  }, [isPlaying, currentStation]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement;
          if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
              return;
          }
          if (e.metaKey || e.ctrlKey || e.altKey) return;

          if (e.key.toLowerCase() === 'm') {
              e.preventDefault();
              const { isPlaying: currentIsPlaying, currentStation: station } = stateRef.current;
              
              if (audioRef.current) {
                  if (currentIsPlaying) {
                      audioRef.current.pause();
                  } else {
                      playStation(station);
                  }
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
        {/* Main Player Control Group */}
        <div ref={buttonRef} className={`flex items-center rounded-xl border transition-all duration-200 select-none shadow-sm ${
            isPlaying 
            ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200 dark:shadow-none' 
            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-slate-600'
        }`}>
            {/* Play Button */}
            <button 
                onClick={togglePlay}
                className="pl-3 pr-2 py-2 flex items-center justify-center hover:opacity-80 active:scale-95 transition-transform border-r border-current/10"
                title={isPlaying ? "Pause (M)" : "Play Focus Music (M)"}
            >
                {isLoading ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : isPlaying ? (
                     <div className="flex items-end gap-[2px] h-3.5 w-3.5">
                        <div className="w-1 bg-current rounded-full animate-[bounce_1s_infinite] h-full"></div>
                        <div className="w-1 bg-current rounded-full animate-[bounce_1.2s_infinite] h-2/3"></div>
                        <div className="w-1 bg-current rounded-full animate-[bounce_0.8s_infinite] h-1/2"></div>
                    </div>
                ) : (
                    <PlayIcon className="w-4 h-4" />
                )}
            </button>

            {/* Dropdown Toggle */}
            <button 
                onClick={toggleMenu}
                className={`px-2 py-2 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors rounded-r-xl ${isMenuOpen ? 'bg-black/5 dark:bg-white/10' : ''}`}
                title="Select Station"
            >
                <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
        </div>

        {/* Dropdown Portal */}
        {isMenuOpen && ReactDOM.createPortal(
            <div className="fixed inset-0 z-[9999]">
                {/* Backdrop */}
                <div className="absolute inset-0 cursor-default" onClick={() => setIsMenuOpen(false)}></div>
                
                {/* Menu */}
                <div 
                    className="absolute bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-600 overflow-hidden w-80 animate-scaleIn origin-top-right flex flex-col max-h-[80vh]"
                    style={{ top: menuPos.top, left: menuPos.left }}
                >
                    {/* Header */}
                    <div className="p-4 bg-gray-50/80 dark:bg-slate-900/50 border-b border-gray-100 dark:border-slate-700 backdrop-blur-sm shrink-0">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                <RadioIcon className="w-3 h-3" /> Deep Work Radio
                            </span>
                            {error && <span className="text-[10px] text-red-500 font-bold bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">{error}</span>}
                        </div>
                        <h3 className="font-heading font-bold text-indigo-600 dark:text-indigo-400 text-lg leading-tight truncate">{currentStation.title}</h3>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">{currentStation.description}</p>
                        
                        {/* Volume */}
                        <div className="mt-4 flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-lg border border-gray-100 dark:border-slate-700 shadow-sm">
                            <button onClick={() => setVolume(volume === 0 ? 0.5 : 0)} className="text-gray-400 hover:text-indigo-500 transition">
                                {volume === 0 ? <VolumeXIcon className="w-4 h-4" /> : <Volume2Icon className="w-4 h-4" />}
                            </button>
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.05" 
                                value={volume} 
                                onChange={(e) => setVolume(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                    </div>

                    {/* List */}
                    <div className="overflow-y-auto custom-scrollbar p-1">
                        {somaFmChannels.map(station => (
                            <button
                                key={station.id}
                                onClick={() => selectStation(station)}
                                className={`w-full text-left p-3 rounded-xl mb-1 transition-all flex items-center gap-3 group relative overflow-hidden ${
                                    currentStation.id === station.id 
                                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-200' 
                                    : 'hover:bg-gray-50 dark:hover:bg-slate-700/50 text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                <div className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                                    currentStation.id === station.id 
                                        ? (isPlaying ? 'bg-green-500 scale-125 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-indigo-400') 
                                        : 'bg-gray-300 dark:bg-slate-600 group-hover:bg-gray-400'
                                }`}></div>
                                <div className="min-w-0 flex-grow">
                                    <p className={`text-sm font-bold truncate ${currentStation.id === station.id ? 'text-indigo-600 dark:text-indigo-300' : ''}`}>
                                        {station.title}
                                    </p>
                                    <p className="text-[10px] text-gray-400 truncate opacity-80 group-hover:opacity-100">{station.description}</p>
                                </div>
                                {currentStation.id === station.id && isPlaying && (
                                    <div className="absolute right-3 flex gap-0.5 items-end h-3">
                                        <div className="w-0.5 bg-indigo-500 animate-[bounce_0.8s_infinite] h-full"></div>
                                        <div className="w-0.5 bg-indigo-500 animate-[bounce_1.1s_infinite] h-2/3"></div>
                                        <div className="w-0.5 bg-indigo-500 animate-[bounce_1.3s_infinite] h-full"></div>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                    
                    <div className="p-2 bg-gray-50 dark:bg-slate-900/50 text-center border-t border-gray-100 dark:border-slate-700 text-[9px] text-gray-400">
                        Powered by <a href="https://somafm.com" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-500 underline decoration-indigo-300">SomaFM</a> • Ad-free
                    </div>
                </div>
            </div>,
            document.body
        )}
    </>
  );
};
