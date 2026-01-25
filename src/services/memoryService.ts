export interface Memory {
    id: string;
    content: string;
    metadata?: any;
    similarity?: number;
    created_at?: string;
}

export const memoryService = {
    /**
     * Retrieves relevant memories for the given query via the backend API.
     */
    async recall(userId: string, query: string, sessionId: string): Promise<Memory[]> {
        try {
            const response = await fetch('/api/memory/recall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, query, sessionId })
            });

            if (!response.ok) return [];

            const data = await response.json();
            return data.memories || [];
        } catch (error) {
            console.error('Memory Recall Error:', error);
            return [];
        }
    },

    /**
     * Saves a fact to the user's persistent memory via the backend API.
     */
    async memorize(userId: string, text: string, sessionId: string, scope: 'session' | 'global' = 'session') {
        try {
            await fetch('/api/memory/memorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, text, sessionId, scope })
            });
        } catch (error) {
            console.error('Memory Memorize Error:', error);
        }
    }
};
