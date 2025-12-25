

import { useRef, useCallback, useEffect } from 'react';

export const useTickingSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
        if (typeof window !== 'undefined') {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                audioContextRef.current = new AudioContextClass();
            }
        }
    } catch(e) {
        console.error("Could not create audio context", e);
    }
    
    return () => {
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
        }
    }
  }, []);

  const playTick = useCallback((volumeMultiplier: number = 1.0) => {
    const context = audioContextRef.current;
    if (!context) return;

    if (context.state === 'suspended') {
        context.resume().catch(console.error);
    }
    
    // Create a very short buffer of white noise
    const bufferSize = context.sampleRate * 0.05; // 50ms
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = buffer;

    // Create a bandpass filter to make it sound more like a 'tick'
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, context.currentTime);
    filter.Q.setValueAtTime(20, context.currentTime);

    // Create a gain node for a sharp volume envelope
    const gainNode = context.createGain();
    
    // Increased base volume from 0.3 to 0.6
    const baseVolume = 0.6;
    const finalVolume = baseVolume * Math.max(0, volumeMultiplier);
    
    gainNode.gain.setValueAtTime(finalVolume, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.04);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(context.destination);
    
    noiseSource.start(context.currentTime);
    noiseSource.stop(context.currentTime + 0.05);
  }, []);

  return { playTick };
};