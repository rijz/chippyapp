// Basic script to test the memory endpoints (server-side)
// Usage: node scripts/test-memory.js

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8080'; // Ensure your server is running
const USER_ID = '00000000-0000-0000-0000-000000000000'; // Valid UUID for testing
const SESSION_ID = 'session-1';

async function testMemory() {
    console.log('🧪 Testing Persistent Memory Endpoints...');
    console.log('User ID:', USER_ID);

    // 1. Memorize a fact
    const fact = "My favorite color is Blue.";
    console.log(`\n1. Memorizing: "${fact}"...`);

    const memRes = await fetch(`${BASE_URL}/api/memory/memorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: USER_ID,
            text: fact,
            sessionId: SESSION_ID,
            scope: 'session'
        })
    });

    if (!memRes.ok) {
        console.error('Memorize failed:', await memRes.text());
        return;
    }
    console.log('✅ Memorized successfully.');

    // Wait a moment for indexing (optional, usually instant for small vectors)
    await new Promise(r => setTimeout(r, 1000));

    // 2. Recall the fact
    const query = "What is my favorite color?";
    console.log(`\n2. Recalling: "${query}"...`);

    const recallRes = await fetch(`${BASE_URL}/api/memory/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: USER_ID,
            query: query,
            sessionId: SESSION_ID
        })
    });

    if (!recallRes.ok) {
        console.error('Recall failed:', await recallRes.text());
        return;
    }

    const data = await recallRes.json();
    console.log('Recall Result:', JSON.stringify(data, null, 2));

    if (data.memories.length > 0 && data.memories[0].content === fact) {
        console.log('\n🎉 SUCCESS: The bot remembered the fact!');
    } else {
        console.log('\n⚠️ WARNING: Fact was not retrieved correctly. Check threshold or embedding model.');
    }
}

testMemory().catch(console.error);
