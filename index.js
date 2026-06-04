import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getValidToken } from './lib/auth.js';
import { createNewChat, sendChatMessage } from './lib/qwenClient.js';
import { createOpenAIChunk, parseDirectives } from './lib/translator.js';
import { config } from 'dotenv';
import db, { 
  getConversation, 
  createOrUpdateConversation, 
  getAllAccounts, 
  getNextAccount, 
  bumpAccountUsage,
  addAccount,
  deactivateAccount
} from './lib/database.js';
import { adminHtml } from './lib/page.js';

config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const CONV_TIMEOUT = parseInt(process.env.CONV_TIMEOUT_MINUTES) || 60;

// ══════════════════════════════════════════
//  ADMIN ROUTES (no account check needed!)
// ══════════════════════════════════════════

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
        deactivateAccount(req.params.id);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════

function generateConvKey(req, messages) {
    const headerConvId = req.headers['x-conversation-id'];
    if (headerConvId) return headerConvId;

    // Hash ALL system messages
    const systemContent = messages
        .filter(m => m.role === 'system')
        .map(m => m.content || '')
        .join('|||');

    // Include only the FIRST 2 non-system messages (character greeting + first user prompt)
    // These are universally pinned by frontends and will never shift or grow, guaranteeing perfect fingerprint stability.
    const nonSystem = messages.filter(m => m.role !== 'system');
    const earlyMessages = nonSystem.slice(0, 2).map(m => `${m.role}:${m.content || ''}`).join('|||');

    const seed = systemContent + '|||MSGS|||' + earlyMessages;
    return crypto.createHash('sha256').update(seed).digest('hex');
}

function hashApiKey(key) {
    return crypto.createHash('sha256').update(key || 'anonymous').digest('hex').slice(0, 16);
}

// Build full query for NEW conversation
function buildNewConversationQuery(messages) {
    const parts = [];
    for (const msg of messages) {
        switch (msg.role) {
            case 'system':
                parts.push(`[System Instructions]\n${msg.content}`);
                break;
            case 'user':
                parts.push(`[User]\n${msg.content}`);
                break;
            case 'assistant':
                parts.push(`[Assistant]\n${msg.content}`);
                break;
            default:
                parts.push(`[${msg.role}]\n${msg.content}`);
        }
    }
    return parts.join('\n\n');
}

// Build continuation query (only latest user message)
function buildContinuationQuery(messages) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    return lastUser ? lastUser.content : '';
}

// ══════════════════════════════════════════
//  OPENAI-COMPATIBLE ROUTES
// ══════════════════════════════════════════

app.get('/v1/models', (req, res) => {
    res.json({
        object: 'list',
        data: [
            { id: 'qwen3.7-plus', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'alibaba' },
            { id: 'qwen3.6-plus', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'alibaba' },
            { id: 'qwen-max', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'alibaba' }
        ]
    });
});

app.post('/v1/chat/completions', async (req, res) => {
    try {
        const messages = req.body.messages;
        const model = req.body.model || 'qwen3.7-plus';
        const stream = req.body.stream;

        const abortController = new AbortController();
        req.on('aborted', () => {
            console.log('[Proxy] Client explicitly aborted the request mid-stream.');
            abortController.abort();
        });

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: { message: 'messages array required', type: 'invalid_request' } });
        }

        const hasUser = messages.some(m => m.role === 'user');
        if (!hasUser) {
            return res.status(400).json({ error: { message: 'At least one user message required', type: 'invalid_request' } });
        }

        const apiKeyHash = hashApiKey(req.headers.authorization || '');
        const convKey = generateConvKey(req, messages);
        const completionId = 'chatcmpl-' + crypto.randomBytes(16).toString('hex');

        // ── Conversation tracking ──
        let dbConv = getConversation(convKey, apiKeyHash);
        const { autoThinking, thinkingMode, thinkingEnabled, cleanedMessages } = parseDirectives(messages);

        let qwenChatId;
        let lastMsgId = null;
        let lastUserMsgId = null;
        let account;
        let isContinuation = false;
        let isReroll = false;
        let finalContent;

        if (dbConv) {
            if (cleanedMessages.length > dbConv.message_count) {
                // ═══ CONTINUATION ═══
                account = db.prepare('SELECT * FROM accounts WHERE id = ? AND active = 1').get(dbConv.account_id);
                if (account) {
                    isContinuation = true;
                    qwenChatId = dbConv.qwen_chat_id;
                    lastMsgId = dbConv.last_msg_id;

                    var isTurnOne = (dbConv.root_message_count && cleanedMessages.length === dbConv.root_message_count) ||
                                    (!dbConv.root_message_count && cleanedMessages.filter(function(m) { return m.role === 'user'; }).length === 1);
                    finalContent = isTurnOne ? buildNewConversationQuery(cleanedMessages) : buildContinuationQuery(cleanedMessages);

                    console.log(`[Conv] Continuation: ${convKey.slice(0, 12)}... | msgs: ${dbConv.message_count} -> ${cleanedMessages.length} | account: ${account.email}`);
                } else {
                    db.prepare('DELETE FROM conversations WHERE conv_key = ? AND api_key_hash = ?').run(convKey, apiKeyHash);
                    dbConv = null;
                }
            } else if (cleanedMessages.length === dbConv.message_count && dbConv.last_msg_id) {
                // ═══ REROLL ═══
                account = db.prepare('SELECT * FROM accounts WHERE id = ? AND active = 1').get(dbConv.account_id);
                if (account) {
                    isReroll = true;
                    isContinuation = true;
                    qwenChatId = dbConv.qwen_chat_id;
                    lastMsgId = dbConv.last_msg_id;
                    lastUserMsgId = dbConv.last_user_msg_id;
                    
                    var isTurnOne = (dbConv.root_message_count && cleanedMessages.length === dbConv.root_message_count) ||
                                    (!dbConv.root_message_count && cleanedMessages.filter(function(m) { return m.role === 'user'; }).length === 1);
                    finalContent = isTurnOne ? buildNewConversationQuery(cleanedMessages) : buildContinuationQuery(cleanedMessages);

                    console.log(`[Conv] Reroll: ${convKey.slice(0, 12)}... | msgs: ${cleanedMessages.length} | account: ${account.email}`);
                } else {
                    db.prepare('DELETE FROM conversations WHERE conv_key = ? AND api_key_hash = ?').run(convKey, apiKeyHash);
                    dbConv = null;
                }
            }
        }

        if (!dbConv || !isContinuation) {
            // ═══ NEW CONVERSATION ═══
            db.prepare('DELETE FROM conversations WHERE conv_key = ? AND api_key_hash = ?').run(convKey, apiKeyHash);

            account = getNextAccount();
            if (!account) {
                return res.status(503).json({ error: { message: 'No active accounts available.', type: 'server_error' } });
            }

            finalContent = buildNewConversationQuery(cleanedMessages);
            console.log(`[Conv] New: ${convKey.slice(0, 12)}... | msgs: ${cleanedMessages.length} | model: ${model} | account: ${account.email}`);
        }

        // ── Get valid token ──
        let token;
        try {
            token = await getValidToken(account);
        } catch (authErr) {
            console.error(`[AUTH] Account ${account.email} failed: ${authErr.message} — disabling`);
            deactivateAccount(account.id);

            const fallback = getNextAccount();
            if (fallback && fallback.id !== account.id) {
                console.log(`[AUTH] Retrying with fallback account: ${fallback.email}`);
                token = await getValidToken(fallback);
                account = fallback;
            } else {
                throw new Error('All accounts failed authentication.');
            }
        }

        // ── Create new Qwen chat if needed ──
        if (!isContinuation) {
            qwenChatId = await createNewChat(token, abortController.signal);
        }

        bumpAccountUsage(account.id);

        // ── Build Qwen payload ──
        const payload = {
            stream: true,
            version: "2.1",
            incremental_output: true,
            chat_id: qwenChatId,
            chat_mode: "normal",
            model: model, // Dynamic Model
            parent_id: isReroll ? null : lastMsgId,
            messages: [{
                fid: uuidv4(),
                parentId: isReroll ? null : lastMsgId,
                id: isReroll ? lastUserMsgId : undefined,
                childrenIds: [uuidv4()],
                role: "user",
                content: finalContent,
                user_action: isReroll ? "retry" : "chat",
                files: [],
                timestamp: Math.floor(Date.now() / 1000),
                models: [model], // Dynamic Model Array
                chat_type: "t2t",
                feature_config: {
                    thinking_enabled: thinkingEnabled,
                    output_schema: "phase",
                    research_mode: "normal",
                    auto_thinking: autoThinking,
                    thinking_mode: thinkingMode,
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
            res.setHeader('X-Accel-Buffering', 'no');
            res.setHeader('X-Conversation-Id', convKey);

            res.write(`data: ${JSON.stringify({
                id: completionId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }]
            })}\n\n`);
        }

        let fullContent = '';
        let fullThinking = '';
        let printedCumulativeThinking = '';
        let newResponseId = null;
        let newUserMsgId = null;
        let inThinkingPhase = false;

        const streamGen = sendChatMessage(token, payload, abortController.signal);
        
        for await (const chunk of streamGen) {
            if (chunk['response.created'] && chunk['response.created'].response_id) {
                newResponseId = chunk['response.created'].response_id;
                newUserMsgId = chunk['response.created'].parent_id;
            } else if (chunk.response_id && !newResponseId) {
                newResponseId = chunk.response_id;
            }

            if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
                const delta = chunk.choices[0].delta;
                
                if (delta.phase === 'thinking_summary') {
                    if (!inThinkingPhase) {
                        if (stream) {
                            const c = createOpenAIChunk(completionId, model, '<think>\n');
                            if (c) res.write(c);
                        }
                        fullThinking += '<think>\n';
                        inThinkingPhase = true;
                    }
                    
                    if (delta.extra && delta.extra.summary_thought && delta.extra.summary_thought.content) {
                        const currentTotalText = delta.extra.summary_thought.content.join('\n');
                        const newDelta = currentTotalText.substring(printedCumulativeThinking.length);
                        if (newDelta) {
                            if (stream) {
                                const c = createOpenAIChunk(completionId, model, newDelta);
                                if (c) res.write(c);
                            }
                            printedCumulativeThinking = currentTotalText;
                            fullThinking += newDelta;
                        }
                    }
                } else if (delta.phase === 'answer') {
                    if (inThinkingPhase) {
                        if (stream) {
                            const c = createOpenAIChunk(completionId, model, '\n</think>\n\n');
                            if (c) res.write(c);
                        }
                        fullThinking += '\n</think>\n\n';
                        inThinkingPhase = false;
                    }
                    
                    if (delta.content) {
                        fullContent += delta.content;
                        if (stream) {
                            const c = createOpenAIChunk(completionId, model, delta.content);
                            if (c) res.write(c);
                        }
                    }
                }
            }
        }

        if (inThinkingPhase) {
            if (stream) {
                const c = createOpenAIChunk(completionId, model, '\n</think>\n\n');
                if (c) res.write(c);
            }
            fullThinking += '\n</think>\n\n';
        }

        // Update database for continuation
        createOrUpdateConversation(
            convKey, 
            apiKeyHash, 
            qwenChatId, 
            account.id, 
            cleanedMessages.length, 
            cleanedMessages.length, // rootMessageCount fallback
            newResponseId,
            newUserMsgId
        );

        if (stream) {
            res.write(`data: ${JSON.stringify({
                id: completionId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
            })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            const finalText = fullThinking ? `${fullThinking}${fullContent}` : fullContent;
            res.json({
                id: completionId,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                    index: 0,
                    message: {
                        role: "assistant",
                        content: finalText
                    },
                    finish_reason: "stop"
                }],
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            });
        }
        
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('[Abort] Client disconnected, stream terminated.');
            return res.end();
        }
        console.error("Proxy Error:", e);
        if (!res.headersSent) {
            res.status(502).json({ error: { message: 'Upstream error: ' + e.message, type: 'upstream_error' } });
        } else {
            res.end();
        }
    }
});

// ══════════════════════════════════════════
//  CLEANUP & BOOT
// ══════════════════════════════════════════

setInterval(() => {
    try {
        const timeout = CONV_TIMEOUT || 60;
        db.prepare(`DELETE FROM conversations WHERE last_used < datetime('now', '-${timeout} minutes')`).run();
    } catch (e) {
        console.error('[Cleanup Error]', e.message);
    }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 7860;
app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║    Qwen Native-Continuation Proxy    ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  Admin Panel : http://localhost:${PORT}   ║`);
    console.log(`  ║  API Base    : http://localhost:${PORT}/v1 ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
});
