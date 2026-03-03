const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// Google Gemini Setup - Using Gemini 2.5 Flash for Native Audio
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Tor requested preview model
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-native-audio-preview-12-2025" 
});

const upload = multer({ storage: multer.memoryStorage() });

// n8n Production Webhook URL (Ensure POST method in n8n)
const N8N_WEBHOOK_URL = 'https://n8n.solanacy.in/webhook/4d2aafc0-a01e-4a4a-b925-7638a3404ed0';

app.post('/api/upload-audio', upload.single('audioFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No audio provided' });

        // Native Audio Input Preparation
        const audioPart = {
            inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: req.file.mimetype // Usually audio/webm or audio/ogg
            }
        };

        // Model theke direct output neowa
        const result = await model.generateContent([
            "Listen to this audio from Saumik and provide a direct text transcription. If it's a command, just transcribe it.",
            audioPart
        ]);
        
        const transcribedText = result.response.text();
        console.log('ARIA Heard:', transcribedText);

        // n8n Webhook-e data pathano
        const n8nResponse = await axios.post(N8N_WEBHOOK_URL, {
            chatInput: transcribedText,
            user: "Saumik Paul",
            timestamp: new Date().toISOString()
        });

        // n8n theke response handle kora
        const aiReply = n8nResponse.data.output || n8nResponse.data[0]?.output || "Processed by ARIA";

        res.json({ 
            success: true, 
            message: aiReply,
            transcription: transcribedText 
        });

    } catch (error) {
        console.error('v2v Processing Error:', error);
        res.status(500).json({ error: 'Native audio processing failed' });
    }
});

app.get('/', (req, res) => res.send('Solanacy Agent Backend is Live (Gemini 2.5)'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running with Gemini 2.5 on port ${PORT}`));
