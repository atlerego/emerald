import { format } from 'date-fns';
import { useState, useEffect, useRef } from 'react';
import { DayPicker } from '@daypicker/react';
import '@daypicker/react/style.css';

import { getProcessedImages, type TimeMachineData } from './utils';

const MAX_RUNTIME_MILLISECONDS = 30 * 1000; // 30 seconds in milliseconds
const MAX_MILLISECONDS_PER_IMAGE = 150; // 150 milliseconds per image

const formatSpeed = (s: number) => s.toFixed(2).replace(/(\d\.\d)0$/, '$1');

function App() {
  // 1. State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState<Date | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRotated, setIsRotated] = useState(false);
  const [isFakeFullscreen, setIsFakeFullscreen] = useState(false);

  const [{ frames, dateIndex }, setImageData] = useState<TimeMachineData>({
    frames: [],
    dateIndex: {},
  });

  // 2. References
  const playRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);

  // 3. Derived (needed before effects)
  const isAtEnd = currentIndex === frames.length - 1 && !isPlaying;

  // 4. Effects
  // 4.1 Load and process images on mount
  useEffect(() => {
    getProcessedImages().then((data) => {
      setImageData(data);
      const todayKey = format(new Date(), 'yyyy-MM-dd');
      if (todayKey in data.dateIndex) {
        setCurrentIndex(data.dateIndex[todayKey]);
      }
    });
  }, []);

  // 4.2 Playback Logic
  useEffect(() => {
    const interval =
      Math.min(MAX_RUNTIME_MILLISECONDS / frames.length, MAX_MILLISECONDS_PER_IMAGE) / speed;

    if (isPlaying) {
      playRef.current = window.setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev + 1 >= frames.length) {
            setIsPlaying(false);
            return prev;
          }
          setCalendarMonth(undefined);
          return prev + 1;
        });
      }, interval);
    } else {
      if (playRef.current) clearInterval(playRef.current);
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [isPlaying, frames.length, speed]);

  // 4.3 Smart Preloading (loads 5 images ahead of current index)
  useEffect(() => {
    if (frames.length === 0) return;
    for (let i = 1; i <= 5; i++) {
      const nextIdx = (currentIndex + i) % frames.length;
      const img = new Image();
      img.src = frames[nextIdx].url;
    }
  }, [currentIndex, frames]);

  // 4.4 Auto-hide controls when playing
  useEffect(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = window.setTimeout(() => setShowControls(false), 2500);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying]);

  // 4.5 Sync fullscreen state with browser events
  useEffect(() => {
    const onFsChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs) {
        setIsRotated(false); // Ensure rotation resets if user hits ESC key
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // 4.6 Focus play button on mount and after fullscreen transitions
  useEffect(() => {
    playButtonRef.current?.focus();
  }, [isFullscreen, isFakeFullscreen]);

  // 4.7 Keyboard arrow navigation + space to play/pause/replay
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => Math.min(prev + 1, frames.length - 1));
        setCalendarMonth(undefined);
        setIsPlaying(false);
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
        setCalendarMonth(undefined);
        setIsPlaying(false);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (isAtEnd) {
          setCurrentIndex(0);
          setCalendarMonth(undefined);
          setIsPlaying(true);
        } else {
          setIsPlaying((prev) => !prev);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [frames.length, isAtEnd]);

  // 5. Handlers
  function handleMouseMove() {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = window.setTimeout(() => setShowControls(false), 2500);
    }
  }

  function handleDateSelect(date: Date | undefined) {
    if (!date) return;
    const key = format(date, 'yyyy-MM-dd');
    const firstFrameOfDay = dateIndex[key];
    if (firstFrameOfDay !== undefined) {
      setCurrentIndex(firstFrameOfDay);
      setIsPlaying(false);
    }
  }

  async function handleFullscreen() {
    // iOS Safari has no Fullscreen API — use CSS fake fullscreen instead
    if (!document.documentElement.requestFullscreen) {
      setIsFakeFullscreen((prev) => !prev);
      return;
    }

    if (!document.fullscreenElement) {
      try {
        await playerRef.current?.requestFullscreen();

        // 1. Try Native Lock (Android)
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape').catch(() => {
            setIsRotated(true);
          });
        } else {
          setIsRotated(true);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      // Exit Logic
      if (screen.orientation?.unlock) screen.orientation.unlock();
      setIsRotated(false);
      if (document.exitFullscreen) await document.exitFullscreen();
    }
  }

  // 6. Derived Data
  const currentFrame = frames[currentIndex];
  const controlsVisible = !isPlaying || showControls;

  const currentFrameMonth = currentFrame?.date ? new Date(currentFrame.date) : undefined;
  const displayMonth = calendarMonth ?? currentFrameMonth;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4">
      {/* Player */}
      <div className="w-full max-w-6xl transition-all duration-300">
        <div
          ref={playerRef}
          className={`relative w-full bg-black overflow-hidden shadow-2xl group 
            ${isFakeFullscreen ? 'fake-fullscreen' : isRotated ? 'manual-rotate' : 'rounded-xl'}`}
          style={{ aspectRatio: isFakeFullscreen || isRotated ? 'auto' : '16/9' }}
          onMouseMove={handleMouseMove}
        >
          {/* Video frame */}
          {currentFrame ? (
            <img
              src={currentFrame.url}
              alt="Construction frame"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              Loading…
            </div>
          )}

          {/* Gradient overlay */}
          <div
            className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/80 to-transparent transition-opacity duration-300"
            style={{ opacity: controlsVisible ? 1 : 0 }}
          />

          {/* Controls overlay */}
          <div
            className="absolute inset-x-0 bottom-0 px-4 pb-3 flex flex-col gap-2 transition-opacity duration-300"
            style={{ opacity: controlsVisible ? 1 : 0 }}
          >
            {/* Timestamp */}
            <div className="text-white text-sm font-semibold drop-shadow select-none">
              🕔{currentFrame?.time} <br /> 📅{currentFrame?.day} {currentFrame?.month},{' '}
              {currentFrame?.year}
            </div>

            {/* Seek bar */}
            <input
              type="range"
              min="0"
              max={frames.length - 1}
              value={currentIndex}
              onChange={(e) => {
                setCurrentIndex(Number(e.target.value));
                setCalendarMonth(undefined);
                setIsPlaying(false);
              }}
              onPointerUp={() => playButtonRef.current?.focus()}
              className="w-full h-1 accent-white cursor-pointer"
            />

            {/* Bottom row: play + right-side buttons */}
            <div className="flex items-center justify-between">
              {/* Left: play/pause/replay */}
              <div className="flex items-center gap-3">
                {isAtEnd ? (
                  <button
                    ref={playButtonRef}
                    onClick={() => {
                      setCurrentIndex(0);
                      setCalendarMonth(undefined);
                      setIsPlaying(true);
                    }}
                    className="text-white hover:text-gray-300 transition-colors focus:outline-none"
                    title="Replay"
                  >
                    <span className="material-symbols-outlined text-3xl">replay</span>
                  </button>
                ) : isPlaying ? (
                  <button
                    ref={playButtonRef}
                    onClick={() => setIsPlaying(false)}
                    className="text-white hover:text-gray-300 transition-colors focus:outline-none"
                    title="Pause"
                  >
                    <span className="material-symbols-outlined text-3xl">pause</span>
                  </button>
                ) : (
                  <button
                    ref={playButtonRef}
                    onClick={() => setIsPlaying(true)}
                    className="text-white hover:text-gray-300 transition-colors focus:outline-none"
                    title="Play"
                  >
                    <span className="material-symbols-outlined text-3xl">play_arrow</span>
                  </button>
                )}
              </div>

              {/* Right: speed + fullscreen */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <button
                    onClick={() => setShowSpeedMenu((prev) => !prev)}
                    className="text-white hover:text-gray-300 transition-colors"
                    title="Playback speed"
                  >
                    <span className="material-symbols-outlined text-2xl">speed</span>
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-full right-0 mb-2 flex flex-col items-end gap-1 bg-black/80 rounded-lg p-2">
                      {[0.25, 0.5, 1, 1.5, 2].map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            setSpeed(s);
                            setShowSpeedMenu(false);
                          }}
                          className={`text-xs px-2 py-0.5 rounded w-full text-right transition-colors ${
                            speed === s
                              ? 'bg-white text-black font-bold'
                              : 'text-white hover:text-gray-300'
                          }`}
                        >
                          {formatSpeed(s)}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleFullscreen}
                  className="text-white hover:text-gray-300 transition-colors"
                  title={isFullscreen || isFakeFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  <span className="material-symbols-outlined text-2xl">
                    {isFullscreen || isFakeFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="mt-6 flex justify-center">
          <div className="bg-gray-900 rounded-xl p-4 shadow-lg text-white">
            <DayPicker
              ISOWeek
              mode="single"
              month={displayMonth}
              onMonthChange={setCalendarMonth}
              selected={currentFrame?.date ? new Date(currentFrame.date) : undefined}
              onSelect={handleDateSelect}
              disabled={(date) => !(format(date, 'yyyy-MM-dd') in dateIndex)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
