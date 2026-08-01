export type EnvironmentMode = 'pre-prod' | 'prod single agent' | 'prod multi agent';

export interface ParserConfig {
  functionKeyword: string;
  transferKeyword: string;
  endSessionKeyword: string;
}

export interface ParsedEvent {
  id: string;
  type: 'function' | 'transfer' | 'endsession' | 'tool_response' | 'message';
  toolName?: string;
  arguments?: any;
  response?: any;
  messageRole?: string;
  messageContent?: string;
  raw: any;
  timestamp?: string;
  duplicateCount?: number;
}

export interface OrganizedTimeline {
  agentType: EnvironmentMode;
  sessionId?: string;
  duration?: string;
  rawJsonText?: string;
  hasEnvironmentMismatch?: boolean;
  referenceData?: Record<string, unknown>;
  /** Things worth knowing about how this transcript was read out of the file. */
  transcriptNotes?: string[];
  events: ParsedEvent[];
}

/**
 * A turn normally ends with an assembled message under diagnosticInfo, and the
 * streamed sessionOutput.text fragments that built it are ignored as duplicates.
 * When a session ends abruptly the last turns never get that assembled message,
 * so reading only the assembled ones drops the end of the conversation. This
 * works out which turns have to be rebuilt from their fragments instead.
 */
interface RebuiltTurn {
  text: string;
  /** Whoever was speaking last, since the fragments carry no name of their own. */
  role: string;
}

interface StreamRepair {
  /** Rebuilt turns, keyed by the entry the message should be emitted at. */
  rebuilt: Map<unknown, RebuiltTurn>;
  /** recognitionResult entries belonging to a turn no assembled message covers. */
  keepRecognition: Set<unknown>;
  turnsRebuilt: number;
}

function planStreamRepair(data: unknown): StreamRepair {
  const rebuilt = new Map<unknown, RebuiltTurn>();
  const keepRecognition = new Set<unknown>();
  if (!Array.isArray(data)) return { rebuilt, keepRecognition, turnsRebuilt: 0 };

  const covered = new Set<number>();
  const text = new Map<number, string>();
  const firstFragment = new Map<number, unknown>();
  const speakerAt = new Map<number, string>();
  // How many times each thing the user said already appears in an assembled
  // message. Counting rather than checking presence keeps a genuine repeat.
  const alreadyShown = new Map<string, number>();
  const said = (value: string) => value.replace(/\s+/g, ' ').trim();
  let lastSpeaker = 'agent';

  for (const entry of data) {
    const output = entry?.sessionOutput;
    if (!output || typeof output.turnIndex !== 'number') continue;
    const turn = output.turnIndex;

    if (output.diagnosticInfo?.messages?.length) {
      covered.add(turn);
      output.diagnosticInfo.messages.forEach((message: any) => {
        const role = typeof message?.role === 'string' ? message.role : '';
        const spoken = said(
          (message?.chunks ?? []).map((chunk: any) => chunk?.transcript ?? '').join(''),
        );
        if (role.toLowerCase() === 'user') {
          if (spoken) alreadyShown.set(spoken, (alreadyShown.get(spoken) ?? 0) + 1);
        } else if (role) {
          lastSpeaker = role;
        }
      });
    }
    if (typeof output.text === 'string' && output.text !== '') {
      text.set(turn, (text.get(turn) ?? '') + output.text);
      if (!firstFragment.has(turn)) {
        firstFragment.set(turn, entry);
        speakerAt.set(turn, lastSpeaker);
      }
    }
  }

  // Keep any user turn the assembled messages did not already account for.
  for (const entry of data) {
    const spoken = entry?.recognitionResult?.transcript;
    if (typeof spoken !== 'string' || spoken.trim() === '') continue;
    const key = said(spoken);
    const remaining = alreadyShown.get(key) ?? 0;
    if (remaining > 0) alreadyShown.set(key, remaining - 1);
    else keepRecognition.add(entry);
  }

  firstFragment.forEach((entry, turn) => {
    const joined = text.get(turn) ?? '';
    if (!covered.has(turn) && joined.trim() !== '') {
      rebuilt.set(entry, { text: joined, role: speakerAt.get(turn) ?? 'agent' });
    }
  });

  return { rebuilt, keepRecognition, turnsRebuilt: rebuilt.size };
}

// Values in defaultVariables are often stringified JSON; parse them when possible.
function maybeParseJSON(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
  }
  return value;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

// Extract ID from toolResponses and toolCalls to later sync them
function extractId(o: any): string | null {
  const directId = o.id || o.tool_call_id || o.toolCallId || o['tool call id'] || o.call_id || o.callId;
  if (directId) return directId;
  if (o.toolResponse) return o.toolResponse.id || o.toolResponse.tool_call_id || o.toolResponse['tool call id'];
  if (o.tool_response) return o.tool_response.id || o.tool_response.tool_call_id || o.tool_response['tool call id'];
  if (o.toolCall) return o.toolCall.id || o.toolCall.tool_call_id || o.toolCall['tool call id'];
  return null;
}

function formatDuration(minMs: number, maxMs: number): string {
  const totalSeconds = Math.max(0, Math.round((maxMs - minMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function parseAITrainingJSON(
  data: any,
  mode: EnvironmentMode,
  config: ParserConfig = { functionKeyword: 'PythonFunctionTool', transferKeyword: 'TransferToAgentTool', endSessionKeyword: 'EndSessionTool' }
): OrganizedTimeline {
  const events: ParsedEvent[] = [];

  // Check if this JSON has the new diagnosticInfo chunks format
  const stringifiedData = JSON.stringify(data);
  const hasDiagnosticMessages = stringifiedData.includes('"diagnosticInfo"') && stringifiedData.includes('"chunks"');
  const repair = hasDiagnosticMessages
    ? planStreamRepair(data)
    : { rebuilt: new Map<unknown, RebuiltTurn>(), keepRecognition: new Set<unknown>(), turnsRebuilt: 0 };

  // Attempt to extract session ID from agent-turn URIs
  const sessionMatch = stringifiedData.match(/\/([^/]+)\/agent-turn/);
  const sessionId = sessionMatch?.[1];

  // We will collect rootSpans during traversal for the highest precision duration
  const rootSpans: { start: number; end: number }[] = [];

  // The context/tools the model was given (accounts, plans, outages, etc.)
  const referenceData: Record<string, unknown> = {};

  let hasEnvironmentMismatch = false;

  // Recursively search the JSON for useful objects
  function traverse(obj: any, parentAgent?: string, structuralKey?: string, parentTime?: string) {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach((item) => traverse(item, parentAgent, structuralKey, parentTime));
      return;
    }

    // Tool calls are described by trace spans, whose time lives in startTime; without
    // it those events sort arbitrarily against the timestamped transcript events.
    const currentTime = obj.eventTime || obj.timestamp || obj.time || obj.startTime || parentTime;

    // Capture rootSpan for duration calculation
    if (obj.rootSpan && typeof obj.rootSpan.startTime === 'string' && typeof obj.rootSpan.endTime === 'string') {
      rootSpans.push({
        start: new Date(obj.rootSpan.startTime).getTime(),
        end: new Date(obj.rootSpan.endTime).getTime()
      });
    }

    // Collect the model's provided context blocks (first occurrence of each key wins)
    if (obj.defaultVariables && typeof obj.defaultVariables === 'object' && !Array.isArray(obj.defaultVariables)) {
      for (const [key, value] of Object.entries(obj.defaultVariables)) {
        if (!(key in referenceData)) referenceData[key] = maybeParseJSON(value);
      }
    }

    const currentAgent = obj.agent || obj.role || obj.agentName || parentAgent;

    // Identify tool name and arguments explicitly
    let toolName = '';
    let toolArgs: any = null;

    const namedToolSources: Array<[string, any]> = [
      ['toolCall', obj.toolCall],
      [config.functionKeyword, config.functionKeyword ? obj[config.functionKeyword] : null],
      [config.endSessionKeyword, config.endSessionKeyword ? obj[config.endSessionKeyword] : null],
      [config.transferKeyword, config.transferKeyword ? obj[config.transferKeyword] : null]
    ];

    const matchedNamed = namedToolSources.find(([, source]) => source);

    if (matchedNamed) {
      const [fallbackName, source] = matchedNamed;
      toolName = source.displayName || source.name || fallbackName;
      // toolCall args stay undefined when missing; keyword tools fall back to the whole object
      toolArgs = source.args || source.arguments || (fallbackName === 'toolCall' ? null : source);
    }
    else if (config.functionKeyword === 'PythonFunctionTool' && obj.pythonfunctiontool) {
      toolName = 'pythonfunctiontool';
      toolArgs = obj.pythonfunctiontool.args || obj.pythonfunctiontool.arguments;
    }
    else if (config.endSessionKeyword === 'EndSessionTool' && obj.endsessiontool) {
      toolName = 'endsessiontool';
      toolArgs = obj.endsessiontool.args || obj.endsessiontool.arguments;
    }
    else if (config.transferKeyword === 'TransferToAgentTool' && obj.transfertoagenttool) {
      toolName = 'transfertoagenttool';
      toolArgs = obj.transfertoagenttool.args || obj.transfertoagenttool.arguments;
    }
    else if (config.transferKeyword === 'TransferToAgentTool' && obj.agentTransfer) {
      toolName = obj.agentTransfer.displayName || obj.agentTransfer.targetAgent || 'agentTransfer';
      toolArgs = obj.agentTransfer;
    }
    else if (obj.functionCall) {
      toolName = obj.functionCall.name;
      toolArgs = obj.functionCall.args || obj.functionCall.arguments;
    }
    else if (typeof obj.name === 'string') {
      toolName = obj.name;
      toolArgs = obj.arguments || obj.args;
    }
    else if (typeof obj.tool === 'string') {
      toolName = obj.tool;
      toolArgs = obj.arguments || obj.args;
    }

    // Apply strict logic based on mode using normalized strings
    if (toolName) {
      // Identify the abstract tool category
      let category = '';
      const typeStr = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';
      const funcKeyLower = config.functionKeyword ? config.functionKeyword.toLowerCase() : '';
      const transKeyLower = config.transferKeyword ? config.transferKeyword.toLowerCase() : '';
      const endSessKeyLower = config.endSessionKeyword ? config.endSessionKeyword.toLowerCase() : '';

      const isEndSessionName = toolName.toLowerCase() === 'end_session' || toolName.toLowerCase() === 'endsession';

      const isConfigEndSession = config.endSessionKeyword !== config.functionKeyword && config.endSessionKeyword && (
        typeStr === endSessKeyLower ||
        obj[config.endSessionKeyword] ||
        obj[endSessKeyLower] ||
        (endSessKeyLower === 'toolcall' && obj.toolCall && isEndSessionName) ||
        (endSessKeyLower === funcKeyLower && isEndSessionName)
      );

      const isConfigTransfer = config.transferKeyword && (
        typeStr === transKeyLower ||
        obj[config.transferKeyword] ||
        obj[transKeyLower] ||
        (transKeyLower === 'toolcall' && obj.toolCall && toolName.toLowerCase().includes('transfer')) ||
        (transKeyLower === funcKeyLower && toolName.toLowerCase().includes('transfer'))
      );

      const isConfigFunction = !isConfigEndSession && !isConfigTransfer && config.functionKeyword && (
        typeStr === funcKeyLower ||
        obj[config.functionKeyword] ||
        obj[funcKeyLower] ||
        (funcKeyLower === 'toolcall' && obj.toolCall)
      );

      const isActuallyTransfer = isConfigTransfer ||
        (config.transferKeyword === 'TransferToAgentTool' && (obj.transfertoagenttool || obj.agentTransfer));

      if (isActuallyTransfer && mode !== 'prod multi agent') {
        hasEnvironmentMismatch = true;
      }

      if (mode === 'pre-prod') {
        if (isConfigFunction || obj.toolCall) {
          category = 'toolCall';
        }
      } else {
        if (isConfigEndSession || (config.endSessionKeyword === 'EndSessionTool' && (typeStr === 'endsessiontool' || obj.endsessiontool))) {
          category = 'endsessiontool';
        } else if (isConfigTransfer || (config.transferKeyword === 'TransferToAgentTool' && (obj.transfertoagenttool || obj.agentTransfer))) {
          category = 'transfertoagenttool';
        } else if (isConfigFunction || (config.functionKeyword === 'PythonFunctionTool' && obj.pythonfunctiontool)) {
          category = 'pythonfunctiontool';
        }
      }

      // Eagerly try to extract a bundled response if it lives in the same object
      let toolResp: any = obj.response || obj.toolResponse || obj.tool_response || obj.ToolResponse || obj.content;

      for (const nested of [obj.toolCall, obj.pythonfunctiontool, obj.endsessiontool]) {
        if (!toolResp && nested) {
          toolResp = nested.response || nested.toolResponse || nested.tool_response || nested.content;
        }
      }

      if (toolResp && typeof toolResp === 'object' && toolResp.response) {
        toolResp = toolResp.response;
      } else if (toolResp && typeof toolResp === 'object' && toolResp.content) {
        toolResp = toolResp.content;
      }

      const pushToolEvent = (type: ParsedEvent['type']) => {
        events.push({
          id: extractId(obj) || generateId(),
          type,
          toolName,
          arguments: toolArgs,
          response: toolResp,
          timestamp: currentTime,
          raw: { agent: currentAgent, ...obj }
        });
      };

      if (mode === 'pre-prod') {
        // Pre-prod: ONLY toolCall
        if (category === 'toolCall' || obj.toolCall) {
          pushToolEvent('function');
        }
      } else {
        // Prod: pythonfunctiontool + endsessiontool (+ transfertoagenttool in multi agent)
        if (category === 'pythonfunctiontool') {
          pushToolEvent('function');
        } else if (category === 'endsessiontool') {
          const shouldInclude = config.endSessionKeyword === 'EndSessionTool'
            ? toolName.toLowerCase() === 'end_session'
            : !!(toolResp && toolResp.result && toolResp.result.toLowerCase() === 'done');
          if (shouldInclude) {
            pushToolEvent('endsession');
          }
        } else if (category === 'transfertoagenttool' && mode === 'prod multi agent') {
          pushToolEvent('transfer');
        }
      }
    }

    const isToolResponse =
      obj.role === 'tool' ||
      obj.type === 'tool_response' ||
      obj.type === 'toolResponse' ||
      obj.type === 'ToolResponse' ||
      !!obj.tool_response ||
      !!obj.toolResponse ||
      !!obj.ToolResponse;

    if (isToolResponse) {
      let responseContent = obj.content || obj.response || obj.tool_response || obj.toolResponse || obj.ToolResponse;

      // Handle nested response structures commonly found in APIs
      if (responseContent && typeof responseContent === 'object' && responseContent.response) {
        responseContent = responseContent.response;
      } else if (responseContent && typeof responseContent === 'object' && responseContent.content) {
        responseContent = responseContent.content;
      }

      events.push({
        id: extractId(obj) || generateId(),
        type: 'tool_response',
        response: responseContent,
        timestamp: currentTime,
        raw: { agent: currentAgent, ...obj }
      });
    }

    // Extract Transcript / Message Events
    let role = '';
    let content = '';

    if (hasDiagnosticMessages) {
      // In new multi-agent format, prioritize transcript inside chunks to capture agent names,
      // and explicitly ignore the top-level recognitionResult/sessionOutput to avoid duplicates.
      if (typeof obj.transcript === 'string' && structuralKey === 'chunks') {
        role = currentAgent || 'user';
        content = obj.transcript;
      } else if (repair.rebuilt.has(obj)) {
        // A turn that never got its assembled message, put back together from
        // the streamed fragments so the conversation does not just stop.
        const turn = repair.rebuilt.get(obj)!;
        role = turn.role;
        content = turn.text;
      } else if (repair.keepRecognition.has(obj) && typeof obj.recognitionResult?.transcript === 'string') {
        role = 'user';
        content = obj.recognitionResult.transcript;
      }
    } else {
      // Legacy format fallback
      if (obj.recognitionResult && typeof obj.recognitionResult.transcript === 'string') {
        role = 'user';
        content = obj.recognitionResult.transcript;
      } else if (obj.sessionOutput && typeof obj.sessionOutput.text === 'string') {
        role = 'agent';
        content = obj.sessionOutput.text;
      } else if (typeof obj.role === 'string' && typeof obj.content === 'string') {
        role = obj.role;
        content = obj.content;
      } else if (obj.message && typeof obj.message.content === 'string') {
        role = obj.message.role || 'system';
        content = obj.message.content;
      }
    }

    if (content && content.trim() !== '' && !isToolResponse && obj.role !== 'tool' && !obj.toolCall && !obj.functionCall && !toolName) {
      let finalRole = role || 'system';
      if ((mode === 'pre-prod' || mode === 'prod single agent') && finalRole.toLowerCase() === 'account management agent') {
        finalRole = 'agent';
      }

      events.push({
        id: extractId(obj) || generateId(),
        type: 'message',
        messageRole: finalRole,
        messageContent: content,
        timestamp: currentTime,
        raw: { agent: currentAgent, ...obj }
      });
    }

    // Continue traversing down to find nested tool calls (e.g., in messages array)
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        traverse(obj[key], currentAgent, key, currentTime);
      }
    }
  }

  traverse(data);

  // Finalize duration calculation
  let durationStr: string | undefined = undefined;

  const validSpans = rootSpans.filter(s => !isNaN(s.start) && !isNaN(s.end));
  if (validSpans.length > 0) {
    // Highest precision: MIN and MAX of all rootSpans
    const min = Math.min(...validSpans.map(s => s.start));
    const max = Math.max(...validSpans.map(s => s.end));
    durationStr = formatDuration(min, max);
  } else if (rootSpans.length === 0) {
    // Fallback: Global eventTime regex
    const eventTimeRegex = /"eventTime"\s*:\s*"([^"]+)"/g;
    const dates: number[] = [];
    let match;
    while ((match = eventTimeRegex.exec(stringifiedData)) !== null) {
      const t = new Date(match[1]).getTime();
      if (!isNaN(t)) dates.push(t);
    }
    if (dates.length > 0) {
      durationStr = formatDuration(Math.min(...dates), Math.max(...dates));
    }
  }

  // Sort events chronologically if they have a timestamp
  events.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }
    return 0; // maintain original relative order if no timestamp
  });

  // Deduplicate and process events: pair tool responses with their function calls if IDs match
  const functionMap = new Map<string, ParsedEvent>();
  const finalEvents: ParsedEvent[] = [];

  events.forEach(event => {
    if (event.type === 'function') {
      functionMap.set(event.id, event);
      finalEvents.push(event);
    } else if (event.type === 'transfer') {
      finalEvents.push(event);
    } else if (event.type === 'endsession') {
      // Find if we already have an endsession with this exact same non-random ID
      const existingEndSession = finalEvents.find(e => e.type === 'endsession' && e.id === event.id && e.id && e.id.length > 7);
      if (existingEndSession) {
        existingEndSession.duplicateCount = (existingEndSession.duplicateCount || 1) + 1;
      } else {
        event.duplicateCount = 1;
        finalEvents.push(event);
      }
    } else if (event.type === 'message') {
      const lastEvent = finalEvents[finalEvents.length - 1];
      if (lastEvent && lastEvent.type === 'message' && lastEvent.messageRole === event.messageRole) {
        lastEvent.messageContent = (lastEvent.messageContent || '') + (event.messageContent || '');
      } else {
        finalEvents.push(event);
      }
    } else if (event.type === 'tool_response') {
      if (functionMap.has(event.id)) {
        const funcEvent = functionMap.get(event.id)!;
        funcEvent.response = event.response;
        // Optionally attach the raw response to the raw function
        funcEvent.raw = { ...funcEvent.raw, tool_response_raw: event.raw };
      } else {
        // Fallback: If IDs didn't match (e.g. they were missing and random IDs were generated),
        // fallback to sequentially matching it to the last unmatched function in the timeline.
        const lastUnmatchedFunction = [...finalEvents].reverse().find(e => e.type === 'function' && !e.response);

        let shouldDrop = false;
        if (mode === 'prod multi agent' || mode === 'prod single agent') {
          const rawStr = JSON.stringify(event.raw).toLowerCase();
          if (rawStr.includes('toolcall') || rawStr.includes('thinker')) {
            shouldDrop = true;
          }
        }

        if (!shouldDrop && lastUnmatchedFunction) {
          lastUnmatchedFunction.response = event.response;
          lastUnmatchedFunction.raw = { ...lastUnmatchedFunction.raw, tool_response_raw: event.raw };
        }
      }
    }
  });

  return {
    agentType: mode,
    sessionId,
    duration: durationStr,
    hasEnvironmentMismatch,
    referenceData: Object.keys(referenceData).length > 0 ? referenceData : undefined,
    transcriptNotes: checkTranscript(data, finalEvents, repair),
    rawJsonText: JSON.stringify(data, null, 2),
    events: finalEvents
  };
}

/**
 * Compares what ended up in the transcript against what the file actually
 * contains, so a session written in an unexpected shape is called out rather
 * than quietly coming out short.
 */
function checkTranscript(
  data: unknown,
  events: ParsedEvent[],
  repair: StreamRepair,
): string[] | undefined {
  const notes: string[] = [];

  if (repair.turnsRebuilt > 0) {
    notes.push(
      `${repair.turnsRebuilt} agent ${repair.turnsRebuilt === 1 ? 'turn' : 'turns'} never got written ` +
        'out in full by the agent, so they were rebuilt from the streamed pieces. Worth reading those ' +
        'against the agent interface before you rate them.',
    );
  }

  if (Array.isArray(data)) {
    const spoken = events.filter(e => e.type === 'message');
    const shown = new Set(spoken.map(e => (e.messageContent ?? '').replace(/\s+/g, ' ').trim()));

    // Every user turn in the file should appear somewhere in the transcript.
    const missingUser = data.filter(entry => {
      const said = entry?.recognitionResult?.transcript;
      if (typeof said !== 'string' || said.trim() === '') return false;
      const normalised = said.replace(/\s+/g, ' ').trim();
      return ![...shown].some(text => text.includes(normalised));
    }).length;

    if (missingUser > 0) {
      notes.push(
        `${missingUser} thing${missingUser === 1 ? '' : 's'} the user said ${missingUser === 1 ? 'is' : 'are'} ` +
          'in the file but not in the transcript below. Check the agent interface, the transcript here may be short.',
      );
    }

    const turns = new Set<number>();
    data.forEach(entry => {
      const turn = entry?.sessionOutput?.turnIndex;
      if (typeof turn === 'number') turns.add(turn);
    });
    const agentTurns = spoken.filter(e => (e.messageRole ?? '').toLowerCase() !== 'user').length;
    if (turns.size > 0 && agentTurns < turns.size) {
      notes.push(
        `The file has ${turns.size} agent turns but only ${agentTurns} came through. ` +
          'Some of what the agent said is probably missing here.',
      );
    }
  }

  return notes.length > 0 ? notes : undefined;
}
