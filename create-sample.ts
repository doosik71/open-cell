import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

async function createSample() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const workbook = new ExcelJS.Workbook();
    const sheet1 = workbook.addWorksheet('Sheet1');
    sheet1.addRow(['ID', 'Name', 'Age']);
    sheet1.addRow([1, 'Alice', 30]);
    sheet1.addRow([2, 'Bob', 25]);
    
    const sheet2 = workbook.addWorksheet('Summary');
    sheet2.addRow(['Total Users', 2]);

    await workbook.xlsx.writeFile(path.join(dataDir, 'sample.xlsx'));
    console.log('Sample file created.');
}

createSample();
