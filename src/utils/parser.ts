export type EnvironmentMode = 'pre-prod' | 'prod single agent' | 'prod multi agent';

export interface ParsedEvent {
  id: string;
  type: 'function' | 'transfer' | 'endsession' | 'tool_response';
  toolName?: string;
  arguments?: any;
  response?: any;
  raw: any;
  timestamp?: string;
}

export interface OrganizedTimeline {
  agentType: EnvironmentMode;
  events: ParsedEvent[];
}

export function parseAITrainingJSON(data: any, mode: EnvironmentMode): OrganizedTimeline {
  const events: ParsedEvent[] = [];
  
  // Helper to generate a unique ID
  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Recursively search the JSON for useful objects
  function traverse(obj: any) {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
      return;
    }

    // Identify tool name and arguments explicitly
    let toolName = '';
    let toolArgs: any = null;

    if (obj.toolCall) {
       toolName = obj.toolCall.displayName || obj.toolCall.name || 'toolCall';
       toolArgs = obj.toolCall.args || obj.toolCall.arguments;
    }

    // Change this line if function synxtax changes in the future
    else if (obj.pythonfunctiontool) {
       toolName = 'pythonfunctiontool'; //CSHARPFUNCTIONTOOL
       toolArgs = obj.pythonfunctiontool.args || obj.pythonfunctiontool.arguments;
    }
    else if (obj.endsessiontool) {
       toolName = 'endsessiontool';
       toolArgs = obj.endsessiontool.args || obj.endsessiontool.arguments;
    }
    else if (obj.transfertoagenttool) {
       toolName = 'transfertoagenttool';
       toolArgs = obj.transfertoagenttool.args || obj.transfertoagenttool.arguments;
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
      
      if (obj.toolCall) {
        category = 'toolCall';
      } else if (typeStr === 'pythonfunctiontool') {
        category = 'pythonfunctiontool';
      } else if (typeStr === 'endsessiontool') {
        category = 'endsessiontool';
      } else if (typeStr === 'transfertoagenttool') {
        category = 'transfertoagenttool';
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
             raw: obj
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
             raw: obj
           });
        } else if (category === 'endsessiontool') {
           events.push({
             id: extractId(obj) || generateId(),
             type: 'endsession',
             toolName: toolName,
             arguments: toolArgs,
             response: toolResp,
             raw: obj
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
             raw: obj
           });
        } else if (category === 'endsessiontool') {
           events.push({
             id: extractId(obj) || generateId(),
             type: 'endsession',
             toolName: toolName,
             arguments: toolArgs,
             response: toolResp,
             raw: obj
           });
        } else if (category === 'transfertoagenttool') {
           events.push({
             id: extractId(obj) || generateId(),
             type: 'transfer',
             toolName: toolName,
             arguments: toolArgs,
             response: toolResp,
             raw: obj
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
        raw: obj
       });
    }

    // Continue traversing down to find nested tool calls (e.g., in messages array)
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        traverse(obj[key]);
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
    } else if (event.type === 'transfer' || event.type === 'endsession') {
      finalEvents.push(event);
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
    events: finalEvents
  };
}
