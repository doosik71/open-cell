interface Edit {
    row: number;
    col: number;
    value: any;
    userId: string;
    timestamp: number;
}

interface StructuralChange {
    type: 'row' | 'col';
    action: 'insert' | 'delete';
    index: number;
    timestamp: number;
}

export interface CellStyle {
    fontColor?: string;
    fillColor?: string;
}

export interface CellStylePatch {
    fontColor?: string | null;
    fillColor?: string | null;
    userId: string;
    timestamp: number;
}

interface SheetState {
    edits: Edit[];
    structuralChanges: StructuralChange[];
    stylePatches: Record<string, CellStylePatch>;
}

interface FileState {
    sheets: Record<string, SheetState>;
}

// In-memory state: fileName -> FileState
const state: Record<string, FileState> = {};

function getOrCreateSheetState(fileName: string, sheetName: string): SheetState {
    if (!state[fileName]) {
        state[fileName] = { sheets: {} };
    }
    if (!state[fileName]!.sheets[sheetName]) {
        state[fileName]!.sheets[sheetName] = { edits: [], structuralChanges: [], stylePatches: {} };
    }
    return state[fileName]!.sheets[sheetName]!;
}

function getCellKey(row: number, col: number): string {
    return `${row}:${col}`;
}

function parseCellKey(key: string): { row: number; col: number } {
    const [row, col] = key.split(':').map(Number);
    return { row: row || 0, col: col || 0 };
}

function shiftCoordinate(row: number, col: number, change: Omit<StructuralChange, 'timestamp'>) {
    if (change.type === 'row') {
        if (change.action === 'insert' && row >= change.index) {
            return { row: row + 1, col };
        }
        if (change.action === 'delete') {
            if (row === change.index) return null;
            if (row > change.index) return { row: row - 1, col };
        }
    } else {
        if (change.action === 'insert' && col >= change.index) {
            return { row, col: col + 1 };
        }
        if (change.action === 'delete') {
            if (col === change.index) return null;
            if (col > change.index) return { row, col: col - 1 };
        }
    }

    return { row, col };
}

function applyStylePatch(baseStyle: CellStyle | undefined, patch: Omit<CellStylePatch, 'timestamp' | 'userId'>): CellStyle | undefined {
    const nextStyle: CellStyle = { ...(baseStyle || {}) };

    if (patch.fontColor !== undefined) {
        if (patch.fontColor === null) {
            delete nextStyle.fontColor;
        } else {
            nextStyle.fontColor = patch.fontColor;
        }
    }

    if (patch.fillColor !== undefined) {
        if (patch.fillColor === null) {
            delete nextStyle.fillColor;
        } else {
            nextStyle.fillColor = patch.fillColor;
        }
    }

    return Object.keys(nextStyle).length > 0 ? nextStyle : undefined;
}

export function addEdit(fileName: string, sheetName: string, edit: Omit<Edit, 'timestamp'>) {
    const sheetState = getOrCreateSheetState(fileName, sheetName);
    
    // Remove previous edits for the same cell
    sheetState.edits = sheetState.edits.filter(e => !(e.row === edit.row && e.col === edit.col));
    
    sheetState.edits.push({
        ...edit,
        timestamp: Date.now()
    });
}

export function addStructuralChange(fileName: string, sheetName: string, change: Omit<StructuralChange, 'timestamp'>) {
    const sheetState = getOrCreateSheetState(fileName, sheetName);
    
    // Adjust existing edits' indices based on the new structural change
    sheetState.edits = sheetState.edits.map(edit => {
        if (change.type === 'row') {
            if (change.action === 'insert' && edit.row >= change.index) {
                return { ...edit, row: edit.row + 1 };
            }
            if (change.action === 'delete') {
                if (edit.row === change.index) return null; // Edit cell was deleted
                if (edit.row > change.index) return { ...edit, row: edit.row - 1 };
            }
        } else { // col
            if (change.action === 'insert' && edit.col >= change.index) {
                return { ...edit, col: edit.col + 1 };
            }
            if (change.action === 'delete') {
                if (edit.col === change.index) return null; // Edit cell was deleted
                if (edit.col > change.index) return { ...edit, col: edit.col - 1 };
            }
        }
        return edit;
    }).filter((e): e is Edit => e !== null);

    const shiftedStylePatches: Record<string, CellStylePatch> = {};
    Object.entries(sheetState.stylePatches).forEach(([key, patch]) => {
        const { row, col } = parseCellKey(key);
        const shifted = shiftCoordinate(row, col, change);
        if (shifted) {
            shiftedStylePatches[getCellKey(shifted.row, shifted.col)] = patch;
        }
    });
    sheetState.stylePatches = shiftedStylePatches;

    sheetState.structuralChanges.push({
        ...change,
        timestamp: Date.now()
    });
}

export function addStylePatches(
    fileName: string,
    sheetName: string,
    cells: { row: number; col: number }[],
    style: Omit<CellStylePatch, 'timestamp' | 'userId'>,
    userId: string
) {
    const sheetState = getOrCreateSheetState(fileName, sheetName);
    const timestamp = Date.now();

    cells.forEach(cell => {
        const key = getCellKey(cell.row, cell.col);
        const existing = sheetState.stylePatches[key];
        const nextPatch: CellStylePatch = {
            ...(existing || {}),
            ...style,
            userId,
            timestamp
        };

        if (nextPatch.fontColor === undefined && nextPatch.fillColor === undefined) {
            delete sheetState.stylePatches[key];
        } else {
            sheetState.stylePatches[key] = nextPatch;
        }
    });
}

export function getEdits(fileName: string, sheetName: string): Edit[] {
    return state[fileName]?.sheets[sheetName]?.edits || [];
}

export function getStructuralChanges(fileName: string, sheetName: string): StructuralChange[] {
    return state[fileName]?.sheets[sheetName]?.structuralChanges || [];
}

export function getStylePatches(fileName: string, sheetName: string): Record<string, CellStylePatch> {
    return state[fileName]?.sheets[sheetName]?.stylePatches || {};
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

export function getAllStructuralChangesForFile(fileName: string): (StructuralChange & { sheet: string })[] {
    const fileState = state[fileName];
    if (!fileState) return [];

    const allChanges: (StructuralChange & { sheet: string })[] = [];
    for (const sheetName in fileState.sheets) {
        fileState.sheets[sheetName]?.structuralChanges.forEach(change => {
            allChanges.push({ ...change, sheet: sheetName });
        });
    }
    return allChanges;
}

export function clearEdits(fileName: string) {
    delete state[fileName];
}

function getColumnCount(data: any[][]): number {
    return data.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
}

export function getAllStylePatchesForFile(fileName: string): (CellStylePatch & { row: number; col: number; sheet: string })[] {
    const fileState = state[fileName];
    if (!fileState) return [];

    const allPatches: (CellStylePatch & { row: number; col: number; sheet: string })[] = [];
    for (const sheetName in fileState.sheets) {
        const sheetState = fileState.sheets[sheetName];
        if (!sheetState) continue;

        Object.entries(sheetState.stylePatches).forEach(([key, patch]) => {
            const { row, col } = parseCellKey(key);
            allPatches.push({ ...patch, row, col, sheet: sheetName });
        });
    }

    return allPatches;
}

function createEmptyRow(columnCount: number): any[] {
    return Array.from({ length: columnCount }, () => null);
}

export function applyEditsToData(data: any[][], edits: Edit[], structuralChanges: StructuralChange[]): any[][] {
    const newData = data.map(row => Array.isArray(row) ? [...row] : []);

    // 1. Apply structural changes first to the base data
    structuralChanges.forEach(change => {
        if (change.type === 'row') {
            if (change.action === 'insert') {
                newData.splice(change.index, 0, createEmptyRow(getColumnCount(newData)));
            } else {
                newData.splice(change.index, 1);
            }
        } else { // col
            const columnCount = getColumnCount(newData);
            newData.forEach((row: any[]) => {
                while (row.length < columnCount) {
                    row.push(null);
                }
                if (change.action === 'insert') {
                    row.splice(change.index, 0, null);
                } else {
                    row.splice(change.index, 1);
                }
            });
        }
    });

    // 2. Apply cell edits
    edits.forEach(edit => {
        if (!newData[edit.row]) {
            newData[edit.row] = [];
        }
        newData[edit.row]![edit.col] = edit.value;
    });
    return newData;
}

export function applyStyleChangesToStyles(
    baseStyles: Record<string, CellStyle>,
    patches: Record<string, CellStylePatch>,
    structuralChanges: StructuralChange[]
): Record<string, CellStyle> {
    let styles: Record<string, CellStyle> = { ...baseStyles };

    structuralChanges.forEach(change => {
        const shiftedStyles: Record<string, CellStyle> = {};
        Object.entries(styles).forEach(([key, style]) => {
            const { row, col } = parseCellKey(key);
            const shifted = shiftCoordinate(row, col, change);
            if (shifted) {
                shiftedStyles[getCellKey(shifted.row, shifted.col)] = style;
            }
        });
        styles = shiftedStyles;
    });

    Object.entries(patches).forEach(([key, patch]) => {
        const nextStyle = applyStylePatch(styles[key], patch);
        if (nextStyle) {
            styles[key] = nextStyle;
        } else {
            delete styles[key];
        }
    });

    return styles;
}
