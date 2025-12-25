
import React, { useState, FormEvent } from 'react';
import { Logo } from './Logo';
import * as authService from '../services/authService';

interface AuthProps {
  onLoginSuccess: (email: string) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      authService.loginWithEmail(email);
      // For the demo, we don't send a real code, just proceed to the next step.
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const success = authService.verifyCode(email, code);
    if (success) {
      onLoginSuccess(email);
    } else {
      setError('Invalid code. Please use the demo code.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full mx-auto">
            <div className="text-center mb-8">
                <Logo />
            </div>
            <div className="bg-white p-8 rounded-xl shadow-lg space-y-6">
                {step === 'email' ? (
                <form onSubmit={handleEmailSubmit} className="space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold text-center text-gray-800">Welcome to Goalflow</h2>
                        <p className="text-center text-gray-500 mt-2">Enter your email to login or create an account.</p>
                    </div>
                    <div>
                        <label htmlFor="email" className="sr-only">Email address</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg"
                            placeholder="Email address"
                        />
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-lg font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
                        >
                            {isLoading ? 'Sending...' : 'Continue'}
                        </button>
                    </div>
                </form>
                ) : (
                <form onSubmit={handleCodeSubmit} className="space-y-6">
                     <div>
                        <h2 className="text-2xl font-bold text-center text-gray-800">Enter Demo Code</h2>
                        <p className="text-center text-gray-500 mt-2">Use the demo code <strong className="text-gray-800">123456</strong> to sign in as <span className="font-medium text-gray-900">{email}</span>.</p>
                    </div>
                    <div>
                        <label htmlFor="code" className="sr-only">Login Code</label>
                        <input
                            id="code"
                            name="code"
                            type="text"
                            maxLength={6}
                            required
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg text-center tracking-[0.5em]"
                            placeholder="______"
                        />
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                     <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-lg font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
                        >
                            {isLoading ? 'Verifying...' : 'Login'}
                        </button>
                    </div>
                    <div className="text-center">
                        <button type="button" onClick={() => { setStep('email'); setError(null); setCode('')}} className="font-medium text-indigo-600 hover:text-indigo-500">
                           Use a different email
                        </button>
                    </div>
                </form>
                )}
            </div>
        </div>
    </div>
  );
};
