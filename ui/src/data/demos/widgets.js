export const widgetDemos = {
    "Complex Widgets": {
        "description": "Showcase of complex widgets with configurable positioning.",
        "bagCapacity": 100,
        "concepts": [
            {
                "term": "SystemStatus",
                "priority": 0.95,
                "type": "concept",
                "widgetOptions": { "position": "top" },
                "widgetContent": `
                    <div class="zui-panel" style="width: 220px; border-color: #00d4ff;">
                        <div class="zui-header" style="background: rgba(0, 212, 255, 0.2); color: #00d4ff; font-weight: bold;">
                            <span style="margin-right: 5px;">📊</span> System Health
                        </div>
                        <div class="zui-content" style="padding: 10px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <span style="color: #aaa;">CPU Usage</span>
                                <span style="color: #fff;">42%</span>
                            </div>
                            <div style="width: 100%; height: 4px; background: #333; border-radius: 2px; margin-bottom: 8px;">
                                <div style="width: 42%; height: 100%; background: #00d4ff; border-radius: 2px;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <span style="color: #aaa;">Memory</span>
                                <span style="color: #fff;">78%</span>
                            </div>
                            <div style="width: 100%; height: 4px; background: #333; border-radius: 2px;">
                                <div style="width: 78%; height: 100%; background: #ffcc00; border-radius: 2px;"></div>
                            </div>
                        </div>
                    </div>`
            },
            {
                "term": "SecurityFeed",
                "priority": 0.8,
                "type": "concept",
                "widgetOptions": { "position": "left" },
                "widgetContent": `
                    <div class="zui-panel" style="width: 180px; padding: 0;">
                        <div style="height: 100px; background: #000; position: relative; overflow: hidden; border-radius: 4px 4px 0 0;">
                            <div style="position: absolute; top: 5px; left: 5px; color: #ff4444; font-size: 10px; font-weight: bold;">● REC</div>
                            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #333;">
                                [Camera Feed]
                            </div>
                        </div>
                        <div class="zui-content" style="padding: 8px;">
                            <div style="font-size: 11px; color: #aaa;">Gate A - 14:32:01</div>
                        </div>
                    </div>`
            },
            {
                "term": "AccessControl",
                "priority": 0.7,
                "type": "concept",
                "widgetOptions": { "position": "right" },
                "widgetContent": `
                    <div class="zui-panel" style="width: 160px;">
                        <div class="zui-header">Access</div>
                        <div class="zui-content">
                            <button class="zui-btn primary" style="width: 100%; margin-bottom: 5px;">Unlock</button>
                            <button class="zui-btn" style="width: 100%;">Lockdown</button>
                        </div>
                    </div>`
            },
            {
                "term": "Logs",
                "priority": 0.6,
                "type": "concept",
                "widgetOptions": { "position": "bottom" },
                "widgetContent": `
                    <div class="zui-panel" style="width: 250px;">
                        <div class="zui-content" style="padding: 0; max-height: 80px; overflow-y: auto; font-family: monospace; font-size: 10px;">
                            <div style="padding: 4px 8px; border-bottom: 1px solid #222; color: #888;">> System boot sequence init...</div>
                            <div style="padding: 4px 8px; border-bottom: 1px solid #222; color: #00ff9d;">> Services connected.</div>
                            <div style="padding: 4px 8px; border-bottom: 1px solid #222; color: #ffcc00;">> Warning: Latency spike detected.</div>
                            <div style="padding: 4px 8px; color: #888;">> Syncing databases...</div>
                        </div>
                    </div>`
            },
            {
                "term": "Alert",
                "priority": 0.5,
                "type": "concept",
                "widgetOptions": { "position": "center" },
                "widgetContent": `
                    <div style="background: rgba(255, 68, 68, 0.9); color: white; padding: 5px 10px; border-radius: 12px; font-weight: bold; font-size: 12px; box-shadow: 0 0 10px rgba(255,0,0,0.5);">
                        ⚠ Critical
                    </div>`
            }
        ],
        "relationships": [
            ["SystemStatus", "Logs", "generates"],
            ["SecurityFeed", "AccessControl", "monitors"],
            ["SystemStatus", "Alert", "triggers"]
        ]
    }
};
