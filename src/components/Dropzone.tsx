import React, { useState, useCallback } from 'react';
import { Upload, FileJson, ClipboardPaste, Settings2 } from 'lucide-react';
import type { EnvironmentMode } from '../utils/parser';

interface DropzoneProps {
  onFileParsed: (data: any, mode: EnvironmentMode) => void;
}

export function Dropzone({ onFileParsed }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [mode, setMode] = useState<EnvironmentMode>('pre-prod');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processText = (text: string) => {
    try {
      const json = JSON.parse(text);
      onFileParsed(json, mode);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(`Error parsing JSON: ${err.message}`);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.json') && !file.name.endsWith('.txt')) {
      setError('Please upload a valid .json or .txt file.');
      return;
    }
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        processText(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [onFileParsed, mode]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) {
      setError('Please paste some content first.');
      return;
    }
    processText(pastedText);
  };

  return (
    <div className="dropzone-container">
      
      {/* Mode Selector */}
      <div className="mode-selector glass animate-fade-in">
        <div className="mode-selector-header">
          <Settings2 style={{ width: '1.25rem', height: '1.25rem', color: 'var(--primary)' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)' }}>Select Target Environment</h3>
        </div>
        <p style={{ color: 'rgba(248,250,252,0.7)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Choose your environment to filter exactly which tool structures to look for.
        </p>
        <div className="segmented-control">
          <button 
            className={`segment-btn ${mode === 'pre-prod' ? 'active' : ''}`}
            onClick={() => setMode('pre-prod')}
          >
            Pre-Prod
          </button>
          <button 
            className={`segment-btn ${mode === 'prod single agent' ? 'active' : ''}`}
            onClick={() => setMode('prod single agent')}
          >
            Prod Single Agent
          </button>
          <button 
            className={`segment-btn ${mode === 'prod multi agent' ? 'active' : ''}`}
            onClick={() => setMode('prod multi agent')}
          >
            Prod Multi Agent
          </button>
        </div>
      </div>

      <div className="upload-section animate-fade-in" style={{ marginTop: '2rem' }}>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`glass dropzone-area ${isDragging ? 'dragging' : ''}`}
        >
          <div className="dropzone-icon-bg">
            <Upload className="dropzone-icon" />
          </div>
          <h3 className="dropzone-title text-foreground">Upload AI Training Data</h3>
          <p className="dropzone-subtitle">
            Drag and drop your .json or .txt file here, or click to browse
          </p>
          
          <label className="btn-primary">
            <FileJson className="w-4 h-4" style={{ width: '1rem', height: '1rem' }} />
            Select File
            <input 
              type="file" 
              accept=".json,.txt" 
              className="hidden-input" 
              onChange={handleFileInput}
            />
          </label>
        </div>

        <div className="divider">
          <span>OR PASTE CONTENT</span>
        </div>

        <div className="glass paste-area">
          <textarea
            className="paste-textarea"
            placeholder="Paste your raw JSON content here..."
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
          />
          <div className="paste-actions">
            <button className="btn-primary" onClick={handlePasteSubmit}>
              <ClipboardPaste style={{ width: '1rem', height: '1rem' }} />
              Process Pasted Text
            </button>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="error-message animate-fade-in" style={{ marginTop: '1.5rem' }}>
          {error}
        </div>
      )}
    </div>
  );
}
