import {useCallback, useEffect, useState} from 'react';
import {v4 as uuidv4} from 'uuid';
import {ActivityViewModel} from '@senars/agent';

export const useAgentLogs = (engine, app) => {
    const [logs, setLogs] = useState([{
        id: uuidv4(),
        title: 'System Log',
        subtitle: 'Agent TUI initialized',
        timestamp: Date.now(),
        color: 'cyan',
        icon: '🤖',
        type: 'activity.system.log'
    }]);

    const [status, setStatus] = useState({isRunning: false, cycle: 0});

    // Add log message (supports legacy string or new ViewModel object)
    const addLog = useCallback((content, type = 'info') => {
        setLogs(prevLogs => {
            const timestamp = Date.now();

            // Construct log object
            const newLog = (typeof content === 'object' && content !== null)
                ? {id: uuidv4(), timestamp, ...content}
                : {id: uuidv4(), timestamp, message: content, type};

            // Check duplicates (simple check based on message/title)
            const isDuplicate = prevLogs.slice(-2).some(log =>
                (log.message && log.message === newLog.message) ||
                (log.title && log.title === newLog.title && log.subtitle === newLog.subtitle)
            );

            if (isDuplicate) {return prevLogs;}

            return [...prevLogs, newLog].slice(-50);
        });
    }, []);

    const updateLog = useCallback((id, message, type) => {
        setLogs(prevLogs => prevLogs.map(log =>
            log.id === id
                ? {...log, message, type: type || log.type}
                : log
        ));
    }, []);

    useEffect(() => {
        // Shared listeners (status, cycle)
        const handleStatus = (newStatus) => setStatus(prev => ({...prev, ...newStatus}));
        const handleCycleStep = (data) => setStatus(prev => ({
            ...prev,
            cycle: data.cycleAfter ?? data.cycle ?? 0
        }));
        const handleCycleRunning = () => setStatus(prev => ({...prev, isRunning: true}));
        const handleCycleStop = () => setStatus(prev => ({...prev, isRunning: false}));

        engine.on('status', handleStatus);
        engine.on('nar.cycle.step', handleCycleStep);
        engine.on('nar.cycle.running', handleCycleRunning);
        engine.on('nar.cycle.stop', handleCycleStop);

        // cleanup function for status listeners
        const cleanupStatus = () => {
            engine.off('status', handleStatus);
            engine.off('nar.cycle.step', handleCycleStep);
            engine.off('nar.cycle.running', handleCycleRunning);
            engine.off('nar.cycle.stop', handleCycleStop);
        };

        // Unified Log Handling via ActivityModel
        // TUI always requires app context for robust logging
        if (app?.activityModel) {
            const unsubscribeModel = app.activityModel.subscribe((event, data) => {
                if (event === 'add') {
                    const formatted = ActivityViewModel.format(data);
                    setLogs(prev => [...prev, formatted].slice(-50));
                } else if (event === 'clear') {
                    setLogs([]);
                }
            });

            return () => {
                cleanupStatus();
                unsubscribeModel();
            };
        }

        // No legacy fallback: ActivityModel is the single source of truth for logs.
        // Status listeners are managed by cleanupStatus.
        return cleanupStatus;

    }, [engine, app, addLog]);

    return {logs, status, addLog, setLogs, updateLog};
};
