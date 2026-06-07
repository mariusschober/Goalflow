
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { HeartIcon, SparklesIcon, ScaleIcon, CheckIcon, EyeIcon, ShieldIcon, Volume2Icon, BrainCircuit, ZapIcon } from './Icons';
import { TrueNorthGoal } from '../types';
import { reduceImportanceWithGemini, ImportanceReductionResult, getOuterIntentionRecommendations, OuterIntentionResult } from '../services/geminiService';

interface TrueNorthAssessmentProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (data: Omit<TrueNorthGoal, 'id' | 'createdAt'>) => void;
    isAiEnabled?: boolean;
}

type Step = 'vision' | 'congruence' | 'blueprint' | 'safetynet' | 'outerintention' | 'commit';

export const TrueNorthAssessment: React.FC<TrueNorthAssessmentProps> = ({ isOpen, onClose, onComplete, isAiEnabled = true }) => {
    const [step, setStep] = useState<Step>('vision');
    const [vision, setVision] = useState('');
    const [congruenceComfort, setCongruenceComfort] = useState<boolean | null>(null);
    const [congruencePrestige, setCongruencePrestige] = useState<boolean | null>(null);
    const [isMoneyGoal, setIsMoneyGoal] = useState(false);
    const [sensoryDetails, setSensoryDetails] = useState('');
    const [planB, setPlanB] = useState('');
    const [importance, setImportance] = useState(5);

    // Phase 4 Outer Intention states
    const [anchorHabit, setAnchorHabit] = useState('');
    const [anchorTask, setAnchorTask] = useState('');
    const [anchorHabitDuration, setAnchorHabitDuration] = useState(15);
    const [suggestions, setSuggestions] = useState<OuterIntentionResult | null>(null);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

    // AI Advice State
    const [advice, setAdvice] = useState<ImportanceReductionResult | null>(null);
    const [isLoadingAdvice, setIsLoadingAdvice] = useState(false);
    const [adviceError, setAdviceError] = useState<string | null>(null);

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
            setImportance(5);
            setAnchorHabit('');
            setAnchorTask('');
            setAnchorHabitDuration(15);
            setSuggestions(null);
            setSuggestionsError(null);
            setAdvice(null);
            setAdviceError(null);
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

    const handleGetAdvice = async () => {
        setIsLoadingAdvice(true);
        setAdviceError(null);
        try {
            const res = await reduceImportanceWithGemini(vision, sensoryDetails, planB, importance);
            setAdvice(res);
        } catch (err: any) {
            setAdviceError(err?.message || "Failed to load advice.");
        } finally {
            setIsLoadingAdvice(false);
        }
    };

    const handleGetSuggestions = async () => {
        setIsLoadingSuggestions(true);
        setSuggestionsError(null);
        try {
            const res = await getOuterIntentionRecommendations(vision, sensoryDetails);
            setSuggestions(res);
            if (res.suggestedHabit) setAnchorHabit(res.suggestedHabit);
            if (res.suggestedTasks && res.suggestedTasks.length > 0) setAnchorTask(res.suggestedTasks[0]);
        } catch (err: any) {
            setSuggestionsError(err?.message || "Failed to load outer intention recommendations.");
        } finally {
            setIsLoadingSuggestions(false);
        }
    };

    const handleCommit = () => {
        onComplete({
            vision,
            isMoneyGoal: false, // Force false as we ensured it's not a raw money goal
            tangibleReality: "", // Merged into vision
            sensoryDetails,
            planB,
            importance, // Dynamic selection!
            anchorHabit: anchorHabit.trim() || undefined,
            anchorTask: anchorTask.trim() || undefined,
            anchorHabitDuration: anchorHabit.trim() ? anchorHabitDuration : undefined
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
                        <div className="space-y-6 animate-slideIn max-w-2xl mx-auto">
                            <div className="text-center space-y-1">
                                <h3 className="text-xl font-bold text-amber-100 font-heading">Phase 3: Managing Importance</h3>
                                <p className="text-slate-400 text-xs sm:text-sm">Neutralize "excess potential" (attachment) by embracing failure and formulating routine actions.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                                {/* Left column: Plan B & Importance Slider */}
                                <div className="md:col-span-7 bg-slate-800/35 p-5 rounded-2xl border border-white/5 space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-amber-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <ShieldIcon className="w-4 h-4 text-amber-500" />
                                            Safety Net (Plan B)
                                        </label>
                                        <textarea 
                                            value={planB}
                                            onChange={(e) => setPlanB(e.target.value)}
                                            placeholder="Write your constructive safety net. (If this outcome doesn't happen, what is your fallback reality? How do you remain okay?)"
                                            className="w-full h-32 bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none"
                                        />
                                    </div>

                                    {/* Importance slider */}
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                                <ScaleIcon className="w-4 h-4 text-rose-500" />
                                                Importance Dial
                                            </label>
                                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${importance > 7 ? 'bg-red-950/40 text-red-400 border border-red-500/30' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'}`}>
                                                {importance}/10
                                            </span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="1" 
                                            max="10" 
                                            value={importance}
                                            onChange={(e) => setImportance(parseInt(e.target.value))}
                                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed font-medium">
                                            {importance <= 3 && "🟢 Lowest pressure: Ideal 'mailbox-state' (outer intention flows easily)."}
                                            {importance >= 4 && importance <= 7 && "🟡 Moderate pressure: Natural attachments. Mindfulness recommended."}
                                            {importance >= 8 && "🛑 Excessive Potential! Beware of mental blockade and resistance forces."}
                                        </p>
                                    </div>
                                </div>

                                {/* Right column: AI de-escalator advisor */}
                                <div className="md:col-span-5 flex flex-col justify-between">
                                    {isAiEnabled ? (
                                        <div className="bg-[#111827] p-4 border border-dashed border-white/10 rounded-2xl text-center space-y-3 flex flex-col justify-center h-full min-h-[160px] relative overflow-hidden">
                                            {!advice && !isLoadingAdvice && (
                                                <div className="space-y-3">
                                                    <p className="text-xs text-slate-400 leading-relaxed">
                                                        Too much desire and fear of failure blocks outer intention. Let the AI coach inspect your objective to release target attachments.
                                                    </p>
                                                    <button
                                                        onClick={handleGetAdvice}
                                                        disabled={!planB.trim()}
                                                        className="w-full py-2.5 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-500/10 transition flex items-center justify-center gap-1.5 focus:outline-none"
                                                    >
                                                        <BrainCircuit className="w-4 h-4 text-white" />
                                                        Neutralize Importance
                                                    </button>
                                                </div>
                                            )}

                                            {isLoadingAdvice && (
                                                <div className="flex flex-col items-center justify-center py-6">
                                                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                                    <p className="text-xs text-slate-400">Balancing desire pendulums...</p>
                                                </div>
                                            )}

                                            {advice && (
                                                <div className="text-left space-y-3 bg-amber-950/15 border border-amber-500/25 p-4 rounded-xl animate-fadeIn custom-scrollbar overflow-y-auto max-h-[180px]">
                                                    <div>
                                                        <h5 className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                                            <span>📥</span> Mailbox State Reframe
                                                        </h5>
                                                        <p className="text-[11px] text-slate-300 leading-tight italic">
                                                            "{advice.reframing}"
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <h5 className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                                            <span>⚡</span> Dissolver Exercise
                                                        </h5>
                                                        <p className="text-[11px] text-slate-400 leading-tight">
                                                            {advice.importanceExercise}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {adviceError && (
                                                <p className="text-xs text-red-400 font-medium">
                                                    {adviceError}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-800/20 p-5 rounded-2xl border border-white/5 space-y-3 h-full flex flex-col justify-center">
                                            <h4 className="text-xs font-bold uppercase text-amber-500 tracking-wider">Zeland Counsel</h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">
                                                By choosing failure as an acceptable path (Plan B), you pull the rug from underneath the destructive pendulums that feed on your frustration and desperation.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-between pt-4 border-t border-white/5">
                                <button onClick={() => setStep('blueprint')} className="text-slate-400 hover:text-white font-medium px-4 text-sm">Back</button>
                                <button 
                                    disabled={!planB.trim()} 
                                    onClick={() => {
                                        setStep('outerintention');
                                        if (isAiEnabled && !suggestions) {
                                            handleGetSuggestions();
                                        }
                                    }} 
                                    className="px-8 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-500 transition disabled:opacity-50 shadow-lg shadow-amber-900/20 text-sm"
                                >
                                    Define Action Anchors →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 5: OUTER INTENTION */}
                    {step === 'outerintention' && (
                        <div className="flex flex-col h-full space-y-6 animate-fadeIn">
                            <div className="text-center space-y-1.5 shrink-0">
                                <h3 className="text-2xl font-heading font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-white">Phase 4: Coordination of Intention</h3>
                                <p className="text-slate-400 text-xs">Establish concrete physical anchors to align with your chosen script.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 overflow-hidden flex-grow min-h-0">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <span>🔄</span> Dynamic Anchor Habit (Recurring)
                                        </label>
                                        <input 
                                            value={anchorHabit}
                                            onChange={(e) => setAnchorHabit(e.target.value)}
                                            className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                            placeholder="e.g., Draw sketches for 15 minutes daily..."
                                        />
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-1.5">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                                <span>⏱️</span> Habit Duration: <strong className="text-amber-400">{anchorHabitDuration} mins</strong>
                                            </label>
                                        </div>
                                        <input 
                                            type="range"
                                            min="5"
                                            max="120"
                                            step="5"
                                            value={anchorHabitDuration}
                                            onChange={(e) => setAnchorHabitDuration(parseInt(e.target.value))}
                                            className="w-full bg-slate-800 rounded-lg h-1.5 appearance-none cursor-pointer accent-amber-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <span>⚡</span> First Action Step (One-off)
                                        </label>
                                        <input 
                                            value={anchorTask}
                                            onChange={(e) => setAnchorTask(e.target.value)}
                                            className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                            placeholder="e.g., Order notebook, schedule interview..."
                                        />
                                    </div>
                                    <div className="p-3 bg-slate-800/40 rounded-xl border border-white/5">
                                        <p className="text-[10px] text-slate-400 leading-relaxed italic">
                                            💡 <strong>Active Intent:</strong> Completing this physical action within 24 hours signals the subconscious that you have stepped off the curb and are actively marching toward this goal.
                                        </p>
                                    </div>
                                </div>

                                <div className="border border-white/5 bg-[#141b2a]/60 rounded-2xl p-5 flex flex-col justify-between overflow-hidden">
                                    <div className="flex-grow overflow-y-auto custom-scrollbar pr-1">
                                        <div className="flex items-center gap-2 mb-3 text-amber-500 text-xs font-bold uppercase tracking-wider">
                                            <BrainCircuit className="w-4 h-4 text-amber-500" />
                                            <span>Subconscious Anchor Coach (AI)</span>
                                        </div>

                                        {isLoadingSuggestions ? (
                                            <div className="flex flex-col items-center justify-center py-12">
                                                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                                <p className="text-xs text-slate-400 text-center font-medium">Channeling outer intention vectors...</p>
                                            </div>
                                        ) : suggestions ? (
                                            <div className="space-y-4">
                                                <div 
                                                    onClick={() => setAnchorHabit(suggestions.suggestedHabit)}
                                                    className="p-3 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20 rounded-xl transition cursor-pointer text-left"
                                                >
                                                    <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold flex items-center gap-1 mb-1">
                                                        <span>📥</span> Suggested Habit (Click to Apply)
                                                    </span>
                                                    <h5 className="text-xs font-bold text-white mb-1">{suggestions.suggestedHabit}</h5>
                                                    <p className="text-[10px] text-slate-400 leading-relaxed italic">"{suggestions.suggestedHabitReason}"</p>
                                                </div>

                                                <div className="space-y-2">
                                                    <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
                                                        <span>⚡</span> Suggested 24H Quickies (Click to Copy as Action)
                                                    </span>
                                                    {suggestions.suggestedTasks.map((task, i) => (
                                                        <button 
                                                            key={i}
                                                            type="button"
                                                            onClick={() => setAnchorTask(task)}
                                                            className="w-full p-2.5 bg-slate-800 hover:bg-slate-700/60 text-left text-xs text-slate-300 font-medium rounded-lg border border-white/5 hover:border-amber-500/20 transition flex items-start gap-1.5"
                                                        >
                                                            <span>•</span>
                                                            <span>{task}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                                <p className="text-xs text-slate-400 mb-3">Ask Gemini for tailored Physical Anchor Suggestions based on your blueprint.</p>
                                                <button
                                                    type="button"
                                                    onClick={handleGetSuggestions}
                                                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs rounded-xl transition"
                                                >
                                                    Consult Action Coach
                                                </button>
                                            </div>
                                        )}

                                        {suggestionsError && (
                                            <p className="text-xs text-red-400 mt-2 font-medium">{suggestionsError}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between pt-4 border-t border-white/5 shrink-0">
                                <button onClick={() => setStep('safetynet')} className="text-slate-400 hover:text-white font-medium px-4 text-sm">Back</button>
                                <button 
                                    disabled={!anchorHabit.trim() && !anchorTask.trim()} 
                                    onClick={() => setStep('commit')} 
                                    className="px-8 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-500 transition disabled:opacity-50 shadow-lg shadow-amber-900/20 text-sm"
                                >
                                    Proceed to Choice →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 6: COMMIT */}
                    {step === 'commit' && (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-fadeIn max-w-lg mx-auto">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-b from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_0_60px_rgba(245,158,11,0.4)] animate-pulse">
                                <CheckIcon className="w-12 h-12 text-white" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-3xl font-heading font-bold text-white">I Choose This Reality.</h3>
                                <p className="text-slate-400">No wishing. No fighting. Pure intention.</p>
                            </div>
                            <div className="bg-slate-800/50 p-6 rounded-2xl border border-amber-500/20 w-full text-left space-y-3.5">
                                <div>
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500">My Choice Vision</span>
                                    <p className="text-amber-400 font-bold text-xl leading-snug mt-0.5">{vision}</p>
                                </div>
                                <div className="h-px bg-white/10"></div>
                                <div className="text-sm space-y-2.5">
                                    <p className="text-slate-300 leading-relaxed"><strong>Blueprint:</strong> {sensoryDetails}</p>
                                    <p className="text-slate-400 leading-relaxed"><strong>Plan B:</strong> {planB}</p>
                                    <div className="flex items-center gap-2 text-xs text-rose-400/90 font-medium">
                                        <ScaleIcon className="w-3.5 h-3.5" />
                                        <span>Target Importance: <strong className="text-white">{importance}/10</strong> {importance > 7 ? '(Excess potential neutralized by Plan B)' : '(Mailbox state)'}</span>
                                    </div>
                                    {(anchorHabit || anchorTask) && (
                                        <>
                                            <div className="h-px bg-white/10 my-2"></div>
                                            <div className="space-y-1.5 text-xs">
                                                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 block">Outer Intention Anchors (Phase 4)</span>
                                                {anchorHabit && (
                                                    <p className="text-slate-300">
                                                        <strong>Habit:</strong> {anchorHabit} <span className="text-slate-500 font-normal">({anchorHabitDuration} mins/day)</span>
                                                    </p>
                                                )}
                                                {anchorTask && (
                                                    <p className="text-slate-300">
                                                        <strong>First Action:</strong> {anchorTask}
                                                    </p>
                                                )}
                                                <div className="text-[10px] text-indigo-400 font-bold flex items-center gap-1.5 pt-1 animate-pulse">
                                                    <span>➕</span> Auto-enrolling habit & action step on confirm
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
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
