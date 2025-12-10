const MAX_LOGS = 200;
const logs = [];

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function formatLog(level, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return '[Circular/Object]';
            }
        }
        return String(arg);
    }).join(' ');
    return `[${timestamp}] [${level}] ${message}`;
}

function addLog(level, args) {
    const logEntry = formatLog(level, args);
    logs.push(logEntry);
    if (logs.length > MAX_LOGS) {
        logs.shift();
    }
}

console.log = (...args) => {
    addLog('INFO', args);
    originalLog.apply(console, args);
};

console.warn = (...args) => {
    addLog('WARN', args);
    originalWarn.apply(console, args);
};

console.error = (...args) => {
    addLog('ERROR', args);
    originalError.apply(console, args);
};

export const getLogs = () => {
    return logs.join('\n');
};

/**
 * Application logger for structured logging by component
 * Usage: logger.tabs('Tab created', { id: 'tab-1', theme: 'molten' });
 */
export const logger = {
    tabs: (action, data = {}) => {
        console.log(`[Tabs] ${action}`, data);
    },
    theme: (action, data = {}) => {
        console.log(`[Theme] ${action}`, data);
    },
    session: (action, data = {}) => {
        console.log(`[Session] ${action}`, data);
    },
    toast: (action, data = {}) => {
        console.log(`[Toast] ${action}`, data);
    },
    terminal: (action, data = {}) => {
        console.log(`[Terminal] ${action}`, data);
    },
    settings: (action, data = {}) => {
        console.log(`[Settings] ${action}`, data);
    },
};
