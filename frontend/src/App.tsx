import { useState, useEffect, useCallback, useRef, memo, type FormEvent, type MouseEvent } from 'react'
import './App.css'

type StructureType = 'row' | 'col';
type StructureAction = 'insert' | 'delete';

type HeaderContextMenu = {
  kind: 'header';
  type: StructureType;
  index: number;
  x: number;
  y: number;
};

type CellCoord = {
  row: number;
  col: number;
};

type SelectionRange = {
  start: CellCoord;
  end: CellCoord;
};

type CellStyle = {
  fontColor?: string;
  fillColor?: string;
};

type CellContextMenu = {
  kind: 'cell';
  cells: CellCoord[];
  x: number;
  y: number;
};

type ContextMenu = HeaderContextMenu | CellContextMenu;

const TEXT_COLORS = ['#111111', '#C00000', '#E36C0A', '#008000', '#0070C0', '#7030A0', '#FFFFFF'];
const FILL_COLORS = ['#FFFFFF', '#FFF2CC', '#D9EAD3', '#DDEBF7', '#FCE4D6', '#EADCF8', '#F4CCCC'];

const getColumnName = (index: number) => {
  let name = '';
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
};

const getColumnCount = (data: any[][]) => {
  return Math.max(1, ...data.map((row) => Array.isArray(row) ? row.length : 0));
};

const getCellKey = (row: number, col: number) => `${row}:${col}`;

const getCellsInRange = (range: SelectionRange | null) => {
  if (!range) return [];

  const startRow = Math.min(range.start.row, range.end.row);
  const endRow = Math.max(range.start.row, range.end.row);
  const startCol = Math.min(range.start.col, range.end.col);
  const endCol = Math.max(range.start.col, range.end.col);
  const cells: CellCoord[] = [];

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      cells.push({ row, col });
    }
  }

  return cells;
};

const getUpdatedStyles = (
  styles: Record<string, CellStyle>,
  cells: CellCoord[],
  patch: { fontColor?: string | null; fillColor?: string | null }
) => {
  const nextStyles = { ...styles };

  cells.forEach((cell) => {
    const key = getCellKey(cell.row, cell.col);
    const nextStyle: CellStyle = { ...(nextStyles[key] || {}) };

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

    if (Object.keys(nextStyle).length > 0) {
      nextStyles[key] = nextStyle;
    } else {
      delete nextStyles[key];
    }
  });

  return nextStyles;
};

// Memoized Cell component to prevent unnecessary re-renders of the entire table
const Cell = memo(({ 
  row, 
  col, 
  value, 
  cellStyle,
  isSelected,
  isEditing, 
  editValue, 
  onCellMouseDown,
  onCellMouseEnter,
  onCellDoubleClick,
  onCellContextMenu,
  onEditChange, 
  onEditSubmit,
  renderCellValue,
  conflict 
}: {
  row: number;
  col: number;
  value: any;
  cellStyle?: CellStyle;
  isSelected: boolean;
  isEditing: boolean;
  editValue: string;
  onCellMouseDown: (row: number, col: number, event: MouseEvent<HTMLTableCellElement>) => void;
  onCellMouseEnter: (row: number, col: number) => void;
  onCellDoubleClick: (row: number, col: number, val: any) => void;
  onCellContextMenu: (row: number, col: number, event: MouseEvent<HTMLTableCellElement>) => void;
  onEditChange: (val: string) => void;
  onEditSubmit: () => void;
  renderCellValue: (val: any) => string;
  conflict: any;
}) => {
  const isEmpty = value === null || value === undefined || value === '';
  const isVisuallyEmpty = isEmpty && !cellStyle?.fillColor;
  const visualStyle = {
    color: cellStyle?.fontColor,
    backgroundColor: cellStyle?.fillColor
  };

  return (
    <td 
      className={`cell ${isEditing ? 'editing' : ''} ${isVisuallyEmpty ? 'empty' : ''} ${isSelected ? 'selected' : ''}`}
      style={visualStyle}
      onMouseDown={(event) => !isEditing && onCellMouseDown(row, col, event)}
      onMouseEnter={() => onCellMouseEnter(row, col)}
      onDoubleClick={() => !isEditing && onCellDoubleClick(row, col, value)}
      onContextMenu={(event) => onCellContextMenu(row, col, event)}
    >
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          style={visualStyle}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={() => !conflict && onEditSubmit()}
          onKeyDown={(e) => e.key === 'Enter' && !conflict && onEditSubmit()}
        />
      ) : (
        <span className="cell-content">
          {renderCellValue(value)}
        </span>
      )}
    </td>
  );
});

function App() {
  const [userId, setUserId] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<any[][]>([]);
  const [sheetStyles, setSheetStyles] = useState<Record<string, CellStyle>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<{row: number, col: number} | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [baseValue, setBaseValue] = useState<string>('');
  const [conflict, setConflict] = useState<{serverValue: any, localValue: any} | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  
  const pollingRef = useRef<number | null>(null);
  const editingStateRef = useRef({ editingCell, baseValue, editValue });
  const rowCount = Math.max(1, sheetData.length);
  const columnCount = getColumnCount(sheetData);
  const selectedCells = getCellsInRange(selection);

  useEffect(() => {
    editingStateRef.current = { editingCell, baseValue, editValue };
  }, [editingCell, baseValue, editValue]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!isSelecting) return;

    const stopSelecting = () => setIsSelecting(false);
    window.addEventListener('mouseup', stopSelecting);

    return () => {
      window.removeEventListener('mouseup', stopSelecting);
    };
  }, [isSelecting]);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (/^[a-zA-Z0-9]+$/.test(userId)) {
      setIsLoggedIn(true);
      fetchFiles();
    } else {
      alert('User ID must be alphanumeric only.');
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/files');
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const fetchSheets = async (fileName: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/files/${fileName}/sheets`);
      const data = await response.json();
      setSheets(data.sheets || []);
      setSelectedFile(fileName);
      setSelectedSheet(null);
      setSheetData([]);
      setSheetStyles({});
      setSelection(null);
      setContextMenu(null);
    } catch (error) {
      console.error('Error fetching sheets:', error);
    }
  };

  const renderCellValue = useCallback((value: any): string => {
    try {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') {
        if (value.result !== undefined) return renderCellValue(value.result);
        if (Array.isArray(value.richText)) return value.richText.map((rt: any) => rt?.text || '').join('');
        if (value instanceof Date) return value.toLocaleString();
        if (value.text !== undefined) return String(value.text);
        const str = JSON.stringify(value);
        return str === '{}' ? String(value) : str;
      }
      return String(value);
    } catch (error) {
      console.error('Error rendering cell value:', error, value);
      return '#ERROR#';
    }
  }, []);

  const fetchSheetData = useCallback(async (fileName: string, sheetName: string, showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3000/api/files/${fileName}/sheets/${sheetName}`);
      const data = await response.json();
      if (data.error) {
        alert('Error loading sheet data: ' + data.error);
        return;
      }
      const remoteData = data.data || [];
      const remoteStyles = data.styles || {};
      const { editingCell: curEditCell, baseValue: curBase, editValue: curVal } = editingStateRef.current;

      if (curEditCell) {
        const remoteRow = remoteData[curEditCell.row];
        const remoteValue = remoteRow ? renderCellValue(remoteRow[curEditCell.col]) : '';
        if (remoteValue !== curBase) {
          setConflict({ serverValue: remoteValue, localValue: curVal });
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          return;
        }
      }
      setSheetData(remoteData);
      setSheetStyles(remoteStyles);
    } catch (error) {
      console.error('Error fetching sheet data:', error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [renderCellValue]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3000/api/files/${selectedFile}/save`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        alert('File saved successfully (Backup created).');
        if (selectedSheet) fetchSheetData(selectedFile, selectedSheet);
      } else {
        alert('Failed to save: ' + (data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving file:', error);
      alert('Error saving file.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFile && selectedSheet) fetchSheetData(selectedFile, selectedSheet, true);
  }, [selectedFile, selectedSheet, fetchSheetData]);

  useEffect(() => {
    if (selectedFile && selectedSheet && !conflict) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = window.setInterval(() => {
        fetchSheetData(selectedFile, selectedSheet, false);
      }, 5000);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [selectedFile, selectedSheet, fetchSheetData, conflict]);

  const isCellInSelection = useCallback((row: number, col: number) => {
    return selectedCells.some(cell => cell.row === row && cell.col === col);
  }, [selectedCells]);

  const handleCellMouseDown = useCallback((row: number, col: number, event: MouseEvent<HTMLTableCellElement>) => {
    if (conflict || event.button !== 0) return;

    const cell = { row, col };
    setContextMenu(null);
    setIsSelecting(true);
    setSelection(currentSelection => {
      if (event.shiftKey && currentSelection) {
        return { start: currentSelection.start, end: cell };
      }
      return { start: cell, end: cell };
    });
  }, [conflict]);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (!isSelecting) return;
    setSelection(currentSelection => currentSelection ? { ...currentSelection, end: { row, col } } : currentSelection);
  }, [isSelecting]);

  const handleCellDoubleClick = useCallback((row: number, col: number, currentValue: any) => {
    if (conflict) return;
    const val = renderCellValue(currentValue);
    setEditingCell({ row, col });
    setEditValue(val);
    setBaseValue(val);
  }, [conflict, renderCellValue]);

  const handleCellContextMenu = useCallback((row: number, col: number, event: MouseEvent<HTMLTableCellElement>) => {
    event.preventDefault();
    if (conflict) return;

    const targetCell = { row, col };
    const cells = isCellInSelection(row, col) && selectedCells.length > 0 ? selectedCells : [targetCell];
    if (cells.length === 1) {
      setSelection({ start: targetCell, end: targetCell });
    }
    setContextMenu({
      kind: 'cell',
      cells,
      x: event.clientX,
      y: event.clientY
    });
  }, [conflict, isCellInSelection, selectedCells]);

  const handleEditSubmit = useCallback(async () => {
    if (!editingCell || !selectedFile || !selectedSheet) return;
    if (editValue === baseValue) {
      setEditingCell(null);
      return;
    }
    try {
      await fetch(`http://localhost:3000/api/files/${selectedFile}/sheets/${selectedSheet}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row: editingCell.row, col: editingCell.col, value: editValue, userId })
      });
      const newData = [...sheetData];
      if (!newData[editingCell.row]) newData[editingCell.row] = [];
      newData[editingCell.row]![editingCell.col] = editValue;
      setSheetData(newData);
      setEditingCell(null);
    } catch (error) {
      console.error('Error submitting edit:', error);
      alert('Failed to save edit.');
    }
  }, [editingCell, selectedFile, selectedSheet, editValue, baseValue, userId, sheetData]);

  const handleHeaderContextMenu = useCallback((event: MouseEvent, type: StructureType, index: number) => {
    event.preventDefault();
    if (conflict) return;
    setContextMenu({
      kind: 'header',
      type,
      index,
      x: event.clientX,
      y: event.clientY
    });
  }, [conflict]);

  const handleStructureChange = useCallback(async (type: StructureType, action: StructureAction, index: number) => {
    if (!selectedFile || !selectedSheet || conflict) return;

    setContextMenu(null);
    if (editingCell) {
      await handleEditSubmit();
    }

    try {
      const response = await fetch(`http://localhost:3000/api/files/${selectedFile}/sheets/${selectedSheet}/structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, action, index, userId })
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        alert('Failed to update sheet structure: ' + (data.error || 'Unknown error'));
        return;
      }

      await fetchSheetData(selectedFile, selectedSheet, false);
      setEditingCell(null);
    } catch (error) {
      console.error('Error updating sheet structure:', error);
      alert('Failed to update sheet structure.');
    }
  }, [selectedFile, selectedSheet, conflict, editingCell, handleEditSubmit, userId, fetchSheetData]);

  const handleApplyStyle = useCallback(async (style: { fontColor?: string | null; fillColor?: string | null }) => {
    if (!selectedFile || !selectedSheet || contextMenu?.kind !== 'cell') return;

    const cells = contextMenu.cells;
    setContextMenu(null);

    try {
      const response = await fetch(`http://localhost:3000/api/files/${selectedFile}/sheets/${selectedSheet}/style`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cells, style, userId })
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        alert('Failed to update cell colors: ' + (data.error || 'Unknown error'));
        return;
      }

      setSheetStyles(currentStyles => getUpdatedStyles(currentStyles, cells, style));
    } catch (error) {
      console.error('Error updating cell colors:', error);
      alert('Failed to update cell colors.');
    }
  }, [selectedFile, selectedSheet, contextMenu, userId]);

  const resolveConflict = (decision: 'local' | 'server') => {
    if (decision === 'server') {
      setEditingCell(null);
      setConflict(null);
      if (selectedFile && selectedSheet) fetchSheetData(selectedFile, selectedSheet);
    } else {
      if (conflict) setBaseValue(conflict.serverValue);
      setConflict(null);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <h1>Open Cell</h1>
        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Enter Alphanumeric User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <button type="submit">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h1>Open Cell - User: {userId}</h1>
        <div className="header-actions">
          {selectedFile && <button onClick={handleSave} className="save-btn" disabled={isLoading}>Save Changes</button>}
          <button onClick={() => {
            setIsLoggedIn(false);
            setUserId('');
            setSelectedFile(null);
            setSelectedSheet(null);
            setSheetData([]);
            setSheetStyles({});
            setSelection(null);
            setConflict(null);
            setContextMenu(null);
          }}>Logout</button>
        </div>
      </header>

      <main>
        <div className="sidebar">
          <section className="file-list">
            <h2>Files</h2>
            <ul>
              {files.map((file) => (
                <li key={file} onClick={() => fetchSheets(file)} className={selectedFile === file ? 'selected' : ''}>{file}</li>
              ))}
            </ul>
          </section>

          {selectedFile && (
            <section className="sheet-list">
              <h2>Sheets</h2>
              <ul>
                {sheets.map((sheet) => (
                  <li key={sheet} onClick={() => { setSelectedSheet(sheet); setSheetData([]); setSheetStyles({}); setEditingCell(null); setSelection(null); setConflict(null); setContextMenu(null); }} className={selectedSheet === sheet ? 'selected' : ''}>{sheet}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="editor-container">
          {selectedSheet ? (
            <div className="editor">
              {isLoading ? (
                <p>Loading...</p>
              ) : (
                <div className="grid-viewport">
                  <table className="excel-grid">
                    <thead>
                      <tr>
                        <th className="corner-header" aria-label="Sheet corner" />
                        {Array.from({ length: columnCount }, (_, colIndex) => (
                          <th
                            key={colIndex}
                            scope="col"
                            className="column-header"
                            onContextMenu={(event) => handleHeaderContextMenu(event, 'col', colIndex)}
                          >
                            {getColumnName(colIndex)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: rowCount }, (_, rowIndex) => {
                        const row = sheetData[rowIndex] || [];
                        return (
                        <tr key={rowIndex}>
                          <th
                            scope="row"
                            className="row-header"
                            onContextMenu={(event) => handleHeaderContextMenu(event, 'row', rowIndex)}
                          >
                            {rowIndex + 1}
                          </th>
                          {Array.from({ length: columnCount }, (_, colIndex) => (
                            <Cell
                              key={`${rowIndex}-${colIndex}`}
                              row={rowIndex}
                              col={colIndex}
                              value={Array.isArray(row) ? row[colIndex] : undefined}
                              cellStyle={sheetStyles[getCellKey(rowIndex, colIndex)]}
                              isSelected={isCellInSelection(rowIndex, colIndex)}
                              isEditing={editingCell?.row === rowIndex && editingCell?.col === colIndex}
                              editValue={editValue}
                              onCellMouseDown={handleCellMouseDown}
                              onCellMouseEnter={handleCellMouseEnter}
                              onCellDoubleClick={handleCellDoubleClick}
                              onCellContextMenu={handleCellContextMenu}
                              onEditChange={setEditValue}
                              onEditSubmit={handleEditSubmit}
                              renderCellValue={renderCellValue}
                              conflict={conflict}
                            />
                          ))}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="no-selection">
              <p>Please select a file and a sheet to start editing.</p>
            </div>
          )}
        </section>
      </main>

      {contextMenu && (
        <div
          className={`context-menu ${contextMenu.kind === 'cell' ? 'cell-context-menu' : ''}`}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {contextMenu.kind === 'header' && contextMenu.type === 'row' ? (
            <>
              <button type="button" role="menuitem" onClick={() => handleStructureChange('row', 'insert', contextMenu.index)}>
                Insert row above
              </button>
              <button type="button" role="menuitem" onClick={() => handleStructureChange('row', 'insert', contextMenu.index + 1)}>
                Insert row below
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={rowCount <= 1}
                onClick={() => handleStructureChange('row', 'delete', contextMenu.index)}
              >
                Delete row
              </button>
            </>
          ) : contextMenu.kind === 'header' ? (
            <>
              <button type="button" role="menuitem" onClick={() => handleStructureChange('col', 'insert', contextMenu.index)}>
                Insert column left
              </button>
              <button type="button" role="menuitem" onClick={() => handleStructureChange('col', 'insert', contextMenu.index + 1)}>
                Insert column right
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={columnCount <= 1}
                onClick={() => handleStructureChange('col', 'delete', contextMenu.index)}
              >
                Delete column
              </button>
            </>
          ) : (
            <>
              <div className="context-menu-label">{contextMenu.cells.length} cell{contextMenu.cells.length === 1 ? '' : 's'} selected</div>
              <div className="color-section">
                <span>Text color</span>
                <div className="swatch-row" role="group" aria-label="Text color">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={`text-${color}`}
                      type="button"
                      className="swatch-btn"
                      style={{ backgroundColor: color }}
                      title={color}
                      aria-label={`Set text color ${color}`}
                      onClick={() => handleApplyStyle({ fontColor: color })}
                    />
                  ))}
                </div>
              </div>
              <div className="color-section">
                <span>Fill color</span>
                <div className="swatch-row" role="group" aria-label="Fill color">
                  {FILL_COLORS.map((color) => (
                    <button
                      key={`fill-${color}`}
                      type="button"
                      className="swatch-btn"
                      style={{ backgroundColor: color }}
                      title={color}
                      aria-label={`Set fill color ${color}`}
                      onClick={() => handleApplyStyle({ fillColor: color })}
                    />
                  ))}
                </div>
              </div>
              <button type="button" role="menuitem" className="menu-command" onClick={() => handleApplyStyle({ fontColor: null, fillColor: null })}>
                Clear colors
              </button>
            </>
          )}
        </div>
      )}

      {conflict && (
        <div className="conflict-modal">
          <div className="modal-content">
            <h3>Conflict Detected!</h3>
            <p>Another user has modified this cell while you were editing.</p>
            <div className="comparison">
              <div><strong>Server's Value:</strong><pre>{conflict.serverValue}</pre></div>
              <div><strong>Your Value:</strong><pre>{conflict.localValue}</pre></div>
            </div>
            <div className="modal-actions">
              <button onClick={() => resolveConflict('server')}>Use Server Value</button>
              <button onClick={() => resolveConflict('local')}>Keep My Value</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App
