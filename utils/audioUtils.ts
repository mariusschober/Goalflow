
let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  
  if (audioCtx && audioCtx.state !== 'closed') {
      return audioCtx;
  }

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  
  audioCtx = new AudioContextClass();
  return audioCtx;
};

const playSound = (frequency: number, type: OscillatorType, duration: number, startTime: number = 0, volume: number = 0.1) => {
  try {
    const audioContext = getAudioContext();
    if (!audioContext) return;

    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + startTime);
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime + startTime); // volume
    
    // Fade out
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + startTime + duration);

    oscillator.start(audioContext.currentTime + startTime);
    oscillator.stop(audioContext.currentTime + startTime + duration);
  } catch(e) {
    console.error("Could not play sound", e);
  }
};

export const playCompleteSound = () => {
  // A higher, pleasant ping
  playSound(880, 'sine', 0.2);
  playSound(1046.50, 'sine', 0.2, 0.1); // C6
};

export const playSkipSound = () => {
  // A lower, duller sound
  playSound(220, 'square', 0.15);
};

export const playFrogCompleteSound = () => {
  // A triumphant, multi-tone arpeggio for a big win
  try {
      const audioContext = getAudioContext();
      if (!audioContext) return;
      
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
      
      const now = audioContext.currentTime;
      
      // Helper inside since we need precise timing on same context
      const playNote = (freq: number, time: number, dur: number) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.1, time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
          osc.start(time);
          osc.stop(time + dur);
      };

      playNote(523.25, now, 0.15); // C5
      playNote(659.25, now + 0.1, 0.15); // E5
      playNote(783.99, now + 0.2, 0.15); // G5
      playNote(1046.50, now + 0.3, 0.4); // C6
  } catch (e) {
      console.error("Error playing frog sound", e);
  }
};

export const playAlarmSound = () => {
    // Digital alarm clock style beep-beep-beep
    try {
        const audioContext = getAudioContext();
        if (!audioContext) return;
        
        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }

        const now = audioContext.currentTime;
        const beep = (time: number) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.type = 'square';
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.1, time);
            gain.gain.setValueAtTime(0.1, time + 0.1);
            gain.gain.linearRampToValueAtTime(0, time + 0.15);
            osc.start(time);
            osc.stop(time + 0.15);
        };

        beep(now);
        beep(now + 0.2);
        beep(now + 0.4);
        beep(now + 1.0); // Repeat pattern
        beep(now + 1.2);
        beep(now + 1.4);
    } catch (e) {
        console.error("Error playing alarm sound", e);
    }
};

export const playHoverSound = () => {
    // Very subtle tick/click for UI interactions
    playSound(400, 'sine', 0.05, 0, 0.02);
};

export const playSelectSound = () => {
    // Soft pop for selections
    playSound(600, 'sine', 0.1, 0, 0.05);
};

export const playLevelUpSound = () => {
    // Grand fanfare
    try {
      const audioContext = getAudioContext();
      if (!audioContext) return;
      
      const now = audioContext.currentTime;
      const play = (f: number, t: number, d: number) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.type = 'triangle';
          osc.frequency.value = f;
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + d);
          osc.start(t);
          osc.stop(t + d);
      };
      
      play(523.25, now, 0.3); // C5
      play(659.25, now + 0.1, 0.3); // E5
      play(783.99, now + 0.2, 0.3); // G5
      play(1046.50, now + 0.4, 0.6); // C6
      play(1318.51, now + 0.5, 0.8); // E6
    } catch(e) {}
};
