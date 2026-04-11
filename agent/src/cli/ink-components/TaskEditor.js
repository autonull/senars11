import React, {useState} from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';

export const TaskEditor = ({tasks = [], onSelect, selectedTaskId, onTaskOperation, groupingMode = null}) => {
    const [contextMenuTask, setContextMenuTask] = useState(null);
    const [showContextMenu, setShowContextMenu] = useState(false);

    // Group tasks if grouping mode is specified
    const groupedTasks = React.useMemo(() => {
        if (!groupingMode) {
            return tasks;
        }

        const groups = {};

        for (const task of tasks) {
            let groupKey;

            switch (groupingMode) {
                case 'priority':
                    const priorityRange = Math.floor(task.priority * 10) / 10;
                    groupKey = `Priority: ${priorityRange.toFixed(1)}`;
                    break;
                case 'time':
                    groupKey = `Date: ${new Date(task.timestamp).toDateString()}`;
                    break;
                case 'status':
                    if (task.error) {
                        groupKey = 'Status: Error';
                    } else if (task.processed) {
                        groupKey = 'Status: Processed';
                    } else if (task.pending) {
                        groupKey = 'Status: Pending';
                    } else {
                        groupKey = 'Status: Unknown';
                    }
                    break;
                default:
                    groupKey = 'All Tasks';
            }

            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(task);
        }

        return groups;
    }, [tasks, groupingMode]);

    // Format task for display with color coding
    const formatTask = (task, index) => {
        let priorityColor = 'white';
        if (task.priority >= 0.9) {
            priorityColor = 'red';
        } else if (task.priority >= 0.7) {
            priorityColor = 'lightRed';
        } else if (task.priority >= 0.5) {
            priorityColor = 'yellow';
        } else if (task.priority >= 0.3) {
            priorityColor = 'lightYellow';
        } else {
            priorityColor = 'green';
        }

        let statusIndicator = '🔹';
        let statusColor = 'blue';

        if (task.error) {
            statusIndicator = '❌';
            statusColor = 'red';
        } else if (task.processed) {
            statusIndicator = '✅';
            statusColor = 'green';
        } else if (task.pending) {
            statusIndicator = '⏳';
            statusColor = 'yellow';
        } else {
            statusIndicator = '🔹';
            statusColor = 'blue';
        }

        const isSelected = selectedTaskId === task.id;
        const prefix = isSelected ? '✓ ' : '  ';

        return React.createElement(
            Box,
            {key: task.id || `task-${index}`, flexDirection: 'row', paddingX: 1},
            React.createElement(Text, {color: statusColor}, statusIndicator),
            React.createElement(Text, {marginLeft: 1, color: priorityColor}, `P:${task.priority.toFixed(2)}`),
            React.createElement(Text, {
                marginLeft: 1,
                bold: isSelected
            }, `${prefix}${task.content.substring(0, 50)}${task.content.length > 50 ? '...' : ''}`)
        );
    };

    // Handle task selection with context menu
    const handleSelect = (item) => {
        const taskId = item.value;
        onSelect && onSelect(taskId);

        // Show context menu options
        const contextMenuItems = [
            {label: '🗑️ Delete Task', value: 'delete'},
            {label: '✏️ Edit Task', value: 'edit'},
            {label: '⚖️ Adjust Priority', value: 'priority'},
            {label: 'Cancel', value: 'cancel'}
        ];

        setContextMenuTask(taskId);
        setShowContextMenu(true);
    };

    // Handle context menu selection
    const handleContextSelect = (item) => {
        if (contextMenuTask && item.value !== 'cancel') {
            switch (item.value) {
                case 'delete':
                    onTaskOperation && onTaskOperation('delete', contextMenuTask);
                    break;
                case 'edit':
                    // For edit, we'd need a different UI component, for now just show a message
                    console.log(`Edit task ${contextMenuTask} functionality`);
                    break;
                case 'priority':
                    // For priority, we'd need a different UI component, for now just show a message
                    console.log(`Adjust priority for task ${contextMenuTask} functionality`);
                    break;
            }
        }
        setShowContextMenu(false);
        setContextMenuTask(null);
    };

    if (groupingMode) {
        // Render grouped tasks
        const allElements = [];
        Object.entries(groupedTasks).forEach(([groupKey, groupTasks]) => {
            allElements.push(React.createElement(
                Text,
                {key: `group-${groupKey}`, bold: true, color: 'magenta'},
                `📁 ${groupKey} (${groupTasks.length})`
            ));
            groupTasks.forEach((task, index) => {
                allElements.push(formatTask(task, index));
            });
        });

        return React.createElement(
            Box,
            {flexDirection: 'column', padding: 1, flexGrow: 1, borderStyle: 'round'},
            React.createElement(Text, {bold: true, color: 'cyan'}, `Task Groups - ${groupingMode}`),
            ...allElements
        );
    } else {
        // Standard task list
        return React.createElement(
            Box,
            {flexDirection: 'column', padding: 1, flexGrow: 1, borderStyle: 'round'},
            React.createElement(Text, {bold: true, color: 'cyan'}, `Tasks (${tasks.length})`),
            ...tasks.map((task, index) => formatTask(task, index)),
            showContextMenu && React.createElement(
                Box,
                {borderStyle: 'round', padding: 1, backgroundColor: 'black'},
                React.createElement(SelectInput, {
                    items: [
                        {label: '🗑️ Delete Task', value: 'delete'},
                        {label: '✏️ Edit Task', value: 'edit'},
                        {label: '⚖️ Adjust Priority', value: 'priority'},
                        {label: 'Cancel', value: 'cancel'}
                    ],
                    onSelect: handleContextSelect
                })
            )
        );
    }
};
