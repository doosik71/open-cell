import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFiles, getSheets, getSheetData, saveWorkbook } from './excel.js';
import { addEdit, getEdits, applyEditsToData, getAllEditsForFile, clearEdits } from './state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the React app
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// List all .xlsx files in the data directory
app.get('/api/files', async (req, res) => {
    try {
        const files = await getFiles();
        res.json({ files });
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

// List sheets in a specific file
app.get('/api/files/:name/sheets', async (req, res) => {
    try {
        const { name } = req.params;
        const sheets = await getSheets(name);
        res.json({ sheets });
    } catch (error) {
        console.error(`Error fetching sheets for ${req.params.name}:`, error);
        res.status(500).json({ error: 'Failed to fetch sheets' });
    }
});

// Get data for a specific sheet (merged with in-memory edits)
app.get('/api/files/:name/sheets/:sheet', async (req, res) => {
    try {
        const { name, sheet } = req.params;
        const baseData = await getSheetData(name, sheet);
        const edits = getEdits(name, sheet);
        const mergedData = applyEditsToData(baseData, edits);
        res.json({ data: mergedData, edits });
    } catch (error) {
        console.error(`Error fetching data for ${req.params.name} - ${req.params.sheet}:`, error);
        res.status(500).json({ error: 'Failed to fetch sheet data' });
    }
});

// Submit an edit
app.post('/api/files/:name/sheets/:sheet/edit', (req, res) => {
    try {
        const { name, sheet } = req.params;
        const { row, col, value, userId } = req.body;
        
        if (row === undefined || col === undefined || !userId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        addEdit(name, sheet, { row, col, value, userId });
        res.json({ success: true });
    } catch (error) {
        console.error('Error submitting edit:', error);
        res.status(500).json({ error: 'Failed to submit edit' });
    }
});

// Save all edits to the physical file and clear in-memory state
app.post('/api/files/:name/save', async (req, res) => {
    try {
        const { name } = req.params;
        const allEdits = getAllEditsForFile(name);
        
        if (allEdits.length === 0) {
            return res.json({ success: true, message: 'No changes to save' });
        }

        await saveWorkbook(name, allEdits);
        clearEdits(name);
        
        res.json({ success: true });
    } catch (error) {
        console.error(`Error saving file ${req.params.name}:`, error);
        res.status(500).json({ error: 'Failed to save file' });
    }
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.use((req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error('Failed to start server:', err);
});
