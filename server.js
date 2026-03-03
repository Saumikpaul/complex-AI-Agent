const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
// CORS enable korchi jate jekono frontend theke request ashte pare
app.use(cors()); 

// Memory-te audio file save korar jonno multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// API endpoint jekhane frontend audio pathabe
app.post('/api/upload-audio', upload.single('audioFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Kono audio file asheni' });
        }

        const audioBuffer = req.file.buffer;
        console.log('Audio received! Size:', audioBuffer.length, 'bytes');

        // TODO: Ekhane amra pore audio take text-e convert korbo 
        // ar apnar n8n Webhook-e request pathabo.

        res.json({ success: true, message: 'Audio successfully received on server!' });
    } catch (error) {
        console.error('Error processing audio:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Render-er port ba default 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
