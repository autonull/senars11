export const interactiveDemos = {
    "Smart Home Control": {
        "description": "Interactive dashboard with reasoning.",
        "concepts": [
            {
                "term": "LivingRoom",
                "priority": 0.95,
                "type": "concept",
                "widgetContent": `
                    <div class="zui-panel" style="width: 200px;">
                        <div class="zui-header">Living Room</div>
                        <div class="zui-content">
                            <div style="margin-bottom: 5px; color: #ccc;">Temperature: <span id="lr-temp-val" style="color: #00ff9d;">72</span>°F</div>
                            <input type="range" min="60" max="80" value="72" class="zui-input" oninput="document.getElementById('lr-temp-val').textContent = this.value">
                            <div class="zui-controls">
                                <button class="zui-btn primary">Lights On</button>
                                <button class="zui-btn">Off</button>
                            </div>
                        </div>
                    </div>`
            },
            {
                "term": "SecuritySystem",
                "priority": 0.98,
                "type": "concept",
                "widgetContent": `
                    <div class="zui-panel" style="width: 180px; border-color: #ff4444;">
                        <div class="zui-header" style="background: rgba(255, 68, 68, 0.2); color: #ff4444;">Security</div>
                        <div class="zui-content">
                            <div style="margin-bottom: 8px;">Status: <span style="color: #ff4444; font-weight: bold;">ARMED</span></div>
                            <button class="zui-btn" style="width: 100%; border-color: #ff4444; color: #ff4444;">DISARM</button>
                        </div>
                    </div>`
            },
            {
                "term": "MovieMode",
                "priority": 0.85,
                "type": "concept"
            }
        ],
        "relationships": [
            ["MovieMode", "LivingRoom", "implication"]
        ]
    }
};
