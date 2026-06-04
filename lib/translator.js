export function createOpenAIChunk(responseId, model, content, isThinking = false) {
    if (!content) return null;
    
    let text = content;

    return `data: ${JSON.stringify({
        id: responseId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: model || "qwen3.7-plus",
        choices: [
            {
                index: 0,
                delta: {
                    content: text,
                    // If it is thinking phase, some UIs want reasoning_content
                    // We will just put it in content, and the main routine can wrap it in <think> tags if this is the start/end
                }
            }
        ]
    })}\n\n`;
}
