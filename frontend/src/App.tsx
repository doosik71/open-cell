import { useState, useEffect, useCallback, useRef, memo } from 'react'
import './App.css'

// Memoized Cell component to prevent unnecessary re-renders of the entire table
const Cell = memo(({ 
  row, 
  col, 
  value, 
  isEditing, 
  editValue, 
  onCellClick, 
  onEditChange, 
  onEditSubmit,
  renderCellValue,
  conflict 
}: {
  row: number;
  col: number;
  value: any;
  isEditing: boolean;
  editValue: string;
  onCellClick: (row: number, col: number, val: any) => void;
  onEditChange: (val: string) => void;
  onEditSubmit: () => void;
  renderCellValue: (val: any) => string;
  conflict: any;
}) => {
  const isEmpty = value === null || value === undefined || value === '';

  return (
    <td 
      className={`cell ${isEditing ? 'editing' : ''} ${isEmpty ? 'empty' : ''}`}
      onClick={() => !isEditing && onCellClick(row, col, value)}
    >
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
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
  const [isLoading, setIsLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<{row: number, col: number} | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [baseValue, setBaseValue] = useState<string>('');
  const [conflict, setConflict] = useState<{serverValue: any, localValue: any} | null>(null);
  
  const pollingRef = useRef<number | null>(null);
  const editingStateRef = useRef({ editingCell, baseValue, editValue });

  useEffect(() => {
    editingStateRef.current = { editingCell, baseValue, editValue };
  }, [editingCell, baseValue, editValue]);

  const handleLogin = (e: React.FormEvent) => {
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

  const handleCellClick = useCallback((row: number, col: number, currentValue: any) => {
    if (conflict) return;
    const val = renderCellValue(currentValue);
    setEditingCell({ row, col });
    setEditValue(val);
    setBaseValue(val);
  }, [conflict, renderCellValue]);

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
            setConflict(null);
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
                  <li key={sheet} onClick={() => { setSelectedSheet(sheet); setEditingCell(null); setConflict(null); }} className={selectedSheet === sheet ? 'selected' : ''}>{sheet}</li>
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
                    <tbody>
                      {Array.isArray(sheetData) && sheetData.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          <td className="row-header">{rowIndex + 1}</td>
                          {Array.isArray(row) && row.map((cell, colIndex) => (
                            <Cell
                              key={`${rowIndex}-${colIndex}`}
                              row={rowIndex}
                              col={colIndex}
                              value={cell}
                              isEditing={editingCell?.row === rowIndex && editingCell?.col === colIndex}
                              editValue={editValue}
                              onCellClick={handleCellClick}
                              onEditChange={setEditValue}
                              onEditSubmit={handleEditSubmit}
                              renderCellValue={renderCellValue}
                              conflict={conflict}
                            />
                          ))}
                        </tr>
                      ))}
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
