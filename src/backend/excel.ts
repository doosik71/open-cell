import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import type { CellStyle } from './state.js';

const dataDir = path.join(process.cwd(), 'data');

function colorToHex(color: any): string | undefined {
    const raw = typeof color?.argb === 'string' ? color.argb : typeof color?.rgb === 'string' ? color.rgb : undefined;
    if (!raw) return undefined;

    const normalized = raw.replace(/^#/, '').toUpperCase();
    if (/^[0-9A-F]{8}$/.test(normalized)) return `#${normalized.slice(2)}`;
    if (/^[0-9A-F]{6}$/.test(normalized)) return `#${normalized}`;
    return undefined;
}

function hexToArgb(color: string): string {
    return `FF${color.replace(/^#/, '').toUpperCase()}`;
}

function getCellStyle(cell: ExcelJS.Cell): CellStyle | undefined {
    const style: CellStyle = {};
    const fontColor = colorToHex((cell.font as any)?.color);
    const fill = cell.fill as any;
    const fillColor = fill?.type === 'pattern' && fill?.pattern === 'solid' ? colorToHex(fill.fgColor) : undefined;

    if (fontColor) style.fontColor = fontColor;
    if (fillColor) style.fillColor = fillColor;

    return Object.keys(style).length > 0 ? style : undefined;
}

function applyCellStylePatch(cell: ExcelJS.Cell, patch: { fontColor?: string | null; fillColor?: string | null }) {
    if (patch.fontColor !== undefined) {
        const nextFont = { ...((cell.font || {}) as any) };
        if (patch.fontColor === null) {
            delete nextFont.color;
        } else {
            nextFont.color = { argb: hexToArgb(patch.fontColor) };
        }
        (cell as any).font = Object.keys(nextFont).length > 0 ? nextFont : undefined;
    }

    if (patch.fillColor !== undefined) {
        if (patch.fillColor === null) {
            (cell as any).fill = undefined;
        } else {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: hexToArgb(patch.fillColor) }
            };
        }
    }
}

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.access(dataDir);
    } catch (error) {
        await fs.mkdir(dataDir, { recursive: true });
    }
}

// Get list of .xlsx files
export async function getFiles(): Promise<string[]> {
    await ensureDataDir();
    const files = await fs.readdir(dataDir);
    return files.filter(file => file.endsWith('.xlsx'));
}

// Get list of sheets in a file
export async function getSheets(fileName: string): Promise<string[]> {
    await ensureDataDir();
    const filePath = path.join(dataDir, fileName);
    
    try {
        await fs.access(filePath);
    } catch (error) {
        throw new Error(`File not found: ${fileName}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    return workbook.worksheets.map(sheet => sheet.name);
}

// Get full data of a specific sheet
export async function getSheetData(fileName: string, sheetName: string): Promise<any[][]> {
    const sheet = await getSheetDataAndStyles(fileName, sheetName);
    return sheet.data;
}

// Get full data and persisted style of a specific sheet
export async function getSheetDataAndStyles(fileName: string, sheetName: string): Promise<{ data: any[][]; styles: Record<string, CellStyle> }> {
    await ensureDataDir();
    const filePath = path.join(dataDir, fileName);
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
        throw new Error(`Sheet not found: ${sheetName}`);
    }

    const data: any[][] = [];
    const styles: Record<string, CellStyle> = {};

    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const rowData: any[] = [];
        // exceljs row.values is 1-indexed and might contain objects for formulas
        // We convert it to a simple 0-indexed array of values
        for (let i = 1; i <= worksheet.columnCount; i++) {
            const cell = row.getCell(i);
            rowData.push(cell.value);
            const style = getCellStyle(cell);
            if (style) {
                styles[`${rowNumber - 1}:${i - 1}`] = style;
            }
        }
        data[rowNumber - 1] = rowData;
    }

    return { data, styles };
}

// Save workbook and create backup
export async function saveWorkbook(fileName: string, edits: any[], structuralChanges: any[] = [], stylePatches: any[] = []): Promise<void> {
    await ensureDataDir();
    const filePath = path.join(dataDir, fileName);
    
    // 1. Create Backup
    const fileBaseName = path.basename(fileName, '.xlsx');
    const backupDir = path.join(dataDir, fileBaseName);
    try {
        await fs.access(backupDir);
    } catch {
        await fs.mkdir(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${timestamp}.xlsx`);
    
    try {
        await fs.copyFile(filePath, backupPath);
    } catch (error) {
        console.error('Backup failed:', error);
        throw new Error('Failed to create backup before saving');
    }

    // 2. Load and Apply Changes
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // Group changes by sheet
    const editsBySheet: Record<string, any[]> = {};
    edits.forEach(edit => {
        if (!editsBySheet[edit.sheet]) editsBySheet[edit.sheet] = [];
        editsBySheet[edit.sheet]!.push(edit);
    });

    const changesBySheet: Record<string, any[]> = {};
    structuralChanges.forEach(change => {
        if (!changesBySheet[change.sheet]) changesBySheet[change.sheet] = [];
        changesBySheet[change.sheet]!.push(change);
    });

    const stylesBySheet: Record<string, any[]> = {};
    stylePatches.forEach(patch => {
        if (!stylesBySheet[patch.sheet]) stylesBySheet[patch.sheet] = [];
        stylesBySheet[patch.sheet]!.push(patch);
    });

    const allSheetNames = new Set([...Object.keys(editsBySheet), ...Object.keys(changesBySheet), ...Object.keys(stylesBySheet)]);

    for (const sheetName of allSheetNames) {
        const worksheet = workbook.getWorksheet(sheetName);
        if (!worksheet) continue;

        // 1. Apply structural changes first (preserving order)
        changesBySheet[sheetName]?.forEach(change => {
            if (change.type === 'row') {
                if (change.action === 'insert') {
                    worksheet.spliceRows(change.index + 1, 0, []);
                } else {
                    worksheet.spliceRows(change.index + 1, 1);
                }
            } else { // col
                if (change.action === 'insert') {
                    worksheet.spliceColumns(change.index + 1, 0, []);
                } else {
                    worksheet.spliceColumns(change.index + 1, 1);
                }
            }
        });

        // 2. Apply cell edits
        editsBySheet[sheetName]?.forEach(edit => {
            const row = worksheet.getRow(edit.row + 1);
            const cell = row.getCell(edit.col + 1);
            cell.value = edit.value;
        });

        // 3. Apply cell style patches
        stylesBySheet[sheetName]?.forEach(patch => {
            const row = worksheet.getRow(patch.row + 1);
            const cell = row.getCell(patch.col + 1);
            applyCellStylePatch(cell, patch);
        });
    }

    await workbook.xlsx.writeFile(filePath);
}
