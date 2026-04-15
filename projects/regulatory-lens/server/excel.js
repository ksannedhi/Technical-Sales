import ExcelJS from 'exceljs';

const COVERAGE_COLORS = {
  'full':          'FF3B6D11',
  'partial':       'FFBA7517',
  'not-addressed': 'FFD5D5D5',
  'unknown':       'FFEEEEEE'
};

const COVERAGE_LABELS = {
  'full':          'Full',
  'partial':       'Partial',
  'not-addressed': '—',
  'unknown':       '?'
};

export async function generateExcel(harmonisationResults, selectedFrameworks, frameworkWeights, taxonomy) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cross-Framework Harmoniser';
  wb.created = new Date();

  // ── Sheet 1: Coverage Matrix ──────────────────────────────────────────────
  const matrixSheet = wb.addWorksheet('Coverage Matrix');

  // Header row
  const headerRow = ['Control Domain', 'Description', ...selectedFrameworks, 'Effort'];
  matrixSheet.addRow(headerRow);

  // Style header
  matrixSheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF666666' } } };
  });
  matrixSheet.getRow(1).height = 36;

  // Set column widths
  matrixSheet.getColumn(1).width = 30;
  matrixSheet.getColumn(2).width = 40;
  selectedFrameworks.forEach((_, i) => { matrixSheet.getColumn(i + 3).width = 14; });
  matrixSheet.getColumn(selectedFrameworks.length + 3).width = 14;

  // Data rows
  harmonisationResults.forEach((domain, rowIdx) => {
    const rowData = [
      domain.domainLabel,
      domain.description,
      ...selectedFrameworks.map(fwId => {
        const cov = domain.coverageByFramework?.[fwId];
        return COVERAGE_LABELS[cov?.coverage] || '?';
      }),
      domain.estimatedEffort || '—'
    ];

    const row = matrixSheet.addRow(rowData);
    row.height = 28;

    // Style domain name
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).font = { size: 10, color: { argb: 'FF555555' } };
    row.getCell(2).alignment = { wrapText: true };

    // Color-code coverage cells
    selectedFrameworks.forEach((fwId, i) => {
      const cov = domain.coverageByFramework?.[fwId]?.coverage || 'unknown';
      const cell = row.getCell(i + 3);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COVERAGE_COLORS[cov] } };
      cell.font = { size: 10, bold: cov === 'full', color: { argb: cov === 'full' ? 'FF27500A' : cov === 'partial' ? 'FF633806' : 'FF888888' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { all: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
    });

    // Alternate row background
    if (rowIdx % 2 === 1) {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
    }
  });

  // ── Sheet 2: Key Requirements ─────────────────────────────────────────────
  const reqSheet = wb.addWorksheet('Key Requirements');
  reqSheet.addRow(['Domain', 'Framework', 'Weight', 'Coverage', 'Key Requirement', 'Most Demanding']);
  reqSheet.getRow(1).font = { bold: true };

  harmonisationResults.forEach(domain => {
    selectedFrameworks.forEach(fwId => {
      const cov = domain.coverageByFramework?.[fwId];
      if (!cov || cov.coverage === 'not-addressed') return;
      reqSheet.addRow([
        domain.domainLabel,
        fwId,
        frameworkWeights[fwId] || 'voluntary',
        cov.coverage,
        cov.keyRequirement || '',
        domain.mostDemandingFramework === fwId ? 'Yes' : ''
      ]);
    });
  });

  reqSheet.columns.forEach(col => { col.width = 25; });

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}
