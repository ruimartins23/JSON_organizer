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
  events: ParsedEvent[];
}

export function parseAITrainingJSON(
  data: any, 
  mode: EnvironmentMode, 
  config: ParserConfig = { functionKeyword: 'PythonFunctionTool', transferKeyword: 'TransferToAgentTool', endSessionKeyword: 'EndSessionTool' }
): OrganizedTimeline {
  const events: ParsedEvent[] = [];
  
  // Helper to generate a unique ID
  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Check if this JSON has the new diagnosticInfo chunks format
  const stringifiedData = JSON.stringify(data);
  const hasDiagnosticMessages = stringifiedData.includes('"diagnosticInfo"') && stringifiedData.includes('"chunks"');

  // Attempt to extract session ID from agent-turn URIs
  let sessionId: string | undefined = undefined;
  const sessionMatch = stringifiedData.match(/\/([^/]+)\/agent-turn/);
  if (sessionMatch && sessionMatch[1]) {
    sessionId = sessionMatch[1];
  }

  // Calculate duration from eventTime fields
  let durationStr: string | undefined = undefined;
  const eventTimeRegex = /"eventTime"\s*:\s*"([^"]+)"/g;
  let match;
  const eventTimes: string[] = [];
  while ((match = eventTimeRegex.exec(stringifiedData)) !== null) {
    eventTimes.push(match[1]);
  }
  if (eventTimes.length > 0) {
    const dates = eventTimes.map(t => new Date(t).getTime()).filter(t => !isNaN(t));
    if (dates.length > 0) {
      const min = Math.min(...dates);
      const max = Math.max(...dates);
      const diffMs = max - min;
      const minutes = Math.floor(diffMs / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  // Recursively search the JSON for useful objects
  function traverse(obj: any, parentAgent?: string, structuralKey?: string) {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach((item) => traverse(item, parentAgent, structuralKey));
      return;
    }

    const currentAgent = obj.agent || obj.role || obj.agentName || parentAgent;

    // Identify tool name and arguments explicitly
    let toolName = '';
    let toolArgs: any = null;

    if (obj.toolCall) {
       toolName = obj.toolCall.displayName || obj.toolCall.name || 'toolCall';
       toolArgs = obj.toolCall.args || obj.toolCall.arguments;
    }
    else if (config.functionKeyword && obj[config.functionKeyword]) {
       toolName = obj[config.functionKeyword].displayName || obj[config.functionKeyword].name || config.functionKeyword;
       toolArgs = obj[config.functionKeyword].args || obj[config.functionKeyword].arguments || obj[config.functionKeyword];
    }
    else if (config.endSessionKeyword && obj[config.endSessionKeyword]) {
       toolName = obj[config.endSessionKeyword].displayName || obj[config.endSessionKeyword].name || config.endSessionKeyword;
       toolArgs = obj[config.endSessionKeyword].args || obj[config.endSessionKeyword].arguments || obj[config.endSessionKeyword];
    }
    else if (config.transferKeyword && obj[config.transferKeyword]) {
       toolName = obj[config.transferKeyword].displayName || obj[config.transferKeyword].name || config.transferKeyword;
       toolArgs = obj[config.transferKeyword].args || obj[config.transferKeyword].arguments || obj[config.transferKeyword];
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

    // Extract ID from toolResponses and toolCalls to later sync them
    const extractId = (o: any) => {
      const directId = o.id || o.tool_call_id || o.toolCallId || o['tool call id'] || o.call_id || o.callId;
      if (directId) return directId;
      if (o.toolResponse) return o.toolResponse.id || o.toolResponse.tool_call_id || o.toolResponse['tool call id'];
      if (o.tool_response) return o.tool_response.id || o.tool_response.tool_call_id || o.tool_response['tool call id'];
      if (o.toolCall) return o.toolCall.id || o.toolCall.tool_call_id || o.toolCall['tool call id'];
      return null;
    };

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

      if (mode === 'pre-prod') {
        if (isConfigFunction || obj.toolCall) {
          category = 'toolCall';
        }
      } else {
        if (isEndSessionName || isConfigEndSession || (config.endSessionKeyword === 'EndSessionTool' && (typeStr === 'endsessiontool' || obj.endsessiontool))) {
          category = 'endsessiontool';
        } else if (isConfigTransfer || (config.transferKeyword === 'TransferToAgentTool' && (obj.transfertoagenttool || obj.agentTransfer))) {
          category = 'transfertoagenttool';
        } else if (isConfigFunction || (config.functionKeyword === 'PythonFunctionTool' && obj.pythonfunctiontool)) {
          category = 'pythonfunctiontool';
        }
      }

      // Eagerly try to extract a bundled response if it lives in the same object
      let toolResp: any = obj.response || obj.toolResponse || obj.tool_response || obj.ToolResponse || obj.content;
      
      if (!toolResp && obj.toolCall) {
        toolResp = obj.toolCall.response || obj.toolCall.toolResponse || obj.toolCall.tool_response || obj.toolCall.content;
      }
      if (!toolResp && obj.pythonfunctiontool) {
        toolResp = obj.pythonfunctiontool.response || obj.pythonfunctiontool.toolResponse || obj.pythonfunctiontool.tool_response || obj.pythonfunctiontool.content;
      }
      
      if (toolResp && typeof toolResp === 'object' && toolResp.response) {
        toolResp = toolResp.response;
      } else if (toolResp && typeof toolResp === 'object' && toolResp.content) {
        toolResp = toolResp.content;
      }

      if (mode === 'pre-prod') {
        // Pre-prod: ONLY toolCall
        if (category === 'toolCall' || obj.toolCall) {
           events.push({
             id: extractId(obj) || generateId(),
             type: 'function',
             toolName: toolName,
             arguments: toolArgs,
             response: toolResp,
             raw: { agent: currentAgent, ...obj }
           });
        }
      } 
      else if (mode === 'prod single agent') {
        // Prod Single Agent: ONLY pythonfunctiontool and endsessiontool
        if (category === 'pythonfunctiontool') {
           events.push({
             id: extractId(obj) || generateId(),
             type: 'function',
             toolName: toolName,
             arguments: toolArgs,
             response: toolResp,
             raw: { agent: currentAgent, ...obj }
           });
        } else if (category === 'endsessiontool') {
           events.push({
             id: extractId(obj) || generateId(),
             type: 'endsession',
             toolName: toolName,
             arguments: toolArgs,
             response: toolResp,
             raw: { agent: currentAgent, ...obj }
           });
        }
      }
      else if (mode === 'prod multi agent') {
        // Prod Multi Agent: ONLY pythonfunctiontool, endsessiontool, and transfertoagenttool
        if (category === 'pythonfunctiontool') {
           events.push({
             id: extractId(obj) || generateId(),
             type: 'function',
             toolName: toolName,
             arguments: toolArgs,
             response: toolResp,
             raw: { agent: currentAgent, ...obj }
           });
        } else if (category === 'endsessiontool') {
           events.push({
             id: extractId(obj) || generateId(),
             type: 'endsession',
             toolName: toolName,
             arguments: toolArgs,
             response: toolResp,
             raw: { agent: currentAgent, ...obj }
           });
        } else if (category === 'transfertoagenttool') {
           events.push({
             id: extractId(obj) || generateId(),
             type: 'transfer',
             toolName: toolName,
             arguments: toolArgs,
             response: toolResp,
             raw: { agent: currentAgent, ...obj }
           });
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
      events.push({
        id: extractId(obj) || generateId(),
        type: 'message',
        messageRole: role || 'system',
        messageContent: content,
        raw: { agent: currentAgent, ...obj }
      });
    }

    // Continue traversing down to find nested tool calls (e.g., in messages array)
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        traverse(obj[key], currentAgent, key);
      }
    }
  }

  traverse(data);

  // Post-processing: pair tool responses with their function calls if IDs match
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
    sessionId: sessionId,
    duration: durationStr,
    rawJsonText: JSON.stringify(data, null, 2),
    events: finalEvents
  };
}
