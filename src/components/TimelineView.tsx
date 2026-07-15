import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { OrganizedTimeline, ParsedEvent } from '../utils/parser';
import { Activity, Copy, Download, AlertTriangle, Search, MessageSquare, Braces, ArrowLeftRight } from 'lucide-react';

interface TimelineViewProps {
  data: OrganizedTimeline;
  onReset: () => void;
}

const MODE_LABELS: Record<string, string> = {
  'prod multi agent': 'Prod Multi Agent',
  'prod single agent': 'Prod Single Agent',
  'pre-prod': 'Pre-Prod',
};

function useCopyToClipboard(idleLabel: string): [string, (text: string | undefined) => void] {
  const [label, setLabel] = useState(idleLabel);

  const copy = (text: string | undefined) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setLabel('Copied!');
    setTimeout(() => setLabel(idleLabel), 2000);
  };

  return [label, copy];
}

// Stable, distinct hue per agent name so each agent keeps its color across the session
const AGENT_HUES = [265, 190, 330, 45, 150, 15, 285, 110];

function agentHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AGENT_HUES[hash % AGENT_HUES.length];
}

function getTransferTarget(event: ParsedEvent): string {
  const args = event.arguments;
  return args?.displayName || args?.targetAgent || args?.agent_name || args?.target || args?.destination || args?.agent || 'Unknown Agent';
}

// Ensure sections are separated by a blank line before appending.
function withSectionBreak(text: string): string {
  if (text.length === 0 || text.endsWith('\n\n')) return text;
  return text + (text.endsWith('\n') ? '\n' : '\n\n');
}

function buildOutputs(data: OrganizedTimeline) {
  let summary = '';
  let displayTranscript = '';
  let downloadTranscript = '';
  let counter = 1;
  let currentAgent: string | null = null; // null = single-agent mode, no agent headers

  const isMultiAgent = data.agentType === 'prod multi agent';
  if (isMultiAgent) currentAgent = '';

  const appendMessage = (event: ParsedEvent) => {
    displayTranscript = withSectionBreak(displayTranscript);
    downloadTranscript = withSectionBreak(downloadTranscript);

    const displayRole = event.messageRole
      ? event.messageRole.charAt(0).toUpperCase() + event.messageRole.slice(1)
      : 'System';
    const roleLower = displayRole.toLowerCase();
    // Downloads keep generic roles so agent names never leak into exported transcripts
    const downloadRole = roleLower === 'user' || roleLower === 'system' ? displayRole : 'Agent';

    displayTranscript += `${displayRole}: ${event.messageContent}\n`;
    downloadTranscript += `${downloadRole}: ${event.messageContent}\n`;
  };

  data.events.forEach(event => {
    if (event.type === 'message') {
      appendMessage(event);
    } else if (event.type === 'transfer' && isMultiAgent) {
      const from = event.raw?.agent || 'Unknown Agent';
      summary = withSectionBreak(summary);
      summary += `transfer_to_agent (${from} to ${getTransferTarget(event)})\n`;
      currentAgent = ''; // Force the next function to print its agent header
    } else if (event.type === 'function' || event.type === 'endsession') {
      if (isMultiAgent) {
        const agent = event.raw?.agent || 'Unknown Agent';
        if (agent !== currentAgent) {
          summary = withSectionBreak(summary);
          summary += `${agent}:\n\n`;
          currentAgent = agent;
        }
      }
      summary += `${counter}. ${event.toolName || 'Unknown Function'} executed\n`;
      counter++;
    }
  });

  return {
    summaryText: summary.trim(),
    displayTranscriptText: displayTranscript.trim(),
    downloadTranscriptText: downloadTranscript.trim(),
  };
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TimelineView({ data, onReset }: TimelineViewProps) {
  const [copySummaryLabel, copySummary] = useCopyToClipboard('Copy Summary');
  const [copyTranscriptLabel, copyTranscript] = useCopyToClipboard('Copy Transcript');
  const [copySessionLabel, copySession] = useCopyToClipboard('Copy');
  const [copyDurationLabel, copyDuration] = useCopyToClipboard('Copy');

  const [selectedAgent, setSelectedAgent] = useState<'A' | 'B'>('A');
  const [taskNumber, setTaskNumber] = useState('');
  const [clarity, setClarity] = useState<'Clear' | 'Noisy'>('Clear');

  const [showTranscripts, setShowTranscripts] = useState(true);
  const [showFunctions, setShowFunctions] = useState(true);
  const [showTransfers, setShowTransfers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const taskStr = taskNumber.trim() || '(task number)';
  const summaryFileName = `Telco-AM-${taskStr}-${clarity}-JSON-${selectedAgent}.txt`;
  const transcriptFileName = `Telco-AM-${taskStr}-${clarity}-Transcript-${selectedAgent}.txt`;

  const stats = useMemo(() => {
    const counts = { functions: 0, transfers: 0, messages: 0 };
    data.events.forEach(e => {
      if (e.type === 'function') counts.functions++;
      else if (e.type === 'transfer') counts.transfers++;
      else if (e.type === 'message') counts.messages++;
    });
    return counts;
  }, [data.events]);

  const { summaryText, displayTranscriptText, downloadTranscriptText } = useMemo(
    () => buildOutputs(data),
    [data]
  );

  const handleDownloadJson = () => {
    if (data.rawJsonText) downloadFile(data.rawJsonText, summaryFileName);
  };

  const handleDownloadTranscript = () => {
    if (downloadTranscriptText) downloadFile(downloadTranscriptText, transcriptFileName);
  };

  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (event: ParsedEvent) =>
    !query ||
    (event.toolName || '').toLowerCase().includes(query) ||
    (event.messageContent || '').toLowerCase().includes(query) ||
    String(event.raw?.agent || '').toLowerCase().includes(query) ||
    (event.type === 'transfer' && getTransferTarget(event).toLowerCase().includes(query));

  const visibleEvents = data.events.filter(event => {
    if (event.type === 'message' && !showTranscripts) return false;
    if (event.type === 'transfer' && !showTransfers) return false;
    if (event.type !== 'message' && event.type !== 'transfer' && !showFunctions) return false;
    return matchesQuery(event);
  });

  return (
    <div className="animate-fade-in" style={{ width: '100%' }}>
      <div className="timeline-header glass">
        <div>
          <h2 className="timeline-title">
            <Activity className="timeline-title-icon" />
            Session Analysis
          </h2>
          <div className="timeline-meta">
            <span>Mode:</span>
            <span className={`badge ${data.agentType === 'prod multi agent' ? 'accent' : 'primary'}`}>
              {MODE_LABELS[data.agentType] || 'Unknown'}
            </span>
            <span>
              Events Found: <strong>{data.events.length}</strong>
            </span>
          </div>
        </div>
        <button onClick={onReset} className="btn-primary">
          Upload New File
        </button>
      </div>

      {data.hasEnvironmentMismatch && (
        <div className="glass warning-banner">
          <AlertTriangle className="icon" />
          <div>
            <h3>Environment Mismatch</h3>
            <p>
              You are uploading a multi-agent JSON file (contains agent transfers) into a
              single-agent environment. Please verify your environment settings.
            </p>
          </div>
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card glass">
          <MessageSquare className="stat-icon" />
          <div className="stat-value">{stats.messages}</div>
          <div className="stat-label">Transcript Turns</div>
        </div>
        <div className="stat-card glass">
          <Braces className="stat-icon" />
          <div className="stat-value">{stats.functions}</div>
          <div className="stat-label">Functions Executed</div>
        </div>
        {data.agentType === 'prod multi agent' && (
          <div className="stat-card glass">
            <ArrowLeftRight className="stat-icon" />
            <div className="stat-value">{stats.transfers}</div>
            <div className="stat-label">Agent Transfers</div>
          </div>
        )}
      </div>

      {(data.sessionId || data.duration) && (
        <div className="metadata-section glass">
          {data.sessionId && (
            <div className="meta-item">
              <span className="meta-label">SESSION ID</span>
              <div className="meta-value-row">
                <span className="meta-value">{data.sessionId}</span>
                <button onClick={() => copySession(data.sessionId)} className="btn-secondary">
                  <Copy className="btn-icon-sm" /> {copySessionLabel}
                </button>
              </div>
            </div>
          )}
          {data.duration && (
            <div className="meta-item">
              <span className="meta-label">DURATION (MM:SS)</span>
              <div className="meta-value-row">
                <span className="meta-value">{data.duration}</span>
                <button onClick={() => copyDuration(data.duration)} className="btn-secondary">
                  <Copy className="btn-icon-sm" /> {copyDurationLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="export-section glass">
        <div className="export-header">
          <div className="export-controls">
            <h3 className="panel-title">
              <Download className="icon" />
              Export Options
            </h3>

            <div className="export-options-row">
              <div className="export-option">
                <span className="export-option-label">Agent Target:</span>
                <div className="segmented-control compact">
                  {(['A', 'B'] as const).map(agent => (
                    <button
                      key={agent}
                      className={`segment-btn ${selectedAgent === agent ? 'active' : ''}`}
                      onClick={() => setSelectedAgent(agent)}
                    >
                      {agent}
                    </button>
                  ))}
                </div>
              </div>

              <div className="export-option">
                <span className="export-option-label">Task Number:</span>
                <input
                  type="text"
                  value={taskNumber}
                  onChange={(e) => setTaskNumber(e.target.value)}
                  placeholder="e.g. 12"
                  className="text-input"
                />
              </div>

              <div className="export-option">
                <span className="export-option-label">Task Type:</span>
                <select
                  value={clarity}
                  onChange={(e) => setClarity(e.target.value as 'Clear' | 'Noisy')}
                  className="select-input"
                >
                  <option value="Clear">Clear</option>
                  <option value="Noisy">Noisy</option>
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={() => { handleDownloadJson(); handleDownloadTranscript(); }}
            className="btn-primary"
          >
            <Download className="btn-icon" />
            Download Both
          </button>
        </div>

        <div className="export-cards">
          <div className="export-card">
            <span className="export-card-title">Raw JSON File</span>
            <span className="export-card-filename">{summaryFileName}</span>
            <button onClick={handleDownloadJson} className="btn-secondary">
              <Download className="btn-icon" />
              Download JSON
            </button>
          </div>

          <div className="export-card">
            <span className="export-card-title">Transcript Text</span>
            <span className="export-card-filename">{transcriptFileName}</span>
            <button onClick={handleDownloadTranscript} className="btn-secondary">
              <Download className="btn-icon" />
              Download Transcript
            </button>
          </div>
        </div>
      </div>

      <div className="output-grid">
        <div className="summary-box glass">
          <div className="summary-box-header">
            <h3 className="panel-title">Function &amp; Transfer Summary</h3>
            <button onClick={() => copySummary(summaryText)} className="btn-secondary">
              <Copy className="btn-icon-sm" />
              {copySummaryLabel}
            </button>
          </div>
          <textarea readOnly value={summaryText} className="output-textarea" />
        </div>

        <div className="summary-box glass">
          <div className="summary-box-header">
            <h3 className="panel-title">Transcript</h3>
            <button onClick={() => copyTranscript(downloadTranscriptText)} className="btn-secondary">
              <Copy className="btn-icon-sm" />
              {copyTranscriptLabel}
            </button>
          </div>
          <textarea readOnly value={displayTranscriptText} className="output-textarea" />
        </div>
      </div>

      <div className="filter-bar glass">
        <span className="filter-bar-label">Filters:</span>
        <label className="checkbox-label">
          <input type="checkbox" checked={showTranscripts} onChange={e => setShowTranscripts(e.target.checked)} />
          Show Transcripts
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={showFunctions} onChange={e => setShowFunctions(e.target.checked)} />
          Show Functions &amp; Tools
        </label>
        {data.agentType === 'prod multi agent' && (
          <label className="checkbox-label">
            <input type="checkbox" checked={showTransfers} onChange={e => setShowTransfers(e.target.checked)} />
            Show Transfers
          </label>
        )}
        <div className="filter-search">
          <Search className="filter-search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search events..."
            className="text-input"
          />
          <span className="filter-count">{visibleEvents.length}/{data.events.length}</span>
        </div>
      </div>

      <div className="timeline-list">
        {visibleEvents.map((event, idx) => (
          <TimelineItem key={event.id || idx} event={event} index={idx} />
        ))}
        {data.events.length === 0 && (
          <div className="timeline-empty glass">
            No supported tools or events found in this JSON file.
          </div>
        )}
        {data.events.length > 0 && visibleEvents.length === 0 && (
          <div className="timeline-empty glass">
            No events match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

const EVENT_BADGES: Record<string, { label: string; variant: string }> = {
  function: { label: 'TOOL', variant: 'diag' },
  transfer: { label: 'TRANSFER', variant: 'accent' },
  endsession: { label: 'END', variant: 'destructive' },
  tool_response: { label: 'RESPONSE', variant: 'success' },
};

function TimelineItem({ event, index }: { event: ParsedEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const isMessage = event.type === 'message';
  const hasDetails = !isMessage && !!(event.arguments || event.response || event.raw);

  const eventBadge = EVENT_BADGES[event.type] || { label: 'UNKNOWN', variant: 'diag' };
  const role = (event.messageRole || 'system').toLowerCase();

  let badgeVariant = eventBadge.variant;
  let badgeStyle: CSSProperties | undefined;
  if (isMessage) {
    if (role === 'user') {
      badgeVariant = 'primary';
    } else if (role === 'system' || role === 'agent') {
      badgeVariant = 'accent';
    } else {
      // Named agents each get a stable hue of their own
      badgeVariant = 'agent';
      badgeStyle = { '--agent-h': agentHue(role) } as CSSProperties;
    }
  }
  const badgeText = isMessage
    ? (event.messageRole ? event.messageRole.toUpperCase() : 'SYSTEM')
    : eventBadge.label;

  const toggleDetails = () => {
    if (hasDetails) setExpanded(prev => !prev);
  };

  return (
    <div
      className={`timeline-row type-${event.type} animate-slide-up`}
      style={{ animationDelay: `${Math.min(index * 40, 800)}ms` }}
    >
      <div className="timeline-row-main">
        <span
          className={`badge ${badgeVariant} ${hasDetails ? 'clickable' : ''}`}
          style={badgeStyle}
          onClick={toggleDetails}
        >
          {badgeText}
        </span>

        {isMessage ? (
          <div className="message-content">{event.messageContent}</div>
        ) : (
          <div className="tool-line" onClick={toggleDetails}>
            <span className={`tool-line-caret ${expanded ? 'expanded' : ''}`}>&#9656;</span>
            <span className="tool-line-name">
              {event.toolName || (event.type === 'tool_response' ? 'Tool Response Output' : 'Unknown Tool')}
            </span>
            {event.type === 'transfer' && (
              <span className="tool-line-detail">
                (From {event.raw?.agent || 'Unknown'} to {getTransferTarget(event)})
              </span>
            )}
            {event.duplicateCount && event.duplicateCount > 1 && (
              <span className="tool-line-count">({event.duplicateCount}x)</span>
            )}
          </div>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="event-details animate-fade-in">
          {event.arguments && (
            <div className="data-block args">
              <div className="data-label">Arguments</div>
              <pre>{typeof event.arguments === 'string' ? event.arguments : JSON.stringify(event.arguments, null, 2)}</pre>
            </div>
          )}
          {event.response && (
            <div className="data-block resp">
              <div className="data-label">Response</div>
              <pre>{typeof event.response === 'string' ? event.response : JSON.stringify(event.response, null, 2)}</pre>
            </div>
          )}

          <details>
            <summary className="raw-data-summary">View Raw Event JSON</summary>
            <div className="raw-data-block">
              <pre>{JSON.stringify(event.raw, null, 2)}</pre>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
