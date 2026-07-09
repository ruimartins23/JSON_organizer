import { useState, useMemo, useEffect } from 'react';
import type { OrganizedTimeline, ParsedEvent } from '../utils/parser';
import { Activity, Copy, Download } from 'lucide-react';

interface TimelineViewProps {
  data: OrganizedTimeline;
  onReset: () => void;
}

export function TimelineView({ data, onReset }: TimelineViewProps) {
  const [copySummaryStatus, setCopySummaryStatus] = useState('Copy Summary');
  const [copyTranscriptStatus, setCopyTranscriptStatus] = useState('Copy Transcript');
  const [copySessionStatus, setCopySessionStatus] = useState('Copy');
  const [copyDurationStatus, setCopyDurationStatus] = useState('Copy');
  
  const [summaryFileName, setSummaryFileName] = useState('Telco-AM-(task number)-Clear-JSON-A.txt');
  const [transcriptFileName, setTranscriptFileName] = useState('Telco-AM-(task number)-Clear-Transcript-A.txt');
  
  const [selectedAgent, setSelectedAgent] = useState<'A' | 'B'>('A');
  const [taskNumber, setTaskNumber] = useState('');
  const [clarity, setClarity] = useState<'Clear' | 'Noisy'>('Clear');

  useEffect(() => {
    const taskStr = taskNumber.trim() ? taskNumber.trim() : '(task number)';
    setSummaryFileName(`Telco-AM-${taskStr}-${clarity}-JSON-${selectedAgent}.txt`);
    setTranscriptFileName(`Telco-AM-${taskStr}-${clarity}-Transcript-${selectedAgent}.txt`);
  }, [selectedAgent, taskNumber, clarity]);

  const [showTranscripts, setShowTranscripts] = useState(true);
  const [showFunctions, setShowFunctions] = useState(true);
  const [showTransfers, setShowTransfers] = useState(true);

  const stats = useMemo(() => {
    let functions = 0;
    let transfers = 0;
    let messages = 0;
    
    data.events.forEach(e => {
      if (e.type === 'function') functions++;
      else if (e.type === 'transfer') transfers++;
      else if (e.type === 'message') messages++;
    });

    return { functions, transfers, messages };
  }, [data.events]);

  const { summaryText, displayTranscriptText, downloadTranscriptText } = useMemo(() => {
    let summary = '';
    let displayTranscript = '';
    let downloadTranscript = '';
    let counter = 1;

    if (data.agentType === 'prod multi agent') {
      let currentAgent = '';

      data.events.forEach(event => {
        if (event.type === 'transfer') {
          const from = event.raw?.agent || 'Unknown Agent';
          const to = event.arguments?.displayName || event.arguments?.targetAgent || event.arguments?.agent_name || event.arguments?.target || event.arguments?.destination || event.arguments?.agent || 'Unknown Agent';
          
          if (summary.length > 0 && !summary.endsWith('\n\n')) summary += (summary.endsWith('\n') ? '\n' : '\n\n');
          summary += `transfer_to_agent (${from} to ${to})\n`;
          currentAgent = ''; // Force the next function to print its agent header
        } else if (event.type === 'function' || event.type === 'endsession') {
          const agent = event.raw?.agent || 'Unknown Agent';
          if (agent !== currentAgent) {
            if (summary.length > 0 && !summary.endsWith('\n\n')) summary += (summary.endsWith('\n') ? '\n' : '\n\n');
            summary += `${agent}:\n\n`;
            currentAgent = agent;
          }
          summary += `${counter}. ${event.toolName || 'Unknown Function'} executed\n`;
          counter++;
        } else if (event.type === 'message') {
          if (displayTranscript.length > 0 && !displayTranscript.endsWith('\n\n')) displayTranscript += (displayTranscript.endsWith('\n') ? '\n' : '\n\n');
          if (downloadTranscript.length > 0 && !downloadTranscript.endsWith('\n\n')) downloadTranscript += (downloadTranscript.endsWith('\n') ? '\n' : '\n\n');
          
          let displayRoleStr = event.messageRole ? event.messageRole.charAt(0).toUpperCase() + event.messageRole.slice(1) : 'System';
          let downloadRoleStr = displayRoleStr;
          
          if (downloadRoleStr.toLowerCase() !== 'user' && downloadRoleStr.toLowerCase() !== 'system') {
            downloadRoleStr = 'Agent';
          }
          
          displayTranscript += `${displayRoleStr}: ${event.messageContent}\n`;
          downloadTranscript += `${downloadRoleStr}: ${event.messageContent}\n`;
        }
      });
    } else {
      data.events.forEach(event => {
        if (event.type === 'function' || event.type === 'endsession') {
          summary += `${counter}. ${event.toolName || 'Unknown Function'} executed\n`;
          counter++;
        } else if (event.type === 'message') {
          if (displayTranscript.length > 0 && !displayTranscript.endsWith('\n\n')) displayTranscript += (displayTranscript.endsWith('\n') ? '\n' : '\n\n');
          if (downloadTranscript.length > 0 && !downloadTranscript.endsWith('\n\n')) downloadTranscript += (downloadTranscript.endsWith('\n') ? '\n' : '\n\n');
          
          let displayRoleStr = event.messageRole ? event.messageRole.charAt(0).toUpperCase() + event.messageRole.slice(1) : 'System';
          let downloadRoleStr = displayRoleStr;
          
          if (downloadRoleStr.toLowerCase() !== 'user' && downloadRoleStr.toLowerCase() !== 'system') {
            downloadRoleStr = 'Agent';
          }
          
          displayTranscript += `${displayRoleStr}: ${event.messageContent}\n`;
          downloadTranscript += `${downloadRoleStr}: ${event.messageContent}\n`;
        }
      });
    }

    return { summaryText: summary.trim(), displayTranscriptText: displayTranscript.trim(), downloadTranscriptText: downloadTranscript.trim() };
  }, [data.events, data.agentType]);

  const handleCopySummary = () => {
    if (!summaryText) return;
    navigator.clipboard.writeText(summaryText);
    setCopySummaryStatus('Copied!');
    setTimeout(() => setCopySummaryStatus('Copy Summary'), 2000);
  };

  const handleCopyTranscript = () => {
    if (!downloadTranscriptText) return;
    navigator.clipboard.writeText(downloadTranscriptText);
    setCopyTranscriptStatus('Copied!');
    setTimeout(() => setCopyTranscriptStatus('Copy Transcript'), 2000);
  };

  const handleCopySession = () => {
    if (!data.sessionId) return;
    navigator.clipboard.writeText(data.sessionId);
    setCopySessionStatus('Copied!');
    setTimeout(() => setCopySessionStatus('Copy'), 2000);
  };

  const handleCopyDuration = () => {
    if (!data.duration) return;
    navigator.clipboard.writeText(data.duration);
    setCopyDurationStatus('Copied!');
    setTimeout(() => setCopyDurationStatus('Copy'), 2000);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSummary = () => {
    if (!data.rawJsonText) return;
    downloadFile(data.rawJsonText, summaryFileName);
  };

  const handleDownloadTranscript = () => {
    if (!downloadTranscriptText) return;
    downloadFile(downloadTranscriptText, transcriptFileName);
  };

  const handleDownloadAll = () => {
    handleDownloadSummary();
    handleDownloadTranscript();
  };

  return (
    <div className="animate-fade-in" style={{ width: '100%' }}>
      <div className="timeline-header glass">
        <div className="timeline-title-group">
          <h2 className="timeline-title text-foreground">
            <Activity className="timeline-title-icon" />
            Session Analysis
          </h2>
          <div className="timeline-meta">
            <span>Mode:</span>
            <span className={`badge ${
              data.agentType === 'prod multi agent' ? 'accent' : 
              data.agentType === 'pre-prod' ? 'primary' : 
              'primary'
            }`}>
              {data.agentType === 'prod multi agent' ? 'Prod Multi Agent' : 
               data.agentType === 'prod single agent' ? 'Prod Single Agent' : 
               data.agentType === 'pre-prod' ? 'Pre-Prod' : 'Unknown'}
            </span>
            <span style={{ marginLeft: '1rem' }}>
              Events Found: <strong className="text-foreground">{data.events.length}</strong>
            </span>
          </div>
        </div>
        <button onClick={onReset} className="btn-primary">
          Upload New File
        </button>
      </div>

      <div className="dashboard glass" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', borderRadius: '1rem' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '1rem', background: 'var(--bg-glass)', borderRadius: '0.5rem', border: '1px solid var(--border-glass)' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{stats.messages}</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Transcript Turns</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '1rem', background: 'var(--bg-glass)', borderRadius: '0.5rem', border: '1px solid var(--border-glass)' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{stats.functions}</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Functions Executed</div>
        </div>
        {data.agentType === 'prod multi agent' && (
          <div style={{ flex: 1, textAlign: 'center', padding: '1rem', background: 'var(--bg-glass)', borderRadius: '0.5rem', border: '1px solid var(--border-glass)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{stats.transfers}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Agent Transfers</div>
          </div>
        )}
      </div>

      {(data.sessionId || data.duration) && (
        <div className="metadata-section glass" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem', borderRadius: '1rem', display: 'flex', gap: '2.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {data.sessionId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>SESSION ID</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <strong className="text-foreground" style={{ fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '1px' }}>{data.sessionId}</strong>
                <button onClick={handleCopySession} className="btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Copy style={{ width: '0.8rem', height: '0.8rem' }} /> {copySessionStatus}
                </button>
              </div>
            </div>
          )}
          {data.duration && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>DURATION (MM:SS)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <strong className="text-foreground" style={{ fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '1px' }}>{data.duration}</strong>
                <button onClick={handleCopyDuration} className="btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Copy style={{ width: '0.8rem', height: '0.8rem' }} /> {copyDurationStatus}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="export-section glass" style={{ marginBottom: '1.5rem', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <h3 className="text-foreground" style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download style={{ width: '1.2rem', height: '1.2rem', color: 'var(--primary)' }} />
              Export Options
            </h3>
            
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-foreground)' }}>Agent Target:</span>
                <div className="segmented-control" style={{ margin: 0, padding: '2px', minHeight: '28px' }}>
                  <button 
                    className={`segment-btn ${selectedAgent === 'A' ? 'active' : ''}`}
                    onClick={() => setSelectedAgent('A')}
                    style={{ padding: '0.2rem 1rem', fontSize: '0.8rem' }}
                  >
                    A
                  </button>
                  <button 
                    className={`segment-btn ${selectedAgent === 'B' ? 'active' : ''}`}
                    onClick={() => setSelectedAgent('B')}
                    style={{ padding: '0.2rem 1rem', fontSize: '0.8rem' }}
                  >
                    B
                  </button>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-foreground)' }}>Task Number:</span>
                <input 
                  type="text" 
                  value={taskNumber} 
                  onChange={(e) => setTaskNumber(e.target.value)}
                  placeholder="e.g. 12"
                  className="glass"
                  style={{ width: '120px', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-foreground)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-foreground)' }}>Task Type:</span>
                <select 
                  value={clarity}
                  onChange={(e) => setClarity(e.target.value as 'Clear' | 'Noisy')}
                  className="glass"
                  style={{ padding: '0.3rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-foreground)', fontSize: '0.85rem', outline: 'none' }}
                >
                  <option value="Clear" style={{ background: 'var(--card)' }}>Clear</option>
                  <option value="Noisy" style={{ background: 'var(--card)' }}>Noisy</option>
                </select>
              </div>
            </div>
          </div>

          <button onClick={handleDownloadAll} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', height: 'fit-content', marginTop: '0.2rem' }}>
            <Download style={{ width: '1rem', height: '1rem' }} />
            Download Both
          </button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'var(--bg-glass)', padding: '1.2rem', borderRadius: '0.8rem', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-foreground)' }}>Raw JSON File</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{summaryFileName}</span>
            <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
              <button onClick={handleDownloadSummary} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', width: '100%', justifyContent: 'center' }}>
                <Download style={{ width: '1rem', height: '1rem' }} />
                Download JSON
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'var(--bg-glass)', padding: '1.2rem', borderRadius: '0.8rem', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-foreground)' }}>Transcript Text</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{transcriptFileName}</span>
            <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
              <button onClick={handleDownloadTranscript} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', width: '100%', justifyContent: 'center' }}>
                <Download style={{ width: '1rem', height: '1rem' }} />
                Download Transcript
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="summary-box glass" style={{ padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h3 className="text-foreground" style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600 }}>Function & Transfer Summary</h3>
            <button onClick={handleCopySummary} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
              <Copy style={{ width: '1rem', height: '1rem' }} />
              {copySummaryStatus}
            </button>
          </div>
          <textarea 
            readOnly 
            value={summaryText} 
            style={{ 
              width: '100%', 
              height: '400px', 
              background: 'var(--bg-glass)', 
              color: 'var(--text-foreground)', 
              border: '1px solid var(--border-glass)', 
              borderRadius: '0.5rem', 
              padding: '1rem', 
              resize: 'vertical',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              lineHeight: '1.5'
            }} 
          />
        </div>

        <div className="summary-box glass" style={{ padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h3 className="text-foreground" style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600 }}>Transcript</h3>
            <button onClick={handleCopyTranscript} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
              <Copy style={{ width: '1rem', height: '1rem' }} />
              {copyTranscriptStatus}
            </button>
          </div>
          <textarea 
            readOnly 
            value={displayTranscriptText} 
            style={{ 
              width: '100%', 
              height: '400px', 
              background: 'var(--bg-glass)', 
              color: 'var(--text-foreground)', 
              border: '1px solid var(--border-glass)', 
              borderRadius: '0.5rem', 
              padding: '1rem', 
              resize: 'vertical',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              lineHeight: '1.5'
            }} 
          />
        </div>
      </div>

      <div className="filter-bar glass" style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', padding: '1rem 1.5rem', borderRadius: '1rem', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-foreground)' }}>Filters:</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showTranscripts} onChange={e => setShowTranscripts(e.target.checked)} style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }} />
          Show Transcripts
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showFunctions} onChange={e => setShowFunctions(e.target.checked)} style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }} />
          Show Functions & Tools
        </label>
        {data.agentType === 'prod multi agent' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={showTransfers} onChange={e => setShowTransfers(e.target.checked)} style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }} />
            Show Transfers
          </label>
        )}
      </div>

      <div className="timeline-list">
        {data.events.filter(event => {
          if (event.type === 'message' && !showTranscripts) return false;
          if (event.type === 'function' && !showFunctions) return false;
          if (event.type === 'tool_response' && !showFunctions) return false;
          if (event.type === 'endsession' && !showFunctions) return false;
          if (event.type === 'transfer' && !showTransfers) return false;
          return true;
        }).map((event, idx) => (
          <TimelineItem key={event.id || idx} event={event} index={idx} />
        ))}
        {data.events.length === 0 && (
          <div className="timeline-empty glass">
            No supported tools or events found in this JSON file.
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineItem({ event, index }: { event: ParsedEvent, index: number }) {
  const [expanded, setExpanded] = useState(false);

  const getEventConfig = (type: string) => {
    switch (type) {
      case 'function': return { class: 'function', badge: 'DIAG' };
      case 'transfer': return { class: 'transfer', badge: 'DIAG' };
      case 'endsession': return { class: 'endsession', badge: 'DIAG' };
      case 'tool_response': return { class: 'response', badge: 'DIAG' };
      case 'message': return { class: 'message', badge: event.messageRole ? event.messageRole.toUpperCase() : 'SYSTEM' };
      default: return { class: 'unknown', badge: 'UNKNOWN' };
    }
  };

  const config = getEventConfig(event.type);

  // Render a completely flat layout without any timeline dots or glass cards
  return (
    <div 
      className="animate-slide-up"
      style={{ display: 'flex', flexDirection: 'column', padding: '0.35rem 0', animationDelay: `${index * 50}ms` }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <span className={`badge ${event.type === 'message' ? (event.messageRole === 'user' ? 'primary' : 'accent') : 'diag'}`} 
              style={{ marginRight: '1rem', minWidth: '4.5rem', textAlign: 'center', marginTop: '0.1rem', cursor: (event.arguments || event.raw) && event.type !== 'message' ? 'pointer' : 'default' }}
              onClick={() => { if ((event.arguments || event.raw) && event.type !== 'message') setExpanded(!expanded) }}>
          {config.badge}
        </span>
        
        {event.type === 'message' ? (
          <div style={{ color: 'var(--text-foreground)', fontSize: '0.95rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', flex: 1 }}>
            {event.messageContent}
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5, flex: 1, display: 'flex', alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap', gap: '0.3rem' }}
               onClick={() => setExpanded(!expanded)}>
            <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>&gt;</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'rgb(147, 197, 253)' }}>
              {event.toolName || (event.type === 'tool_response' ? 'Tool Response Output' : 'Unknown Tool')}
            </span>
            {event.type === 'transfer' && (
              <span style={{ opacity: 0.8, fontSize: '0.85rem' }}>
                (From {event.raw?.agent || 'Unknown'} to {event.arguments?.displayName || event.arguments?.agent_name || event.arguments?.target || event.arguments?.destination || event.arguments?.agent || event.arguments?.targetAgent || 'Unknown'})
              </span>
            )}
            {event.duplicateCount && event.duplicateCount > 1 && (
              <span style={{ opacity: 0.8, fontSize: '0.85rem', background: 'rgba(255,255,255,0.1)', padding: '0 4px', borderRadius: '4px' }}>
                ({event.duplicateCount}x)
              </span>
            )}
          </div>
        )}
      </div>

      {expanded && (event.arguments || event.raw) && event.type !== 'message' && (
        <div style={{ marginLeft: '5.5rem', marginTop: '0.5rem', marginBottom: '1rem' }} className="animate-fade-in">
          {event.arguments && (
            <div className="data-block args" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <pre style={{ fontSize: '0.8rem', margin: 0 }}>{typeof event.arguments === 'string' ? event.arguments : JSON.stringify(event.arguments, null, 2)}</pre>
            </div>
          )}
          
          <details style={{ marginTop: '0.5rem' }}>
            <summary className="raw-data-summary" style={{ fontSize: '0.8rem', opacity: 0.7 }}>
              View Raw Event JSON
            </summary>
            <div className="raw-data-block" style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
              <pre style={{ fontSize: '0.75rem', margin: 0 }}>{JSON.stringify(event.raw, null, 2)}</pre>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
