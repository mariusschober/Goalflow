
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { HeartIcon, SparklesIcon, ScaleIcon, CheckIcon, EyeIcon, ShieldIcon, Volume2Icon } from './Icons';
import { TrueNorthGoal } from '../types';

interface TrueNorthAssessmentProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (data: Omit<TrueNorthGoal, 'id' | 'createdAt'>) => void;
}

type Step = 'vision' | 'congruence' | 'blueprint' | 'safetynet' | 'commit';

export const TrueNorthAssessment: React.FC<TrueNorthAssessmentProps> = ({ isOpen, onClose, onComplete }) => {
    const [step, setStep] = useState<Step>('vision');
    const [vision, setVision] = useState('');
    const [congruenceComfort, setCongruenceComfort] = useState<boolean | null>(null);
    const [congruencePrestige, setCongruencePrestige] = useState<boolean | null>(null);
    const [isMoneyGoal, setIsMoneyGoal] = useState(false);
    const [sensoryDetails, setSensoryDetails] = useState('');
    const [planB, setPlanB] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setStep('vision');
            setVision('');
            setCongruenceComfort(null);
            setCongruencePrestige(null);
            setIsMoneyGoal(false);
            setSensoryDetails('');
            setPlanB('');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleCommit = () => {
        onComplete({
            vision,
            isMoneyGoal: false, // Force false as we ensured it's not a raw money goal
            tangibleReality: "", // Merged into vision
            sensoryDetails,
            planB,
            importance: 5 // Default medium importance
        });
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 h-screen w-screen bg-slate-900/95 z-[9999] flex items-center justify-center p-0 sm:p-6 animate-fadeIn backdrop-blur-md">
            <div className="w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] bg-[#0f172a] sm:rounded-3xl border-0 sm:border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.1)] relative flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-6 sm:p-8 border-b border-white/5 flex justify-between items-center shrink-0 bg-gradient-to-r from-[#0f172a] to-[#1e293b]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center text-slate-900 shadow-lg shadow-amber-500/20 shrink-0">
                            <SparklesIcon className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl sm:text-2xl font-heading font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-white tracking-wide">
                            Conscious Creation Navigator
                        </h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition p-2 rounded-full hover:bg-white/10">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto custom-scrollbar p-6 sm:p-10 text-white">
                    
                    {/* STEP 1: VISION */}
                    {step === 'vision' && (
                        <div className="space-y-8 animate-slideIn max-w-xl mx-auto">
                            <div className="text-center space-y-2">
                                <h3 className="text-xl font-bold text-amber-100">Phase 1: Authentic Vision</h3>
                                <p className="text-slate-400">Identify the goal that turns your life into a celebration.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-amber-500 uppercase tracking-wider mb-3">Your Ultimate Vision</label>
                                <input 
                                    ref={inputRef}
                                    type="text" 
                                    value={vision}
                                    onChange={(e) => setVision(e.target.value)}
                                    placeholder="What outcome makes your soul sing?"
                                    className="w-full bg-slate-800/50 border border-white/10 rounded-xl p-4 text-lg text-white placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition"
                                />
                            </div>
                            
                            <div className="space-y-4">
                                <div 
                                    className={`flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer select-none ${isMoneyGoal ? 'bg-red-900/10 border-red-500/50' : 'bg-slate-800/30 border-white/5 hover:bg-slate-800/50'}`} 
                                    onClick={() => setIsMoneyGoal(!isMoneyGoal)}
                                >
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isMoneyGoal ? 'bg-red-500 border-red-500' : 'border-slate-600 bg-slate-700'}`}>
                                        {isMoneyGoal && <CheckIcon className="w-3 h-3 text-white" />}
                                    </div>
                                    <div>
                                        <label className="text-sm text-slate-300 cursor-pointer font-bold block">This is defined by a financial number (e.g. $1M)</label>
                                    </div>
                                </div>

                                {isMoneyGoal && (
                                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-3 animate-fadeIn">
                                        <span className="text-xl">🛑</span>
                                        <div className="text-sm text-red-200 leading-relaxed">
                                            <p className="font-bold mb-1">Money is an attribute, not the goal.</p>
                                            <p className="opacity-80">
                                                The heart/soul does not understand abstract numbers. You cannot proceed until you rewrite your vision to describe the <em>tangible reality</em> (the house, the freedom, the lifestyle) that this money represents.
                                            </p>
                                            <p className="mt-2 font-bold text-white">Action: Rewrite your vision above, then uncheck the box.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end pt-4">
                                <button 
                                    disabled={!vision.trim() || isMoneyGoal} 
                                    onClick={() => setStep('congruence')} 
                                    className="px-8 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-500 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-amber-900/20 disabled:shadow-none"
                                >
                                    Next: Check Alignment →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: CONGRUENCE */}
                    {step === 'congruence' && (
                        <div className="space-y-8 animate-slideIn max-w-xl mx-auto">
                            <div className="text-center space-y-2">
                                <h3 className="text-xl font-bold text-amber-100">Phase 1: Inner Congruence</h3>
                                <p className="text-slate-400">Ensure this goal comes from you, not external pressure.</p>
                            </div>
                            <div className="grid gap-4">
                                <div className="bg-slate-800/50 p-6 rounded-xl border border-white/5">
                                    <p className="font-bold mb-4 text-sm sm:text-base">1. Does this feel like an enforced obligation?</p>
                                    <div className="flex gap-3">
                                        <button onClick={() => setCongruenceComfort(true)} className={`flex-1 p-3 rounded-lg border text-sm font-bold transition-all ${congruenceComfort === true ? 'bg-red-900/40 border-red-500 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}>Yes, it feels heavy.</button>
                                        <button onClick={() => setCongruenceComfort(false)} className={`flex-1 p-3 rounded-lg border text-sm font-bold transition-all ${congruenceComfort === false ? 'bg-green-900/40 border-green-500 text-green-200' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}>No, it feels exciting.</button>
                                    </div>
                                </div>
                                <div className="bg-slate-800/50 p-6 rounded-xl border border-white/5">
                                    <p className="font-bold mb-4 text-sm sm:text-base">2. Is the main motivation to prove something or gain prestige?</p>
                                    <div className="flex gap-3">
                                        <button onClick={() => setCongruencePrestige(true)} className={`flex-1 p-3 rounded-lg border text-sm font-bold transition-all ${congruencePrestige === true ? 'bg-red-900/40 border-red-500 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}>Yes, mainly for others.</button>
                                        <button onClick={() => setCongruencePrestige(false)} className={`flex-1 p-3 rounded-lg border text-sm font-bold transition-all ${congruencePrestige === false ? 'bg-green-900/40 border-green-500 text-green-200' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}>No, it's for me.</button>
                                    </div>
                                </div>
                            </div>
                            {(congruenceComfort === true || congruencePrestige === true) && (
                                <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-center text-red-200 text-sm animate-fadeIn">
                                    ⚠️ Warning: This goal may be a result of external expectations. It will be harder to achieve. Consider revising.
                                </div>
                            )}
                            <div className="flex justify-between pt-4">
                                <button onClick={() => setStep('vision')} className="text-slate-400 hover:text-white font-medium px-4">Back</button>
                                <button disabled={congruenceComfort === null || congruencePrestige === null} onClick={() => setStep('blueprint')} className="px-8 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-500 transition disabled:opacity-50 shadow-lg shadow-amber-900/20">Next →</button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: BLUEPRINT */}
                    {step === 'blueprint' && (
                        <div className="space-y-8 animate-slideIn max-w-xl mx-auto">
                            <div className="text-center space-y-2">
                                <h3 className="text-xl font-bold text-amber-100">Phase 2: Mental Blueprint</h3>
                                <p className="text-slate-400">Create the scene of the goal as a <strong>fait accompli</strong> (already done).</p>
                            </div>
                            <div>
                                <div className="flex items-center justify-center gap-4 text-slate-500 mb-4">
                                    <span className="flex items-center gap-1 text-[10px] uppercase font-bold"><EyeIcon className="w-4 h-4"/> Sight</span>
                                    <span className="flex items-center gap-1 text-[10px] uppercase font-bold"><Volume2Icon className="w-4 h-4"/> Sound</span>
                                    <span className="flex items-center gap-1 text-[10px] uppercase font-bold"><HeartIcon className="w-4 h-4"/> Feeling</span>
                                </div>
                                <textarea 
                                    value={sensoryDetails}
                                    onChange={(e) => setSensoryDetails(e.target.value)}
                                    placeholder="Describe the scene vividly. What do you see? What do you hear? How does the steering wheel feel in your hands?"
                                    className="w-full h-48 bg-slate-800/50 border border-white/10 rounded-xl p-4 text-lg text-white placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none"
                                />
                            </div>
                            <div className="flex justify-between pt-4">
                                <button onClick={() => setStep('congruence')} className="text-slate-400 hover:text-white font-medium px-4">Back</button>
                                <button disabled={!sensoryDetails.trim()} onClick={() => setStep('safetynet')} className="px-8 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-500 transition disabled:opacity-50 shadow-lg shadow-amber-900/20">Next →</button>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: SAFETY NET */}
                    {step === 'safetynet' && (
                        <div className="space-y-8 animate-slideIn max-w-xl mx-auto">
                            <div className="text-center space-y-2">
                                <h3 className="text-xl font-bold text-amber-100">Phase 3: Managing Importance</h3>
                                <p className="text-slate-400">Accept the possibility of failure to neutralize anxiety. What is your Plan B?</p>
                            </div>
                            <div className="bg-slate-800/50 p-6 rounded-2xl border border-white/5 text-center">
                                <ShieldIcon className="w-12 h-12 text-amber-500 mx-auto mb-4 opacity-80" />
                                <textarea 
                                    value={planB}
                                    onChange={(e) => setPlanB(e.target.value)}
                                    placeholder="If this doesn't happen, I will..."
                                    className="w-full h-32 bg-transparent border-none text-center text-white placeholder-slate-600 focus:ring-0 text-lg resize-none"
                                />
                            </div>
                            <div className="flex justify-between pt-4">
                                <button onClick={() => setStep('blueprint')} className="text-slate-400 hover:text-white font-medium px-4">Back</button>
                                <button disabled={!planB.trim()} onClick={() => setStep('commit')} className="px-8 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-500 transition disabled:opacity-50 shadow-lg shadow-amber-900/20">Review & Commit →</button>
                            </div>
                        </div>
                    )}

                    {/* STEP 5: COMMIT */}
                    {step === 'commit' && (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-fadeIn max-w-lg mx-auto">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-b from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_0_60px_rgba(245,158,11,0.4)] animate-pulse">
                                <CheckIcon className="w-12 h-12 text-white" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-3xl font-heading font-bold text-white">I Choose This Reality.</h3>
                                <p className="text-slate-400">No wishing. No fighting. Pure intention.</p>
                            </div>
                            <div className="bg-slate-800/50 p-6 rounded-2xl border border-amber-500/20 w-full text-left">
                                <p className="text-amber-400 font-bold text-lg mb-1">{vision}</p>
                                <div className="h-px bg-white/10 mb-4"></div>
                                <p className="text-slate-300 text-sm mb-2"><strong>Blueprint:</strong> {sensoryDetails}</p>
                                <p className="text-slate-500 text-xs"><strong>Safety Net:</strong> {planB}</p>
                            </div>
                            <button onClick={handleCommit} className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-heading text-2xl font-bold rounded-2xl shadow-xl hover:scale-105 transition-all duration-300">
                                CONFIRM CHOICE
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
