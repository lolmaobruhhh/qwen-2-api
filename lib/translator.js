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

function extractTextForRegex(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const textBlock = content.find(c => c.type === 'text');
        return textBlock ? textBlock.text : '';
    }
    return '';
}

function applyReplacedText(content, newText) {
    if (typeof content === 'string') return newText;
    if (Array.isArray(content)) {
        return content.map(c => {
            if (c.type === 'text') return { ...c, text: newText };
            return c;
        });
    }
    return newText;
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
            let extractedText = extractTextForRegex(msg.content) || '';
            const isTarget = true;

            const thinkMatch = extractedText.match(/\[think\s*=\s*(on|off|true|false|1|0|thinking|fast|auto)\]/gi);
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

            extractedText = extractedText.replace(/\[think\s*=\s*(?:on|off|true|false|1|0|thinking|fast|auto)\]/gi, '').trim();

            const finalContent = applyReplacedText(msg.content, extractedText);

            if (extractedText || Array.isArray(msg.content)) {
                cleaned.push({ ...msg, content: finalContent });
            }
        } else {
            cleaned.push(msg);
        }
    }

    return { autoThinking, thinkingMode, thinkingEnabled, cleanedMessages: cleaned };
}

