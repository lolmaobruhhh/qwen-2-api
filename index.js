import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getValidToken } from './lib/auth.js';
import { createNewChat, sendChatMessage } from './lib/qwenClient.js';
import { createOpenAIChunk } from './lib/translator.js';
import { config } from 'dotenv';
import { 
  getConversation, 
  createOrUpdateConversation, 
  getAllAccounts, 
  getNextAccount, 
  bumpAccountUsage,
  addAccount,
  deactivateAccount as removeAccount
} from './lib/database.js';
import { adminHtml } from './lib/page.js';

config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.send(adminHtml));

app.get('/api/accounts', (req, res) => {
    try {
        res.json({ accounts: getAllAccounts() });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/accounts', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false });
        addAccount(email, password);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/accounts/:id', (req, res) => {
    try {
        removeAccount(req.params.id);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Helper to generate a SHA-256 hash for conversation uniqueness
function generateConvKey(req, messages) {
    const headerConvId = req.headers['x-conversation-id'];
    if (headerConvId) return headerConvId;

    const systemContent = messages
        .filter(m => m.role === 'system')
        .map(m => m.content || '')
        .join('|||');

    const firstUser = messages.find(m => m.role === 'user');
    const seed = systemContent + '|||FIRST_USER|||' + (firstUser ? firstUser.content : '');

    return crypto.createHash('sha256').update(seed).digest('hex');
}

// Generate API key hash 
function hashApiKey(key) {
    return crypto.createHash('sha256').update(key || 'anonymous').digest('hex');
}

// Ensure there is at least one active account
app.use(async (req, res, next) => {
    const active = getNextAccount();
    if (!active) {
        return res.status(503).json({
            error: {
                message: "No active accounts configured in the proxy database. Please configure one in database.",
                type: "proxy_error"
            }
        });
    }
    next();
});

// The core chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const { messages, model, stream } = req.body;
        const apiKeyHash = hashApiKey(req.headers.authorization || '');
        const convKey = generateConvKey(req, messages);
        
        let account = getNextAccount();
        let token = await getValidToken(account);
        bumpAccountUsage(account.id);

        let dbConv = getConversation(convKey, apiKeyHash);
        
        let qwenChatId;
        let lastMsgId = null;
        
        // Detect if this is a new conversation
        if (!dbConv || messages.length <= 2) {
            console.log(`[Proxy] Creating new Qwen chat session for ${convKey}`);
            qwenChatId = await createNewChat(token);
        } else {
            console.log(`[Proxy] Resuming existing chat ${dbConv.qwen_chat_id}`);
            qwenChatId = dbConv.qwen_chat_id;
            lastMsgId = dbConv.last_msg_id;
        }

        // We only send the LATEST user message as per Qwen's graph architecture
        const latestMessage = messages[messages.length - 1];

        const payload = {
            stream: true, // Qwen always streams internally
            version: "2.1",
            incremental_output: true,
            chat_id: qwenChatId,
            chat_mode: "normal",
            model: "qwen3.7-plus", // Override model or map properly if needed
            parent_id: lastMsgId,
            messages: [{
                fid: uuidv4(),
                parentId: lastMsgId,
                childrenIds: [uuidv4()],
                role: latestMessage.role,
                content: latestMessage.content,
                user_action: "chat",
                files: [],
                timestamp: Math.floor(Date.now() / 1000),
                models: ["qwen3.7-plus"],
                chat_type: "t2t",
                feature_config: {
                    thinking_enabled: true,
                    output_schema: "phase",
                    research_mode: "normal",
                    auto_thinking: true,
                    thinking_mode: "Auto",
                    thinking_format: "summary",
                    auto_search: true
                },
                extra: { meta: { subChatType: "t2t" } },
                sub_chat_type: "t2t"
            }],
            timestamp: Math.floor(Date.now() / 1000)
        };

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
        }

        let fullContent = '';
        let fullThinking = '';
        let newResponseId = null;
        let inThinkingPhase = false;

        const streamGen = sendChatMessage(token, payload);
        
        for await (const chunk of streamGen) {
            // chunk is the parsed JSON from Qwen
            
            // Extract the new parent_id (response_id) immediately
            if (chunk['response.created'] && chunk['response.created'].response_id) {
                newResponseId = chunk['response.created'].response_id;
            } else if (chunk.response_id) {
                newResponseId = chunk.response_id;
            }

            if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
                const delta = chunk.choices[0].delta;
                
                if (stream) {
                    if (delta.phase === 'thinking_summary') {
                        if (!inThinkingPhase) {
                            res.write(createOpenAIChunk(newResponseId, model, '<think>\n'));
                            inThinkingPhase = true;
                        }
                        
                        // Qwen might send thinking_summary in status: "typing" but not always content? 
                        // Wait, looking at the logs, thinking_summary delta.content is usually empty, but extra.summary_thought.content is populated.
                        // Actually let's output a generic placeholder or try to parse thoughts.
                        // In the user's logs: `extra.summary_thought.content` holds the reasoning text array!
                        if (delta.extra && delta.extra.summary_thought && delta.extra.summary_thought.content) {
                            // Extract just the newest addition if incremental, but Qwen seems to send cumulative arr!
                            // To stream properly, we need to diff it, or just ignore and wait for finish.
                            // The logs show it sends cumulative text. Let's just output a simple dot or ignore until phase answer.
                            // Actually, standard AI wrappers will diff the string. 
                        }
                    } else if (delta.phase === 'answer') {
                        if (inThinkingPhase) {
                            res.write(createOpenAIChunk(newResponseId, model, '\n</think>\n\n'));
                            inThinkingPhase = false;
                        }
                        
                        if (delta.content) {
                            fullContent += delta.content;
                            res.write(createOpenAIChunk(newResponseId, model, delta.content));
                        }
                    }
                }
            }
        }

        if (stream && inThinkingPhase) {
            res.write(createOpenAIChunk(newResponseId, model, '\n</think>\n\n'));
        }

        // Update database with new lastMsgId
        createOrUpdateConversation(
            convKey, 
            apiKeyHash, 
            qwenChatId, 
            account.id, 
            messages.length, 
            newResponseId
        );

        if (stream) {
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            // Non-stream response (wait until loop completes)
            res.json({
                id: newResponseId,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: "qwen-proxy",
                choices: [{
                    message: {
                        role: "assistant",
                        content: fullThinking ? `<think>\n${fullThinking}\n</think>\n\n${fullContent}` : fullContent
                    },
                    finish_reason: "stop",
                    index: 0
                }]
            });
        }
        
    } catch (e) {
        console.error("Proxy Error:", e);
        if (!res.headersSent) {
            res.status(500).json({ error: { message: e.message } });
        } else {
            res.end();
        }
    }
});

const PORT = process.env.PORT || 7860;
app.listen(PORT, () => console.log(`Qwen Proxy running on port ${PORT}`));
