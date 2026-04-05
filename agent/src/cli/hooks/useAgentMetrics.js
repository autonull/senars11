import {useEffect, useState} from 'react';

export const useAgentMetrics = (engine) => {
    const [metrics, setMetrics] = useState({
        throughput: 0,
        memory: 0,
        cycles: 0,
        uptime: 0
    });

    useEffect(() => {
        const handleMetrics = (data) => {
            if (!data) {
                return;
            }
            const perf = data.performance || {};
            const res = data.resourceUsage || {};

            setMetrics({
                throughput: perf.throughput || 0,
                memory: res.heapUsed ? Math.round(res.heapUsed / 1024 / 1024) : 0, // MB
                cycles: data.reasoningSteps || 0,
                uptime: data.uptime || 0
            });
        };

        const handleAnomaly = (data) => {
            // Could set an alert state here
        };

        engine.on('metrics.updated', handleMetrics);
        engine.on('metrics.anomaly', handleAnomaly);

        return () => {
            engine.off('metrics.updated', handleMetrics);
            engine.off('metrics.anomaly', handleAnomaly);
        };
    }, [engine]);

    return metrics;
};
