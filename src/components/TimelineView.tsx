import { useState, useMemo } from 'react';
import type { OrganizedTimeline, ParsedEvent } from '../utils/parser';
import { Wrench, PowerOff, ArrowRightLeft, ChevronDown, ChevronRight, Activity, Code, Server, CheckCircle2, Copy, MessageSquare, Download } from 'lucide-react';

interface TimelineViewProps {
  data: OrganizedTimeline;
  onReset: () => void;
}

export function TimelineView({ data, onReset }: TimelineViewProps) {
  const [copySummaryStatus, setCopySummaryStatus] = useState('Copy Summary');
  const [copyTranscriptStatus, setCopyTranscriptStatus] = useState('Copy Transcript');
  const [copySessionStatus, setCopySessionStatus] = useState('Copy');
  
  const [summaryFileName, setSummaryFileName] = useState('Telco-AM-(task number)-Clear-JSON-A.txt');
  const [transcriptFileName, setTranscriptFileName] = useState('Telco-AM-(task number)-Clear-Transcript-A.txt');
  
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

  const { summaryText, transcriptText } = useMemo(() => {
    let summary = '';
    let transcript = '';
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
          if (transcript.length > 0 && !transcript.endsWith('\n\n')) transcript += (transcript.endsWith('\n') ? '\n' : '\n\n');
          const roleStr = event.messageRole ? event.messageRole.charAt(0).toUpperCase() + event.messageRole.slice(1) : 'System';
          transcript += `${roleStr}: ${event.messageContent}\n`;
        }
      });
    } else {
      data.events.forEach(event => {
        if (event.type === 'function' || event.type === 'endsession') {
          summary += `${counter}. ${event.toolName || 'Unknown Function'} executed\n`;
          counter++;
        } else if (event.type === 'message') {
          if (transcript.length > 0 && !transcript.endsWith('\n\n')) transcript += (transcript.endsWith('\n') ? '\n' : '\n\n');
          const roleStr = event.messageRole ? event.messageRole.charAt(0).toUpperCase() + event.messageRole.slice(1) : 'System';
          transcript += `${roleStr}: ${event.messageContent}\n`;
        }
      });
    }

    return { summaryText: summary.trim(), transcriptText: transcript.trim() };
  }, [data.events, data.agentType]);

  const handleCopySummary = () => {
    if (!summaryText) return;
    navigator.clipboard.writeText(summaryText);
    setCopySummaryStatus('Copied!');
    setTimeout(() => setCopySummaryStatus('Copy Summary'), 2000);
  };

  const handleCopyTranscript = () => {
    if (!transcriptText) return;
    navigator.clipboard.writeText(transcriptText);
    setCopyTranscriptStatus('Copied!');
    setTimeout(() => setCopyTranscriptStatus('Copy Transcript'), 2000);
  };

  const handleCopySession = () => {
    if (!data.sessionId) return;
    navigator.clipboard.writeText(data.sessionId);
    setCopySessionStatus('Copied!');
    setTimeout(() => setCopySessionStatus('Copy'), 2000);
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
    if (!transcriptText) return;
    downloadFile(transcriptText, transcriptFileName);
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
            {data.sessionId && (
              <span style={{ marginLeft: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Session ID: <strong className="text-foreground" style={{ fontFamily: 'monospace' }}>{data.sessionId}</strong>
                <button onClick={handleCopySession} className="btn-secondary" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Copy style={{ width: '0.7rem', height: '0.7rem' }} /> {copySessionStatus}
                </button>
              </span>
            )}
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

      <div className="export-section glass" style={{ marginBottom: '1.5rem', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.8rem' }}>
          <h3 className="text-foreground" style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download style={{ width: '1.2rem', height: '1.2rem', color: 'var(--primary)' }} />
            Export Files
          </h3>
          <button onClick={handleDownloadAll} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem' }}>
            <Download style={{ width: '1rem', height: '1rem' }} />
            Download Both
          </button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-glass)', padding: '1rem', borderRadius: '0.8rem', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-foreground)' }}>Raw JSON File</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Downloads the JSON</span>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input 
                type="text" 
                value={summaryFileName} 
                onChange={(e) => setSummaryFileName(e.target.value)}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-foreground)', fontSize: '0.85rem', minWidth: 0 }}
              />
              <button onClick={handleDownloadSummary} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1rem' }}>
                <Download style={{ width: '1rem', height: '1rem' }} />
                JSON
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-glass)', padding: '1rem', borderRadius: '0.8rem', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-foreground)' }}>Transcript Text</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Download the transcript</span>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input 
                type="text" 
                value={transcriptFileName} 
                onChange={(e) => setTranscriptFileName(e.target.value)}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-foreground)', fontSize: '0.85rem', minWidth: 0 }}
              />
              <button onClick={handleDownloadTranscript} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1rem' }}>
                <Download style={{ width: '1rem', height: '1rem' }} />
                TXT
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
              flex: 1,
              minHeight: '200px', 
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
            value={transcriptText} 
            style={{ 
              width: '100%', 
              flex: 1,
              minHeight: '200px', 
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
          <TimelineItem key={event.id || idx} event={event} index={idx + 1} />
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
  const [expanded, setExpanded] = useState(event.type !== 'tool_response');

  const getEventConfig = (type: string) => {
    switch (type) {
      case 'function':
        return { icon: Wrench, class: 'function', label: 'Function Call' };
      case 'transfer':
        return { icon: ArrowRightLeft, class: 'transfer', label: 'Agent Transfer' };
      case 'endsession':
        return { icon: PowerOff, class: 'endsession', label: 'End Session' };
      case 'tool_response':
        return { icon: Code, class: 'response', label: 'Tool Response' };
      case 'message':
        return { icon: MessageSquare, class: 'message', label: 'Transcript Message' };
      default:
        return { icon: Code, class: 'unknown', label: 'Unknown Event' };
    }
  };

  const config = getEventConfig(event.type);
  const Icon = config.icon;

  return (
    <div className="timeline-item">
      {/* Timeline dot */}
      <div className={`timeline-dot ${config.class}`}>
        <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{index}</span>
      </div>

      {/* Content Card */}
      <div className="timeline-card glass">
        <div className="timeline-card-header" onClick={() => setExpanded(!expanded)}>
          <div className="timeline-card-info">
            <div className="timeline-card-labels">
              <span className={`timeline-label ${config.class}`}>
                <Icon style={{ width: '0.8rem', height: '0.8rem', marginRight: '4px' }} />
                {config.label}
              </span>
              {event.response && (
                <span className="responded-badge">
                  <CheckCircle2 style={{ width: '0.75rem', height: '0.75rem' }} /> Responded
                </span>
              )}
            </div>
            <h3 className="timeline-card-title text-foreground" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span>{event.type === 'message' ? `Transcript Log` : (event.toolName || (event.type === 'tool_response' ? 'Tool Response Output' : 'Unknown Tool'))}</span>
              {event.duplicateCount && event.duplicateCount > 1 && (
                <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)', background: 'var(--bg-glass)', padding: '0.1rem 0.5rem', borderRadius: '1rem', border: '1px solid var(--border-glass)' }}>
                  (function executed {event.duplicateCount} times with the same tool call id)
                </span>
              )}
            </h3>
            {event.type === 'transfer' && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <strong>From:</strong> {event.raw?.agent || 'Unknown'} <ArrowRightLeft style={{ width: '0.8rem', height: '0.8rem', margin: '0 4px', display: 'inline' }} /> 
                <strong>To:</strong> {event.arguments?.displayName || event.arguments?.agent_name || event.arguments?.target || event.arguments?.destination || event.arguments?.agent || event.arguments?.targetAgent || 'Unknown'}
              </div>
            )}
          </div>
          <div className="timeline-card-icon">
            {expanded ? <ChevronDown style={{ width: '1.25rem', height: '1.25rem' }} /> : <ChevronRight style={{ width: '1.25rem', height: '1.25rem' }} />}
          </div>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="timeline-card-body animate-fade-in">
            
            {event.arguments && (
              <div>
                <h4 className="data-section-title">
                  <Server style={{ width: '1rem', height: '1rem' }} /> Arguments
                </h4>
                <div className="data-block args">
                  <pre>{typeof event.arguments === 'string' ? event.arguments : JSON.stringify(event.arguments, null, 2)}</pre>
                </div>
              </div>
            )}

            {event.type === 'message' && event.messageContent && (
              <div>
                <div className="data-block args">
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                    <strong style={{ color: 'var(--primary)' }}>[{event.messageRole?.toUpperCase()}]</strong> {event.messageContent}
                  </pre>
                </div>
              </div>
            )}

            {!event.arguments && event.type !== 'tool_response' && event.type !== 'message' && (
              <div className="no-data">
                No detailed arguments available for this event.
              </div>
            )}
            
            {/* Raw JSON Debug View */}
            <details>
              <summary className="raw-data-summary">
                View Raw Event JSON
              </summary>
              <div className="raw-data-block">
                <pre>{JSON.stringify(event.raw, null, 2)}</pre>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
