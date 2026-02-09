const XLSX = require('xlsx');
const path = require('path');

const filePath = process.argv[2] || 'd:\\proyecto keyler rutas\\asignacion rutas contexto\\ASIGNACION DE TRABAJOS ISES (2).xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    console.log('=== EXCEL STRUCTURE ===\n');
    console.log('Sheet Names:', workbook.SheetNames);

    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (data.length > 0) {
            console.log('Headers (Row 1):', data[0]);
            console.log('Sample Row 2:', data[1]);
            console.log('Sample Row 3:', data[2]);
            console.log(`Total rows: ${data.length}`);
        }
    });
} catch (err) {
    console.error('Error:', err.message);
}
