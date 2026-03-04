require('dotenv').config();
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.solanacy.in/webhook/4d2aafc0-a01e-4a4a-b925-7638a3404ed0';
const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_INSTRUCTION = `You are Saumik's highly intelligent and proactive personal AI assistant. Your name is ARIA (Advanced Responsive Intelligent Assistant).

PERSONALITY:
- Always speak in Bengali unless Saumik speaks in another language
- Be smart, friendly, and proactive
- Remember everything from past conversations
- Be concise but thorough

YOUR CAPABILITIES:
- Access Gmail, Google Calendar, Google Drive via n8n
- Search the web for current information
- Get latest world and tech news
- Answer questions intelligently

STRICT RULES:
- Never make up information
- Always verify before acting
- Ask for confirmation before sending emails or creating events
- Protect Saumik's privacy at all times`;

// ── Health check ──
app.get('/', (req, res) => {
    res.json({
        status: 'ARIA Backend Live',
        model: MODEL,
        websocket: 'wss://solanacy-agent-backend.onrender.com'
    });
});

// ── n8n action trigger (text commands from website) ──
app.post('/api/action', async (req, res) => {
    try {
        const { message } = req.body;
        const response = await axios.post(N8N_WEBHOOK_URL, {
            chatInput: message,
            user: 'Saumik Paul',
            timestamp: new Date().toISOString()
        });
        const reply = response.data.output || response.data[0]?.output || 'Done!';
        res.json({ success: true, reply });
    } catch (error) {
        console.error('n8n Error:', error.message);
        res.status(500).json({ error: 'n8n action failed' });
    }
});

// ── WebSocket connection handler ──
wss.on('connection', (clientWs) => {
    console.log('✅ Client connected');

    let geminiWs = null;
    let isGeminiReady = false;
    const messageQueue = [];

    // FIX ②: Transcript buffer — collect chunks, send after turnComplete
    let transcriptBuffer = '';
    let transcriptFlushTimer = null;

    function flushTranscript() {
        clearTimeout(transcriptFlushTimer);
        if (transcriptBuffer.trim() && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
                type: 'transcript',
                text: transcriptBuffer.trim()
            }));
        }
        transcriptBuffer = '';
    }

    function connectToGemini() {
        geminiWs = new WebSocket(GEMINI_WS_URL);

        geminiWs.on('open', () => {
            console.log('🤖 Connected to Gemini Live API');

            // FIX ①: Added output_audio_transcription so text comes correctly
            const setupMessage = {
                setup: {
                    model: `models/${MODEL}`,
                    generation_config: {
                        response_modalities: ['AUDIO'],
                        speech_config: {
                            voice_config: {
                                prebuilt_voice_config: {
                                    voice_name: 'Aoede'
                                }
                            }
                        },
                        output_audio_transcription: {}
                    },
                    system_instruction: {
                        parts: [{ text: SYSTEM_INSTRUCTION }]
                    }
                }
            };

            geminiWs.send(JSON.stringify(setupMessage));
        });

        geminiWs.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());

                // Setup complete
                if (message.setupComplete) {
                    console.log('✅ Gemini session ready');
                    isGeminiReady = true;

                    while (messageQueue.length > 0) {
                        geminiWs.send(JSON.stringify(messageQueue.shift()));
                    }

                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ type: 'ready' }));
                    }
                }

                // Audio + transcript from Gemini
                if (message.serverContent?.modelTurn?.parts) {
                    for (const part of message.serverContent.modelTurn.parts) {

                        // Audio chunk → send immediately
                        if (part.inlineData?.data) {
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(JSON.stringify({
                                    type: 'audio',
                                    data: part.inlineData.data,
                                    mimeType: part.inlineData.mimeType || 'audio/pcm'
                                }));
                            }
                        }

                        // FIX ②: Buffer text chunks instead of sending each one separately
                        if (part.text) {
                            transcriptBuffer += part.text;
                            // Debounce — flush after 300ms of silence
                            clearTimeout(transcriptFlushTimer);
                            transcriptFlushTimer = setTimeout(flushTranscript, 300);
                        }
                    }
                }

                // Output audio transcription (from output_audio_transcription config)
                if (message.serverContent?.outputTranscription?.text) {
                    transcriptBuffer += message.serverContent.outputTranscription.text;
                    clearTimeout(transcriptFlushTimer);
                    transcriptFlushTimer = setTimeout(flushTranscript, 300);
                }

                // Turn complete → flush buffer immediately
                if (message.serverContent?.turnComplete) {
                    flushTranscript(); // FIX ②: flush all buffered text now
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ type: 'turnComplete' }));
                    }
                }

                // Input transcript (what user said via voice)
                if (message.serverContent?.inputTranscription?.text) {
                    const userText = message.serverContent.inputTranscription.text;
                    console.log('🗣 Saumik said:', userText);

                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({
                            type: 'inputTranscript',
                            text: userText
                        }));
                    }

                    // FIX ③: Only trigger n8n when USER says action keyword, not ARIA
                    triggerN8nIfNeeded(userText, 'voice');
                }

            } catch (e) {
                console.error('Gemini message parse error:', e.message);
            }
        });

        geminiWs.on('error', (error) => {
            console.error('❌ Gemini error:', error.message);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'error', message: error.message }));
            }
        });

        geminiWs.on('close', () => {
            console.log('🔌 Gemini connection closed');
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'disconnected' }));
            }
        });
    }

    // FIX ③: n8n only triggered by USER request, not ARIA response
    async function triggerN8nIfNeeded(userText, source) {
        const actionKeywords = ['email পাঠাও', 'mail পাঠাও', 'calendar', 'reminder', 'drive', 'schedule', 'সময় দাও'];
        const needsAction = actionKeywords.some(k => userText.toLowerCase().includes(k));

        if (needsAction) {
            try {
                await axios.post(N8N_WEBHOOK_URL, {
                    chatInput: userText,
                    user: 'Saumik Paul',
                    source: source,
                    timestamp: new Date().toISOString()
                });
                console.log('✅ n8n triggered for:', userText);
            } catch (e) {
                console.error('❌ n8n trigger failed:', e.message);
            }
        }
    }

    // Handle messages from browser
    clientWs.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            if (message.type === 'audio') {
                // Mic audio → Gemini
                const realtimeInput = {
                    realtimeInput: {
                        mediaChunks: [{
                            data: message.data,
                            mimeType: 'audio/pcm;rate=16000'
                        }]
                    }
                };

                if (isGeminiReady && geminiWs?.readyState === WebSocket.OPEN) {
                    geminiWs.send(JSON.stringify(realtimeInput));
                } else {
                    messageQueue.push(realtimeInput);
                }

            } else if (message.type === 'text') {
                // Text message → Gemini + n8n
                const textMessage = {
                    clientContent: {
                        turns: [{
                            role: 'user',
                            parts: [{ text: message.text }]
                        }],
                        turnComplete: true
                    }
                };

                if (isGeminiReady && geminiWs?.readyState === WebSocket.OPEN) {
                    geminiWs.send(JSON.stringify(textMessage));
                } else {
                    messageQueue.push(textMessage);
                }

                // FIX ③: trigger n8n from text too
                triggerN8nIfNeeded(message.text, 'text');

            } else if (message.type === 'connect') {
                connectToGemini();

            } else if (message.type === 'audioStreamEnd') {
                // FIX ④: Tell Gemini user stopped speaking
                if (isGeminiReady && geminiWs?.readyState === WebSocket.OPEN) {
                    geminiWs.send(JSON.stringify({
                        realtimeInput: {
                            audioStreamEnd: true
                        }
                    }));
                    console.log('🎤 Audio stream ended');
                }
            }

        } catch (e) {
            console.error('Client message error:', e.message);
        }
    });

    clientWs.on('close', () => {
        console.log('🔌 Client disconnected');
        clearTimeout(transcriptFlushTimer);
        if (geminiWs) geminiWs.close();
    });

    clientWs.on('error', (error) => {
        console.error('Client WebSocket error:', error.message);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 ARIA Backend running on port ${PORT}`);
    console.log(`📡 Model: ${MODEL}`);
});
