import React, {useMemo, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import {v4 as uuidv4} from 'uuid';
import {handleError} from '@senars/core';
import {ReplMessageHandler} from '../ReplMessageHandler.js';
import {useCommandHistory} from '../hooks/useCommandHistory.js';
import {useAgentLogs} from '../hooks/useAgentLogs.js';
import {useAgentMetrics} from '../hooks/useAgentMetrics.js';
import {LogEntry} from './LogEntry.js';
import {ActionRegistry} from '../../app/model/ActionRegistry.js';

export const TUI = ({engine, app}) => {
    const {logs, status, addLog, setLogs, updateLog} = useAgentLogs(engine, app);
    const metrics = useAgentMetrics(engine);
    const [inputValue, setInputValue] = useState('');
    const [mode, setMode] = useState('agent'); // 'agent' or 'narsese'

    const streamingResponseRef = useRef(null);
    const streamControllerRef = useRef(null);

    const {navigateHistory, addToHistory} = useCommandHistory();

    const messageHandler = useMemo(() => new ReplMessageHandler(engine), [engine]);

    const handleControlCommand = async (type) => {
        const res = await messageHandler.processMessage({type: `control/${type}`});
        if (res.payload?.result) {
            const {result} = res.payload;
            if (typeof result === 'string') {
                addLog(result, 'success');
            } else {
                try {
                    addLog(JSON.stringify(result), 'success');
                } catch (e) {
                    addLog(`[Object data]`, 'success');
                }
            }
        }
    };

    const handleRunCommand = () => handleControlCommand('start');
    const handleStepCommand = () => handleControlCommand('step');
    const handleStopCommand = () => handleControlCommand('stop');
    const handleClearCommand = () => {
        setLogs([]);
        addLog('🧹 Logs cleared', 'info');
    };

    const handleHelpCommand = async () => {
        const res = await messageHandler.processMessage({type: '/help'});
        if (typeof res === 'string') {
            res.split('\n').forEach(line => addLog(line, 'info'));
        } else {
            const helpText = [
                '🤖 Available commands:',
                '  /help            - Show this help message',
                '  /clear           - Clear the log display',
                '  /natural         - Switch to natural language (agent) mode',
                '  /narsese         - Switch to Narsese mode',
                '  /mode [agent|narsese] - Show or change input mode',
                '  /stats           - Show system statistics',
                '  /beliefs         - List current beliefs',
                '  /goals           - List current goals',
                '  /questions       - List active questions',
                '  /tasks           - List current tasks',
                '  /trace [on|off]  - Toggle derivation trace',
                '  /step [n]        - Execute n inference cycles',
                '  /reset           - Reset the system',
                '  /demo [name]     - List or run demo files',
                '  /run <path>      - Execute a .nars file',
                '  /save            - Save state to file',
                '  /load <path>     - Load state from file',
            ];
            helpText.forEach(line => addLog(line, 'info'));
        }
    };

    const toggleMode = () => {
        const newMode = mode === 'agent' ? 'narsese' : 'agent';
        setMode(newMode);
        addLog(`🔄 Switched to ${newMode.toUpperCase()} mode`, 'success');
    };

    const handleModeCommand = (args) => {
        if (args.length > 0) {
            const newMode = args[0].toLowerCase();
            if (['agent', 'narsese'].includes(newMode)) {
                setMode(newMode);
                addLog(`🔄 Switched to ${newMode.toUpperCase()} mode`, 'success');
            } else {
                addLog('❌ Invalid mode. Use "agent" or "narsese".', 'error');
            }
        } else {
            addLog(`ℹ️ Current mode: ${mode.toUpperCase()}`, 'info');
        }
    };

    useInput((input, key) => {
        if (key.escape) {
            if (streamControllerRef.current) {
                streamControllerRef.current.abort();
                streamControllerRef.current = null;
                addLog('🛑 LM streaming interrupted', 'info');
            }
            return;
        }

        if (key.ctrl) {
            switch (input) {
                case 'r':
                    handleRunCommand();
                    return;
                case 'p':
                    handleStopCommand();
                    return;
                case 'h':
                    handleHelpCommand();
                    return;
                case 'c':
                    addLog('👋 Agent TUI terminated', 'info');
                    try {
                        engine.shutdown();
                    } catch (e) {
                    }
                    return process.exit(0);
                case 'm':
                    toggleMode();
                    return;
            }
        }


        if (key.upArrow) {navigateHistory('up', setInputValue);}
        if (key.downArrow) {navigateHistory('down', setInputValue);}
    });

    const handleSubmit = async () => {
        const command = inputValue.trim();
        if (!command) {
            await handleStepCommand();
            setInputValue('');
            return;
        }

        addToHistory(command);
        setInputValue('');

        addLog(`> ${command}`, 'info');

        await (async () => {
            try {
                if (command.startsWith('/')) {
                    const [cmdName, ...args] = command.slice(1).split(' ');


                    if (cmdName === 'mode') {
                        handleModeCommand(args);
                        return;
                    } else if (cmdName === 'natural') {
                        setMode('agent');
                        addLog(`🔄 Switched to natural language (agent) mode`, 'success');
                        return;
                    } else if (cmdName === 'narsese') {
                        setMode('narsese');
                        addLog(`🔄 Switched to Narsese mode`, 'success');
                        return;
                    } else if (cmdName === 'clear') {
                        handleClearCommand();
                        return;
                    } else if (cmdName === 'act') {
                        const lastLog = logs[logs.length - 1];
                        if (!lastLog || !lastLog.raw) {
                            addLog('❌ No active log with raw data', 'error');
                            return;
                        }
                        const actions = ActionRegistry.getActionsForActivity(lastLog.raw);
                        if (actions.length === 0) {
                            addLog('ℹ️ No actions for this activity', 'info');
                            return;
                        }


                        const actionDef = actions[0];
                        addLog(`▶️ Executing action: ${actionDef.label}`, 'info');

                        if (app.actionDispatcher) {
                            await app.actionDispatcher.dispatch({
                                type: actionDef.type,
                                payload: actionDef.payload,
                                context: {activityId: lastLog.raw.id, rawActivity: lastLog.raw}
                            });
                        } else {
                            addLog('❌ ActionDispatcher not available', 'error');
                        }
                        return;
                    }

                    const res = await messageHandler.processMessage({type: command});
                    const output = res.payload?.result ?? res;
                    if (output) {
                        if (typeof output === 'string') {
                            output.split('\n').forEach(line => addLog(line, 'success'));
                        } else {
                            try {
                                addLog(JSON.stringify(output), 'success');
                            } catch (e) {
                                if (output && typeof output === 'object' && Object.keys(output).length > 0) {
                                    addLog(`[Object with ${Object.keys(output).length} keys]`, 'success');
                                } else {
                                    addLog(`[Object data]`, 'success');
                                }
                            }
                        }
                    } else if (res.error) {
                        addLog(`❌ ${res.error}`, 'error');
                    }
                } else {
                    if (mode === 'narsese') {
                        const res = await messageHandler.processMessage({type: 'narseseInput', payload: command});
                        if (res.payload?.result) {
                            const {result} = res.payload;
                            if (typeof result === 'string') {
                                addLog(result, 'success');
                            } else {
                                try {
                                    addLog(JSON.stringify(result), 'success');
                                } catch (e) {
                                    if (result && typeof result === 'object' && Object.keys(result).length > 0) {
                                        addLog(`[Object with ${Object.keys(result).length} keys]`, 'success');
                                    } else {
                                        addLog(`[Object data]`, 'success');
                                    }
                                }
                            }
                        }
                        if (res.error) {
                            addLog(res.error, 'error');
                        }
                    } else {
                        const responseLogId = uuidv4();
                        streamingResponseRef.current = responseLogId;
                        addLog('🔄 LM thinking...', 'agent');

                        const abortController = new AbortController();
                        streamControllerRef.current = abortController;

                        const timeoutPromise = new Promise((_, reject) => {
                            setTimeout(() => reject(new Error('Request timeout after 120 seconds')), 120000);
                        });

                        const streamPromise = (async () => {
                            let fullResponse = '';


                            setLogs(prevLogs => [
                                ...prevLogs,
                                {
                                    id: responseLogId,
                                    message: '...',
                                    timestamp: Date.now(),
                                    type: 'agent'
                                }
                            ].slice(-50));

                            try {
                                for await (const chunk of engine.streamExecution(command)) {
                                    if (abortController.signal.aborted) {
                                        break;
                                    }

                                    if (chunk.type === 'agent_response') {
                                        fullResponse += chunk.content;
                                        updateLog(responseLogId, `🤖 ${fullResponse}`, 'agent');
                                    } else if (chunk.type === 'tool_call') {
                                        addLog(`🔧 Tool Call: ${chunk.name} (${JSON.stringify(chunk.args)})`, 'tool');
                                    } else if (chunk.type === 'tool_result') {
                                        addLog(`📎 Result: ${chunk.content}`, 'result');
                                    } else if (chunk.type === 'error') {
                                        addLog(chunk.content, 'error');
                                    }
                                }
                            } catch (err) {
                                if (!abortController.signal.aborted) {
                                    addLog(`❌ Streaming error: ${err.message}`, 'error');
                                }
                            }
                        })();

                        await Promise.race([streamPromise, timeoutPromise]);
                        streamingResponseRef.current = null;
                    }
                }
            } catch (error) {
                if (error.message?.includes('timeout')) {
                    addLog('⏰ Request timed out', 'error');
                } else {
                    addLog(handleError(error, 'Command processing'), 'error');
                }
            }
        })();
    };

    return React.createElement(
        Box,
        {flexDirection: 'column', width: '100%', height: '100%'},
        React.createElement(
            Box,
            {
                paddingX: 1,
                backgroundColor: mode === 'agent' ? 'blue' : 'green',
                width: '100%',
            },
            React.createElement(Text, {color: 'white', bold: true},
                `SeNARS REPL [${mode.toUpperCase()}]`
            )
        ),
        React.createElement(
            Box,
            {flexDirection: 'column', flexGrow: 1, padding: 1, maxHeight: '100%'},
            React.createElement(Text, {bold: true, color: 'cyan'}, `Logs (${logs.length})`),
            React.createElement(
                Box,
                {flexDirection: 'column', flexGrow: 1, marginTop: 1, marginBottom: 1},
                ...logs.slice(-50).map(log => React.createElement(LogEntry, {key: log.id, log}))
            )
        ),
        React.createElement(
            Box,
            {borderStyle: 'round', width: '100%', borderColor: mode === 'agent' ? 'blue' : 'green'},
            React.createElement(
                Box,
                {flexDirection: 'row', alignItems: 'center'},
                React.createElement(Text, {color: mode === 'agent' ? 'blue' : 'green', bold: true}, `${mode}> `),
                React.createElement(
                    TextInput,
                    {
                        value: inputValue,
                        onChange: setInputValue,
                        onSubmit: handleSubmit,
                        placeholder: mode === 'agent' ? 'Enter instruction for Agent...' : 'Enter Narsese (e.g. <a --> b>.)...',
                    }
                )
            )
        ),
        React.createElement(
            Box,
            {
                paddingX: 1,
                backgroundColor: 'gray',
                width: '100%',
                flexDirection: 'row',
                justifyContent: 'space-between'
            },
            React.createElement(
                Box,
                {flexDirection: 'row'},
                React.createElement(Text, {
                    color: 'white',
                    bold: true
                }, `${status.isRunning ? '🚀 RUNNING' : '⏸️ PAUSED'} `),
                React.createElement(Text, {color: 'white'}, `| Cycle: ${status.cycle} `),
                metrics.uptime > 0 && React.createElement(Text, {color: 'green'}, `| TP: ${metrics.throughput.toFixed(1)}/s `),
                metrics.uptime > 0 && React.createElement(Text, {color: 'yellow'}, `| Mem: ${metrics.memory}MB `),
                React.createElement(Text, {color: 'cyan'}, `| Agent: ${app?.activeAgentId ?? engine.id ?? 'default'} `)
            ),
            React.createElement(
                Box,
                {flexDirection: 'row'},
                React.createElement(Text, {color: 'yellow'}, 'Ctrl+M: Mode | Ctrl+C: Exit')
            )
        )
    );
};
