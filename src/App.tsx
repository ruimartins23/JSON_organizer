import { useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { TimelineView } from './components/TimelineView';
import { Announcement } from './components/Announcement';
import { parseAITrainingJSON } from './utils/parser';
import type { OrganizedTimeline, EnvironmentMode, ParserConfig } from './utils/parser';
import { BrainCircuit } from 'lucide-react';

function App() {
  const [timelineData, setTimelineData] = useState<OrganizedTimeline | null>(null);

  const handleFileParsed = (data: unknown, mode: EnvironmentMode, config: ParserConfig) => {
    setTimelineData(parseAITrainingJSON(data, mode, config));
  };

  const reset = () => setTimelineData(null);

  return (
    <div className="gradient-bg app-container">
      <header className="header animate-fade-in">
        <div className="header-icon-container glass">
          <BrainCircuit className="header-icon" />
        </div>
        <h1>
          JSON <span className="gradient-text">Extractor</span>
        </h1>
        <p>
          Upload your JSON files to visualize functions, responses and transfers!
        </p>
      </header>

      <main className="main-content">
        <Announcement />
        {!timelineData ? (
          <Dropzone onFileParsed={handleFileParsed} />
        ) : (
          <TimelineView data={timelineData} onReset={reset} />
        )}
      </main>
      
      <footer className="footer">
        <p>Single & Multi Agent Support</p>
      </footer>
    </div>
  );
}

export default App;
