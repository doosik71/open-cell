import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFiles, getSheets, getSheetData, getSheetDataAndStyles, saveWorkbook } from './excel.js';
import {
    addEdit,
    getEdits,
    applyEditsToData,
    applyStyleChangesToStyles,
    getAllEditsForFile,
    clearEdits,
    addStructuralChange,
    getStructuralChanges,
    getAllStructuralChangesForFile,
    addStylePatches,
    getStylePatches,
    getAllStylePatchesForFile
} from './state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

type StructureType = 'row' | 'col';
type StructureAction = 'insert' | 'delete';

function isStructureType(value: unknown): value is StructureType {
    return value === 'row' || value === 'col';
}

function isStructureAction(value: unknown): value is StructureAction {
    return value === 'insert' || value === 'delete';
}

function getColumnCount(data: any[][]): number {
    return data.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
}

function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isStyleColor(value: unknown): value is string | null {
    return value === null || isHexColor(value);
}

function isValidStylePatch(value: unknown): value is { fontColor?: string | null; fillColor?: string | null } {
    if (!value || typeof value !== 'object') return false;
    const patch = value as { fontColor?: unknown; fillColor?: unknown };
    const hasFontColor = Object.prototype.hasOwnProperty.call(patch, 'fontColor');
    const hasFillColor = Object.prototype.hasOwnProperty.call(patch, 'fillColor');

    if (!hasFontColor && !hasFillColor) return false;
    if (hasFontColor && !isStyleColor(patch.fontColor)) return false;
    if (hasFillColor && !isStyleColor(patch.fillColor)) return false;
    return true;
}

function parseCells(value: unknown): { row: number; col: number }[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;

    const cells = value.map(cell => {
        const row = Number((cell as { row?: unknown })?.row);
        const col = Number((cell as { col?: unknown })?.col);
        return { row, col };
    });

    if (cells.some(cell => !Number.isInteger(cell.row) || !Number.isInteger(cell.col) || cell.row < 0 || cell.col < 0)) {
        return null;
    }

    const uniqueCells = new Map<string, { row: number; col: number }>();
    cells.forEach(cell => uniqueCells.set(`${cell.row}:${cell.col}`, cell));
    return [...uniqueCells.values()];
}

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

// Get data for a specific sheet (merged with in-memory edits and structural changes)
app.get('/api/files/:name/sheets/:sheet', async (req, res) => {
    try {
        const { name, sheet } = req.params;
        const baseSheet = await getSheetDataAndStyles(name, sheet);
        const edits = getEdits(name, sheet);
        const structuralChanges = getStructuralChanges(name, sheet);
        const stylePatches = getStylePatches(name, sheet);
        const mergedData = applyEditsToData(baseSheet.data, edits, structuralChanges);
        const mergedStyles = applyStyleChangesToStyles(baseSheet.styles, stylePatches, structuralChanges);
        res.json({ data: mergedData, styles: mergedStyles, edits, structuralChanges, stylePatches });
    } catch (error) {
        console.error(`Error fetching data for ${req.params.name} - ${req.params.sheet}:`, error);
        res.status(500).json({ error: 'Failed to fetch sheet data' });
    }
});

// Submit a structural change (insert/delete row/col)
app.post('/api/files/:name/sheets/:sheet/structure', async (req, res) => {
    try {
        const { name, sheet } = req.params;
        const { type, action, index } = req.body;
        const numericIndex = Number(index);

        if (!isStructureType(type) || !isStructureAction(action) || !Number.isInteger(numericIndex) || numericIndex < 0) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const baseData = await getSheetData(name, sheet);
        const currentData = applyEditsToData(baseData, getEdits(name, sheet), getStructuralChanges(name, sheet));
        const limit = type === 'row' ? currentData.length : getColumnCount(currentData);
        const maxInsertIndex = action === 'insert' ? limit : limit - 1;

        if (numericIndex > maxInsertIndex || (action === 'delete' && limit <= 0)) {
            return res.status(400).json({ error: 'Index out of range' });
        }

        addStructuralChange(name, sheet, { type, action, index: numericIndex });
        res.json({ success: true });
    } catch (error) {
        console.error('Error submitting structural change:', error);
        res.status(500).json({ error: 'Failed to submit structural change' });
    }
});

// Submit cell style changes for one or more cells
app.post('/api/files/:name/sheets/:sheet/style', (req, res) => {
    try {
        const { name, sheet } = req.params;
        const { cells, style, userId } = req.body;
        const parsedCells = parseCells(cells);

        if (!parsedCells || !isValidStylePatch(style) || !userId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        addStylePatches(name, sheet, parsedCells, style, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error submitting style changes:', error);
        res.status(500).json({ error: 'Failed to submit style changes' });
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

// Save all edits and structural changes to the physical file and clear in-memory state
app.post('/api/files/:name/save', async (req, res) => {
    try {
        const { name } = req.params;
        const allEdits = getAllEditsForFile(name);
        const allStructuralChanges = getAllStructuralChangesForFile(name);
        const allStylePatches = getAllStylePatchesForFile(name);
        
        if (allEdits.length === 0 && allStructuralChanges.length === 0 && allStylePatches.length === 0) {
            return res.json({ success: true, message: 'No changes to save' });
        }

        await saveWorkbook(name, allEdits, allStructuralChanges, allStylePatches);
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
