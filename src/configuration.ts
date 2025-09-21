import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Utility functions for handling extension configuration
 */

/**
 * Highlighting configuration structure
 */
export interface HighlightingConfig {
    backgroundColor: string;
    borderColor: string;
    borderWidth: string;
    borderRadius: string;
    borderStyle: string;
    overviewRulerColor: string;
    overviewRulerLane: 'Left' | 'Center' | 'Right' | 'Full';
    gutterIcon?: string;
    opacity: number;
}

/**
 * Configuration structure for the extension
 */
export interface ExtensionConfig {
    monitoredDirectory: string;
    excludePatterns: string[];
    supportedLanguages: string[];
    highlighting: HighlightingConfig;
    version: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ExtensionConfig = {
    monitoredDirectory: '',
    excludePatterns: [
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        'out/**',
        '*.min.js',
        '*.min.css',
        '.vscode/**',
        '.vs/**'
    ],
    supportedLanguages: [
        'typescript',
        'javascript',
        'python',
        'java',
        'c',
        'cpp',
        'csharp',
        'go',
        'rust',
        'php',
        'ruby',
        'swift',
        'kotlin',
        'scala'
    ],
    highlighting: {
        backgroundColor: 'rgba(255, 215, 0, 0.15)',
        borderColor: 'rgba(255, 215, 0, 0.3)',
        borderWidth: '1px',
        borderRadius: '2px',
        borderStyle: 'solid',
        overviewRulerColor: 'rgba(255, 215, 0, 0.5)',
        overviewRulerLane: 'Right',
        opacity: 1.0
    },
    version: '1.0.0'
};

/**
 * Get the path to the configuration file
 */
function getConfigFilePath(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
    }
    
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    return path.join(workspaceRoot, '.vscode', 'your-code-my-code', 'your-code-my-code.json');
}

// Cached configuration to avoid repeated file reads
let cachedConfig: ExtensionConfig | null = null;

/**
 * Load configuration from JSON file (with caching)
 */
export function loadConfig(): ExtensionConfig {
    // Return cached config if available
    if (cachedConfig) {
        return cachedConfig;
    }
    
    // Load from file and cache
    cachedConfig = loadConfigFromFile();
    return cachedConfig;
}

/**
 * Load configuration from JSON file without caching
 */
function loadConfigFromFile(): ExtensionConfig {
    const configPath = getConfigFilePath();
    if (!configPath || !fs.existsSync(configPath)) {
        console.log('Configuration file not found, using defaults');
        return { ...DEFAULT_CONFIG };
    }
    
    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const userConfig = JSON.parse(configData) as Partial<ExtensionConfig>;
        
        // Merge with defaults to ensure all required fields exist
        const config: ExtensionConfig = {
            ...DEFAULT_CONFIG,
            ...userConfig
        };
        
        console.log(`Loaded configuration from: ${configPath}`);
        return config;
    } catch (error) {
        console.error('Failed to load configuration, using defaults:', error);
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Refresh the cached configuration by reloading from file
 */
export function refreshConfigCache(): void {
    console.log('Refreshing configuration cache');
    cachedConfig = loadConfigFromFile();
}

/**
 * Save configuration to JSON file
 */
export function saveConfig(config: ExtensionConfig): boolean {
    const configPath = getConfigFilePath();
    if (!configPath) {
        console.error('No workspace available to save configuration');
        return false;
    }
    
    try {
        // Ensure .vscode directory exists
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Save configuration with nice formatting
        const configData = JSON.stringify(config, null, 2);
        fs.writeFileSync(configPath, configData);
        
        console.log(`Configuration saved to: ${configPath}`);
        return true;
    } catch (error) {
        console.error('Failed to save configuration:', error);
        return false;
    }
}

/**
 * Check if a document should be monitored based on user configuration
 */
export function shouldMonitorDocument(document: vscode.TextDocument): boolean {
    // Load configuration from JSON file
    const config = loadConfig();
    
    // Skip if language is not supported
    if (!config.supportedLanguages.includes(document.languageId)) {
        console.log(`Document language '${document.languageId}' not in supported languages: ${document.uri.fsPath}`);
        return false;
    }
    
    // Get workspace root
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        console.log('Document is not in a workspace, skipping monitoring');
        return false;
    }
    
    const workspaceRoot = workspaceFolder.uri.fsPath;
    const documentPath = document.uri.fsPath;
    
    // Get relative path from workspace root
    const relativePath = path.relative(workspaceRoot, documentPath);
    
    // Check exclude patterns
    if (isExcluded(relativePath, config.excludePatterns)) {
        console.log(`Document excluded by patterns: ${relativePath}`);
        return false;
    }
    
    // If no monitored directory is specified, monitor entire workspace
    if (!config.monitoredDirectory.trim()) {
        console.log(`Monitoring document (workspace-wide): ${relativePath}`);
        return true;
    }
    
    // Check if document is within the monitored directory
    const monitoredPath = path.resolve(workspaceRoot, config.monitoredDirectory);
    const isWithinMonitoredDirectory = documentPath.startsWith(monitoredPath);
    
    if (isWithinMonitoredDirectory) {
        console.log(`Document is within monitored directory: ${relativePath}`);
        return true;
    } else {
        console.log(`Document outside monitored directory (${config.monitoredDirectory}): ${relativePath}`);
        return false;
    }
}

/**
 * Check if a file path matches any of the exclude patterns
 */
function isExcluded(relativePath: string, excludePatterns: string[]): boolean {
    // Convert Windows path separators to forward slashes for pattern matching
    const normalizedPath = relativePath.replace(/\\/g, '/');
    
    return excludePatterns.some(pattern => {
        // Simple glob pattern matching
        if (pattern.endsWith('/**')) {
            // Directory pattern (e.g., "node_modules/**")
            const dirPattern = pattern.slice(0, -3);
            return normalizedPath.startsWith(dirPattern + '/') || normalizedPath === dirPattern;
        } else if (pattern.startsWith('*.')) {
            // File extension pattern (e.g., "*.min.js")
            const extension = pattern.slice(1);
            return normalizedPath.endsWith(extension);
        } else if (pattern.includes('*')) {
            // General glob pattern - simplified matching
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*');
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(normalizedPath);
        } else {
            // Exact match
            return normalizedPath === pattern || normalizedPath.startsWith(pattern + '/');
        }
    });
}

/**
 * Initialize configuration file with defaults if it doesn't exist
 */
export function initializeConfigFile(): boolean {
    const configPath = getConfigFilePath();
    if (!configPath) {
        return false;
    }
    
    if (fs.existsSync(configPath)) {
        console.log('Configuration file already exists');
        return true;
    }
    
    return saveConfig(DEFAULT_CONFIG);
}


/**
 * Open configuration file in editor
 */
export async function openConfigFile(): Promise<void> {
    const configPath = getConfigFilePath();
    if (!configPath) {
        vscode.window.showErrorMessage('No workspace folder is open');
        return;
    }
    
    // Create config file if it doesn't exist
    if (!fs.existsSync(configPath)) {
        const success = initializeConfigFile();
        if (!success) {
            vscode.window.showErrorMessage('Failed to create configuration file');
            return;
        }
    }
    
    try {
        const document = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(document);
    } catch (error) {
        console.error('Failed to open configuration file:', error);
        vscode.window.showErrorMessage('Failed to open configuration file');
    }
}