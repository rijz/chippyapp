export const getEnv = (key: string): string => {
    // Check runtime injected env (Docker/Production)
    if (typeof window !== 'undefined' && (window as any).__ENV__ && (window as any).__ENV__[key]) {
        return (window as any).__ENV__[key];
    }

    // Fallback to build-time env (Dev/Local)
    return import.meta.env[key] || '';
};
