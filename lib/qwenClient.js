

/**
 * Creates a new chat session in Qwen.
 * @param {string} token - The auth token.
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<string>} The new chat_id.
 */
export async function createNewChat(token, signal) {
    const res = await fetch("https://chat.qwen.ai/api/v2/chats/new", {
        method: "POST",
        signal,
        headers: {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "Origin": "https://chat.qwen.ai",
            "Referer": "https://chat.qwen.ai/c/new-chat",
            "Cookie": `token=${token}`
        },
        body: JSON.stringify({
            title: "New Chat",
            models: ["qwen3.7-plus"], // We can make this dynamic if needed
            chat_mode: "normal",
            chat_type: "t2t",
            timestamp: Date.now(),
            project_id: ""
        })
    });

    if (!res.ok) {
        throw new Error(`Failed to create new chat. Status: ${res.status}`);
    }

    const data = await res.json();
    if (!data.success || !data.data || !data.data.id) {
        throw new Error("Invalid response format when creating new chat");
    }

    return data.data.id;
}

/**
 * Sends a chat completion request to Qwen and yields Server-Sent Events (SSE).
 * @param {string} token 
 * @param {Object} payload 
 * @param {AbortSignal} [signal] 
 */
export async function* sendChatMessage(token, payload, signal) {
    const res = await fetch(`https://chat.qwen.ai/api/v2/chat/completions?chat_id=${payload.chat_id}`, {
        method: "POST",
        signal,
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "Origin": "https://chat.qwen.ai",
            "Cookie": `token=${token}`
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        throw new Error(`Upstream Qwen API error: ${res.status} ${res.statusText}`);
    }

    // Node 20 / node-fetch streams response body
    // We implement the TCP-fragment-proof SSE parser
    const rb = res.body;
    let buffer = '';

    // Determine how to read the stream depending on if it's native fetch (ReadableStream) or node-fetch (NodeJS.ReadableStream)
    const isNativeFetch = typeof rb.getReader === 'function';
    
    if (isNativeFetch) {
        const reader = rb.getReader();
        const decoder = new TextDecoder("utf-8");
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            // Process buffer
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep partial line

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        yield parsed;
                    } catch (e) {
                        // In case of incomplete JSON, though SSE data lines should be fully formed.
                        // If it spans multiple data lines, Qwen doesn't typically do that, but just in case.
                    }
                }
            }
        }
    } else {
        // Node.js stream for node-fetch
        for await (const chunk of rb) {
            buffer += chunk.toString('utf-8');
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        yield parsed;
                    } catch (e) {
                        // ignore unparseable
                    }
                }
            }
        }
    }
}
