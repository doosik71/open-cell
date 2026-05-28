interface Edit {
    row: number;
    col: number;
    value: any;
    userId: string;
    timestamp: number;
}

interface SheetState {
    edits: Edit[];
}

interface FileState {
    sheets: Record<string, SheetState>;
}

// In-memory state: fileName -> FileState
const state: Record<string, FileState> = {};

export function addEdit(fileName: string, sheetName: string, edit: Omit<Edit, 'timestamp'>) {
    if (!state[fileName]) {
        state[fileName] = { sheets: {} };
    }
    if (!state[fileName]!.sheets[sheetName]) {
        state[fileName]!.sheets[sheetName] = { edits: [] };
    }

    const sheetState = state[fileName]!.sheets[sheetName]!;
    
    // Remove previous edits for the same cell to keep it clean
    sheetState.edits = sheetState.edits.filter(e => !(e.row === edit.row && e.col === edit.col));
    
    sheetState.edits.push({
        ...edit,
        timestamp: Date.now()
    });
}

export function getEdits(fileName: string, sheetName: string): Edit[] {
    return state[fileName]?.sheets[sheetName]?.edits || [];
}

export function getAllEditsForFile(fileName: string): (Edit & { sheet: string })[] {
    const fileState = state[fileName];
    if (!fileState) return [];

    const allEdits: (Edit & { sheet: string })[] = [];
    for (const sheetName in fileState.sheets) {
        fileState.sheets[sheetName]?.edits.forEach(edit => {
            allEdits.push({ ...edit, sheet: sheetName });
        });
    }
    return allEdits;
}

export function clearEdits(fileName: string) {
    delete state[fileName];
}

export function applyEditsToData(data: any[][], edits: Edit[]): any[][] {
    const newData = JSON.parse(JSON.stringify(data)); // Deep copy
    edits.forEach(edit => {
        if (!newData[edit.row]) {
            newData[edit.row] = [];
        }
        newData[edit.row][edit.col] = edit.value;
    });
    return newData;
}
