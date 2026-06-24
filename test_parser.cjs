const fs = require('fs');

function parseAITrainingJSON(data, mode) {
  const events = [];
  function generateId() { return '123'; }

  function traverse(obj) {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
      return;
    }

    let toolName = '';
    let toolArgs = null;

    if (obj.toolCall) {
       toolName = obj.toolCall.displayName || obj.toolCall.name || 'toolCall';
       toolArgs = obj.toolCall.args || obj.toolCall.arguments;
    }
    else if (obj.pythonfunctiontool) {
       toolName = 'pythonfunctiontool';
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

    if (toolName) {
      if (mode === 'pre-prod') {
        if (obj.toolCall) {
           events.push({
             id: obj.id || generateId(),
             type: 'function',
             toolName: toolName,
             arguments: toolArgs,
             raw: obj
           });
        }
      } 
      else if (mode === 'prod single agent') {
        if (toolName === 'pythonfunctiontool') {
           events.push({
             id: obj.id || generateId(),
             type: 'function',
             toolName: toolName,
             arguments: toolArgs,
             raw: obj
           });
        } else if (toolName === 'endsessiontool') {
           events.push({
             id: obj.id || generateId(),
             type: 'endsession',
             toolName: toolName,
             arguments: toolArgs,
             raw: obj
           });
        }
      }
      else if (mode === 'prod multi agent') {
        if (toolName === 'pythonfunctiontool') {
           events.push({
             id: obj.id || generateId(),
             type: 'function',
             toolName: toolName,
             arguments: toolArgs,
             raw: obj
           });
        } else if (toolName === 'endsessiontool') {
           events.push({
             id: obj.id || generateId(),
             type: 'endsession',
             toolName: toolName,
             arguments: toolArgs,
             raw: obj
           });
        } else if (toolName === 'transfertoagenttool') {
           events.push({
             id: obj.id || generateId(),
             type: 'transfer',
             toolName: toolName,
             arguments: toolArgs,
             raw: obj
           });
        }
      }
    }

    const isToolResponse = obj.role === 'tool' || obj.type === 'tool_response' || !!obj.tool_response;
    if (isToolResponse) {
      events.push({
        id: obj.tool_call_id || generateId(),
        type: 'tool_response',
        response: obj.content || obj.response || obj.tool_response,
        raw: obj
      });
    }

    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        traverse(obj[key]);
      }
    }
  }

  traverse(data);
  return events;
}

const samplePreProd = [{ "toolCall": { "displayName": "thinker", "args": { "req": "1" } } }];
console.log("Pre-prod:", parseAITrainingJSON(samplePreProd, 'pre-prod'));

const sampleProdSingle = [{ "functionCall": { "name": "pythonfunctiontool", "args": { "a": 1 } } }, { "name": "endsessiontool", "args": {} }];
console.log("Prod Single:", parseAITrainingJSON(sampleProdSingle, 'prod single agent'));

const sampleProdMulti = [{ "transfertoagenttool": { "args": { "target": "Billing" } } }];
console.log("Prod Multi:", parseAITrainingJSON(sampleProdMulti, 'prod multi agent'));

