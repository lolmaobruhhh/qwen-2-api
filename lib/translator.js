export function createOpenAIChunk(responseId, model, content) {
    if (!content) return null;
    
    return `data: ${JSON.stringify({
        id: responseId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: model || "qwen3.7-plus",
        choices: [{
            index: 0,
            delta: { content: content }
        }]
    })}\n\n`;
}

// ── Parse directives for Qwen Thinking Mode ──
export function parseDirectives(messages) {
    // Defaults matching user preference:
    let autoThinking = true;
    let thinkingMode = "Auto"; // "Auto" | "Thinking" | "Fast"
    let thinkingEnabled = true;

    const cleaned = [];
    
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            lastUserIndex = i;
            break;
        }
    }

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role === 'system' || (msg.role === 'user' && i === lastUserIndex)) {
            let content = msg.content || '';
            const isTarget = true;

            const thinkMatch = content.match(/\[think\s*=\s*(on|off|true|false|1|0|thinking|fast|auto)\]/gi);
            if (thinkMatch && isTarget) {
                const val = thinkMatch[thinkMatch.length - 1].split('=')[1].trim().toLowerCase();
                
                if (['off', 'false', '0'].includes(val)) {
                    thinkingEnabled = false;
                    autoThinking = false;
                } else if (['fast'].includes(val)) {
                    thinkingEnabled = true;
                    autoThinking = false;
                    thinkingMode = "Fast";
                } else if (['auto'].includes(val)) {
                    thinkingEnabled = true;
                    autoThinking = true;
                    thinkingMode = "Auto";
                } else { // 'on', 'true', '1', 'thinking'
                    thinkingEnabled = true;
                    autoThinking = false;
                    thinkingMode = "Thinking";
                }
            }

            content = content.replace(/\[think\s*=\s*(?:on|off|true|false|1|0|thinking|fast|auto)\]/gi, '').trim();

            if (content) {
                cleaned.push({ ...msg, content });
            }
        } else {
            cleaned.push(msg);
        }
    }

    return { autoThinking, thinkingMode, thinkingEnabled, cleanedMessages: cleaned };
}

