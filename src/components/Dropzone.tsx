import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, FileJson, ClipboardPaste, Settings2, ClipboardCheck } from 'lucide-react';
import type { EnvironmentMode, ParserConfig } from '../utils/parser';
import { SCENARIOS } from '../data/scenarios';

export interface ScenarioSelection {
  num: number;
  gender: 'male' | 'female';
}

interface DropzoneProps {
  onFileParsed: (data: unknown, mode: EnvironmentMode, config: ParserConfig, scenario: ScenarioSelection) => void;
}

const MODES: { value: EnvironmentMode; label: string }[] = [
  { value: 'prod single agent', label: 'Prod Single Agent' },
  { value: 'prod multi agent', label: 'Prod Multi Agent' },
  { value: 'pre-prod', label: 'Pre-Prod' },
];

function KeywordChips({ options, value, onSelect }: {
  options: string[];
  value: string;
  onSelect: (keyword: string) => void;
}) {
  return (
    <div className="chip-row">
      {options.map(option => (
        <button
          key={option}
          onClick={() => onSelect(option)}
          className={`keyword-chip ${value === option ? 'active' : ''}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Dropzone({ onFileParsed }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [mode, setMode] = useState<EnvironmentMode>('prod single agent');
  const [functionKeyword, setFunctionKeyword] = useState('PythonFunctionTool');
  const [transferKeyword, setTransferKeyword] = useState('agentTransfer');
  const [endSessionKeyword, setEndSessionKeyword] = useState('EndSessionTool');
  const [scenarioNum, setScenarioNum] = useState(1);
  const [scenarioGender, setScenarioGender] = useState<'male' | 'female'>('male');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scenario numbers depend on the environment (single vs multi) and the gender.
  const scenarioNumbers = useMemo(() => {
    const kind = mode === 'prod multi agent' ? 'multi' : 'single';
    return [...new Set(
      SCENARIOS.filter(s => s.agentType === kind && s.gender === scenarioGender).map(s => s.num)
    )].sort((a, b) => a - b);
  }, [mode, scenarioGender]);

  // Keep the selection valid when the environment or gender changes.
  const activeScenario = scenarioNumbers.includes(scenarioNum) ? scenarioNum : (scenarioNumbers[0] ?? 1);
  const scenarioTitle = (n: number) => {
    const kind = mode === 'prod multi agent' ? 'multi' : 'single';
    return SCENARIOS.find(s => s.agentType === kind && s.gender === scenarioGender && s.num === n)?.title || '';
  };

  const handleModeChange = (newMode: EnvironmentMode) => {
    setMode(newMode);
    setFunctionKeyword(newMode === 'pre-prod' ? 'toolCall' : 'PythonFunctionTool');
  };

  const processText = (text: string) => {
    try {
      const json = JSON.parse(text);
      onFileParsed(json, mode, { functionKeyword, transferKeyword, endSessionKeyword }, {
        num: activeScenario,
        gender: scenarioGender,
      });
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(`Error parsing JSON: ${err.message}`);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.txt') && !file.name.endsWith('.json')) {
      setError('Please upload a valid .txt or .json file.');
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

  // Accept file drops anywhere on the page, not just inside the dropzone box.
  const processFileRef = useRef(processFile);
  processFileRef.current = processFile;

  useEffect(() => {
    let depth = 0;

    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        depth++;
        setIsDragging(true);
      }
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDragging(false);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) processFileRef.current(file);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

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
      <div className="mode-selector glass animate-fade-in">
        <div className="mode-selector-header">
          <Settings2 className="btn-icon" style={{ color: 'var(--primary)' }} />
          <h3 className="panel-title">Select Target Environment</h3>
        </div>
        <p className="mode-selector-hint">
          Choose your environment to filter exactly which tool structures to look for.
        </p>
        <div className="segmented-control">
          {MODES.map(({ value, label }) => (
            <button
              key={value}
              className={`segment-btn ${mode === value ? 'active' : ''}`}
              onClick={() => handleModeChange(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="config-grid">
          <div className="config-field">
            <label className="field-label">Function Tool Keyword</label>
            <input
              type="text"
              value={functionKeyword}
              placeholder={mode === 'pre-prod' ? 'toolCall' : 'PythonFunctionTool'}
              onChange={(e) => setFunctionKeyword(e.target.value)}
              className="text-input"
            />
            <KeywordChips
              options={['toolCall', 'PythonFunctionTool']}
              value={functionKeyword}
              onSelect={setFunctionKeyword}
            />
          </div>
          {mode === 'prod multi agent' && (
            <div className="config-field">
              <label className="field-label">Transfer Tool Keyword</label>
              <input
                type="text"
                value={transferKeyword}
                placeholder="agentTransfer"
                onChange={(e) => setTransferKeyword(e.target.value)}
                className="text-input"
              />
            </div>
          )}
          {mode !== 'pre-prod' && (
            <div className="config-field">
              <label className="field-label">End Session Tool Keyword</label>
              <input
                type="text"
                value={endSessionKeyword}
                placeholder="EndSessionTool"
                onChange={(e) => setEndSessionKeyword(e.target.value)}
                className="text-input"
              />
              <KeywordChips
                options={['toolCall', 'EndSessionTool']}
                value={endSessionKeyword}
                onSelect={setEndSessionKeyword}
              />
            </div>
          )}
        </div>

        <div className="scenario-select-row">
          <div className="mode-selector-header">
            <ClipboardCheck className="btn-icon" style={{ color: 'var(--primary)' }} />
            <h3 className="panel-title">
              Scenario
              <span className="beta-tag">beta</span>
            </h3>
          </div>
          <p className="mode-selector-hint">
            Pick the scenario you are rating so the Scenario Check can compare the expected calls.
          </p>
          <div className="config-grid">
            <div className="config-field">
              <label className="field-label">Scenario number</label>
              <select
                className="select-input"
                value={activeScenario}
                onChange={(e) => setScenarioNum(Number(e.target.value))}
              >
                {scenarioNumbers.map(n => (
                  <option key={n} value={n}>{n}. {scenarioTitle(n)}</option>
                ))}
              </select>
            </div>
            <div className="config-field">
              <label className="field-label">Gender</label>
              <div className="segmented-control">
                {(['male', 'female'] as const).map(g => (
                  <button
                    key={g}
                    className={`segment-btn ${scenarioGender === g ? 'active' : ''}`}
                    onClick={() => setScenarioGender(g)}
                  >
                    {g === 'male' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="upload-section animate-fade-in">
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`glass dropzone-area ${isDragging ? 'dragging' : ''}`}
        >
          <div className="dropzone-icon-bg">
            <Upload className="dropzone-icon" />
          </div>
          <h3 className="dropzone-title">Upload JSON File</h3>
          <p className="dropzone-subtitle">
            Drag and drop your .txt or .json file here, or click to browse
          </p>

          <div className="btn-primary">
            <FileJson className="btn-icon" />
            Select File
          </div>
          <input
            type="file"
            accept=".txt,.json"
            style={{ display: 'none' }}
            onChange={handleFileInput}
            ref={fileInputRef}
          />
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
              <ClipboardPaste className="btn-icon" />
              Process Pasted Text
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message animate-fade-in">
          {error}
        </div>
      )}

      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">
            <Upload className="drop-overlay-icon" />
            <span>Drop it anywhere</span>
          </div>
        </div>
      )}
    </div>
  );
}
