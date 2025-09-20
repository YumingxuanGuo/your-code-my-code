import * as vscode from 'vscode';
import { ContentChange } from './dataStructures';

/**
 * System for detecting false positives in AI code detection
 * Handles paste operations, IDE commands, and other heuristics
 */
export class HeuristicsSystem {
    private recentActions: Set<string> = new Set();
    private actionTimeout: NodeJS.Timeout | undefined;
    private disposables: vscode.Disposable[] = [];
    
    // Git operation suspension flag
    private gitOperationSuspended: boolean = false;
    
    // Action tracking timeouts (in ms)
    private static readonly ACTION_TIMEOUT = 500;  // Short for immediate user actions

    constructor() {
        // Command registration is now handled in extension activation
        // this.setupCommandInterception();
    }

    /**
     * Set up command interception for user actions and tool operations
     * Should be called during extension activation
     * @param context Extension context to register disposables
     */
    public setupCommandInterception(context?: vscode.ExtensionContext): void {
        // Set up terminal monitoring for git commands
        this.setupGitDetection(context);
        try {
            // Commands defined in package.json with .intercepted proxy commands
            // These must match the commands in package.json contributes.commands
            const interceptedCommands = [
                'editor.action.clipboardPasteAction',
                'editor.action.clipboardCutAction',
                'editor.action.commentLine',
                'editor.action.addCommentLine',
                'editor.action.removeCommentLine',
                'editor.action.indentLines',
                'editor.action.outdentLines',
                'editor.action.rename',
                'editor.action.formatDocument',
                'editor.action.formatSelection',
                'editor.action.quickFix',
                'editor.action.inPlaceReplace.down',
                'editor.action.inPlaceReplace.up',
                'editor.action.startFindReplaceAction',
                'acceptSelectedSuggestion',
                'acceptAlternativeSelectedSuggestion',
            ];

            // Register proxy commands for all intercepted commands
            interceptedCommands.forEach((command: string) => {
                try {
                    const disposable = vscode.commands.registerCommand(`${command}.intercepted`, (...args) => {
                        console.log(`Intercepted command ${command}`);
                        this.markRecentUserAction(command);
                        // Execute the original command
                        return vscode.commands.executeCommand(command, ...args);
                    });
                    this.disposables.push(disposable);
                    
                    if (context) {
                        context.subscriptions.push(disposable);
                    }
                } catch (error) {
                    console.warn(`Command ${command}.intercepted already registered`);
                }
            });

            console.log(`Proxy commands set up for ${interceptedCommands.length} commands from package.json`);
        } catch (error) {
            console.warn('Some commands already registered:', error);
        }
    }

    /**
     * Mark that a user action recently occurred
     */
    private markRecentUserAction(action: string): void {
        this.recentActions.add(action);
        
        // Clear existing timeout
        if (this.actionTimeout) {
            clearTimeout(this.actionTimeout);
        }
        
        // Set timeout to reset actions
        this.actionTimeout = setTimeout(() => {
            this.recentActions.clear();
        }, HeuristicsSystem.ACTION_TIMEOUT);
    }

    /**
     * Main public method: Check if content changes are significant (AI-generated)
     * This replaces the old isChangeSignificant function and integrates all heuristics
     */
    public async isChangeSignificant(contentChanges: ContentChange[]): Promise<boolean> {
        // Quick exit for empty changes
        if (!contentChanges || contentChanges.length === 0) {
            return false;
        }

        // Check each change for significance, applying all heuristics
        for (const change of contentChanges) {
            if (await this.isIndividualChangeSignificant(change)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if a single change is significant after applying all heuristic filters
     */
    private async isIndividualChangeSignificant(change: ContentChange): Promise<boolean> {
        // If it's significant by basic check, then apply heuristic filters
        if (this.shouldFilterChange(change.text, change.addedLines)) {
            return false;
        }
        

        // First, apply core significance detection (handles deletions properly)
        if (!this.passesBasicSignificanceCheck(change.text, change.addedLines)) {
            return false;
        }

        // // For ambiguous cases that pass basic checks, potentially ask user
        // if (this.isAmbiguousCase(change.text, change.addedLines)) {
        //     return await this.showUserConfirmation(change.text);
        // }

        return true;
    }

    /**
     * Core significance logic (extracted from original utils.ts)
     */
    private passesBasicSignificanceCheck(text: string, addedLines: number): boolean {
        // Skip pure deletion
        if (!text) {
            return false;
        }
        
        // Skip single newlines or whitespace-only changes
        if (text.trim().length === 0) {
            return false;
        }
        
        // Skip single character changes (likely typing)
        if (text.trim().length === 1) {
            return false;
        }

        // // Additional heuristics based on content patterns
        // return this.isLikelyNonAIChange(text, addedLines);

        return true;
    }

    /**
     * Check if this is an ambiguous case that might need user confirmation
     */
    private isAmbiguousCase(text: string, addedLines: number): boolean {
        // Cases where we're not 100% sure - large additions that could be paste vs AI
        return addedLines > 5 && text.length > 100 && !this.hasStrongAIIndicators(text);
    }

    /**
     * Check for strong indicators that this is AI-generated
     */
    private hasStrongAIIndicators(text: string): boolean {
        // Very structured code, complete functions, etc.
        const strongPatterns = [
            /function\s+\w+\s*\([^)]*\)\s*{[\s\S]*}/,  // Complete functions
            /class\s+\w+\s*{[\s\S]*}/,                 // Complete classes
            /\/\*\*[\s\S]*?\*\//,                      // JSDoc comments
            /(import|export)[\s\S]*from[\s\S]*['"`]/   // Import statements
        ];
        
        return strongPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Check if a change should be filtered out based on recent actions and content analysis
     */
    public shouldFilterChange(changeText: string, addedLines: number): boolean {
        // Filter out if git operations are suspended
        if (this.gitOperationSuspended) {
            console.log('Filtering change due to git operation suspension');
            return true;
        }
        
        // Filter out if recent user actions (manual operations)
        if (this.recentActions.size > 0) {
            // Log which user actions were detected (for debugging)
            console.log('Filtering change due to recent actions:', Array.from(this.recentActions));
            return true;
        }
        
        return false;
    }


    /**
     * Show user confirmation dialog for ambiguous cases
     */
    public async showUserConfirmation(changeText: string): Promise<boolean> {
        const preview = changeText.length > 200 
            ? changeText.substring(0, 200) + '...'
            : changeText;

        const result = await vscode.window.showInformationMessage(
            `An external tool modified this file. Was this generated by AI?\n\nPreview:\n${preview}`,
            { modal: true },
            'Yes, AI generated',
            'No, manual change'
        );

        return result === 'Yes, AI generated';
    }

    /**
     * Set up git command detection through terminal shell execution monitoring
     */
    private setupGitDetection(context?: vscode.ExtensionContext): void {
        const shellExecutionListener = vscode.window.onDidStartTerminalShellExecution(event => {
            const commandLine = event.execution.commandLine.value;
            
            // Detect git commands that modify files
            const gitCommands = [
                'git checkout',
                'git merge',
                'git pull',
                'git rebase', 
                'git reset',
                'git stash pop',
                'git stash apply',
                'git cherry-pick',
                'git revert'
            ];
            
            if (gitCommands.some(cmd => commandLine.includes(cmd))) {
                console.log('Git command detected:', commandLine);
                this.suspendAIDetection();
            }
        });
        
        this.disposables.push(shellExecutionListener);
        if (context) {
            context.subscriptions.push(shellExecutionListener);
        }
    }

    /**
     * Suspend AI detection due to git operations
     */
    private async suspendAIDetection(): Promise<void> {
        if (this.gitOperationSuspended) {
            return; // Already suspended
        }
        
        this.gitOperationSuspended = true;
        console.log('AI code highlighting suspended due to git operation');
        
        // Show notification to user
        const result = await vscode.window.showInformationMessage(
            'Git operation detected, suspending AI code highlighting',
            'Resume Highlighting'
        );
        
        if (result === 'Resume Highlighting') {
            this.resumeAIDetection();
        }
    }

    /**
     * Resume AI detection
     */
    public resumeAIDetection(): void {
        this.gitOperationSuspended = false;
        console.log('AI code highlighting resumed');
        vscode.window.showInformationMessage('AI code highlighting resumed');
    }

    /**
     * Check if AI detection is currently suspended
     */
    public isAIDetectionSuspended(): boolean {
        return this.gitOperationSuspended;
    }

    /**
     * Clean up timeouts and disposables when disposing
     */
    public dispose(): void {
        if (this.actionTimeout) {
            clearTimeout(this.actionTimeout);
        }
        
        // Clear action sets
        this.recentActions.clear();
        
        // Dispose all registered commands
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}

// Global instance
export const heuristicsSystem = new HeuristicsSystem();