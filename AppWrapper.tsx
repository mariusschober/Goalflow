
import React, { useState, useEffect } from 'react';
import App from './App';
import { Auth } from './components/Auth';
import * as authService from './services/authService';

const AppWrapper: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const user = authService.getCurrentUser();
        setCurrentUser(user);
        setIsLoading(false);
    }, []);

    const handleLogin = (email: string) => {
        setCurrentUser(email);
    };

    const handleLogout = () => {
        authService.logout();
        setCurrentUser(null);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex justify-center items-center">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }
    
    if (!currentUser) {
        return <Auth onLoginSuccess={handleLogin} />;
    }

    return <App userEmail={currentUser} onLogout={handleLogout} />;
};

export default AppWrapper;
