import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';

const dataDir = path.join(process.cwd(), 'data');

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
    await ensureDataDir();
    const filePath = path.join(dataDir, fileName);
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
        throw new Error(`Sheet not found: ${sheetName}`);
    }

    const data: any[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const rowData: any[] = [];
        // exceljs row.values is 1-indexed and might contain objects for formulas
        // We convert it to a simple 0-indexed array of values
        for (let i = 1; i <= worksheet.columnCount; i++) {
            const cell = row.getCell(i);
            rowData.push(cell.value);
        }
        data[rowNumber - 1] = rowData;
    });

    return data;
}

// Save workbook and create backup
export async function saveWorkbook(fileName: string, edits: any[]): Promise<void> {
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
        console.log(`Backup created at ${backupPath}`);
    } catch (error) {
        console.error('Backup failed:', error);
        throw new Error('Failed to create backup before saving');
    }

    // 2. Load, Update and Save
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // Group edits by sheet
    const editsBySheet: Record<string, any[]> = {};
    edits.forEach(edit => {
        if (!editsBySheet[edit.sheet]) editsBySheet[edit.sheet] = [];
        editsBySheet[edit.sheet].push(edit);
    });

    for (const sheetName in editsBySheet) {
        const worksheet = workbook.getWorksheet(sheetName);
        if (worksheet) {
            editsBySheet[sheetName]?.forEach(edit => {
                const row = worksheet.getRow(edit.row + 1);
                const cell = row.getCell(edit.col + 1);
                cell.value = edit.value;
            });
        }
    }

    await workbook.xlsx.writeFile(filePath);
}
