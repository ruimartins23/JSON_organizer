import { useState } from 'react';
import type { OrganizedTimeline, ParsedEvent } from '../utils/parser';
import { Wrench, PowerOff, ArrowRightLeft, ChevronDown, ChevronRight, Activity, Code, Server, CheckCircle2 } from 'lucide-react';

interface TimelineViewProps {
  data: OrganizedTimeline;
  onReset: () => void;
}

export function TimelineView({ data, onReset }: TimelineViewProps) {
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
        <button onClick={onReset} className="btn-secondary">
          Upload New File
        </button>
      </div>

      <div className="timeline-list">
        {data.events.map((event, idx) => (
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
            <h3 className="timeline-card-title text-foreground">
              {event.toolName || (event.type === 'tool_response' ? 'Tool Response Output' : 'Unknown Tool')}
            </h3>
            {event.type === 'transfer' && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <strong>From:</strong> {event.raw?.agent || 'Unknown'} <ArrowRightLeft style={{ width: '0.8rem', height: '0.8rem', margin: '0 4px', display: 'inline' }} /> 
                <strong>To:</strong> {event.arguments?.agent_name || event.arguments?.target || event.arguments?.destination || event.arguments?.agent || 'Unknown'}
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

            {!event.arguments && event.type !== 'tool_response' && (
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
