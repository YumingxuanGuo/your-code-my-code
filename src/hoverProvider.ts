import * as vscode from 'vscode';
import { Annotation } from './dataStructures';
import { loadSnapshot, saveSnapshot } from './annotationSystem';
import { applyHighlightingToEditor } from './highlightingHandler';
import { loadConfig } from './configuration';

/**
 * Hover provider for AI-annotated code blocks
 * Shows options to un-annotate blocks when hovering
 */
export class AnnotationHoverProvider implements vscode.HoverProvider {
    
    constructor(private context: vscode.ExtensionContext) {}

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        
        // Load current annotations for this document
        const snapshot = loadSnapshot(document.uri);
        
        // Find annotation that contains the current position
        const annotation = this.findAnnotationAtPosition(snapshot.highlightedRanges, position);
        
        if (!annotation) {
            return undefined;
        }

        // Check if there's a text selection
        const editor = vscode.window.activeTextEditor;
        const selection = editor?.selection;
        const hasSelection = selection && !selection.isEmpty;
        
        // Calculate selected lines if there's a selection
        let selectedStartLine: number | undefined;
        let selectedEndLine: number | undefined;
        let isSelectionWithinAnnotation = false;
        
        if (hasSelection && selection) {
            selectedStartLine = selection.start.line + 1; // Convert to 1-based
            selectedEndLine = selection.end.line + 1; // Convert to 1-based
            
            // Check if selection is within the annotation
            isSelectionWithinAnnotation = 
                selectedStartLine >= annotation.startLine && 
                selectedEndLine <= annotation.endLine;
        }

        // Create hover content with un-annotate options
        const hoverMarkdown = new vscode.MarkdownString();
        hoverMarkdown.isTrusted = true; // Allow command links
        hoverMarkdown.supportHtml = true;
        
        hoverMarkdown.appendMarkdown(`🤖 **AI-Generated Code Block**\n\n`);
        hoverMarkdown.appendMarkdown(`**Lines:** ${annotation.startLine}-${annotation.endLine}\n\n`);
        hoverMarkdown.appendMarkdown(`**Timestamp:** ${new Date(annotation.timestamp).toLocaleString()}\n\n`);
        hoverMarkdown.appendMarkdown(`**Type:** ${annotation.type}\n\n`);
        
        // Add appropriate removal options
        if (hasSelection && isSelectionWithinAnnotation && selectedStartLine && selectedEndLine) {
            // Show both partial and full removal options
            hoverMarkdown.appendMarkdown(`**Remove Options:**\n\n`);
            
            // Partial removal option
            const partialRemoveCommand = `command:your-code-my-code.removePartialAnnotation?${encodeURIComponent(JSON.stringify({
                uri: document.uri.toString(),
                annotationStartLine: annotation.startLine,
                annotationEndLine: annotation.endLine,
                removeStartLine: selectedStartLine,
                removeEndLine: selectedEndLine,
                timestamp: annotation.timestamp
            }))}`;
            
            hoverMarkdown.appendMarkdown(`[🎯 Remove Selected Lines (${selectedStartLine}-${selectedEndLine})](${partialRemoveCommand})\n\n`);
            
            // Full removal option
            const fullRemoveCommand = `command:your-code-my-code.unannotateBlock?${encodeURIComponent(JSON.stringify({
                uri: document.uri.toString(),
                startLine: annotation.startLine,
                endLine: annotation.endLine,
                timestamp: annotation.timestamp
            }))}`;
            
            hoverMarkdown.appendMarkdown(`[🗑️ Remove Entire Block](${fullRemoveCommand})`);
        } else {
            // Show only full removal option
            const unannotateCommand = `command:your-code-my-code.unannotateBlock?${encodeURIComponent(JSON.stringify({
                uri: document.uri.toString(),
                startLine: annotation.startLine,
                endLine: annotation.endLine,
                timestamp: annotation.timestamp
            }))}`;
            
            hoverMarkdown.appendMarkdown(`[🗑️ Remove AI Annotation](${unannotateCommand})`);
            
            if (hasSelection && !isSelectionWithinAnnotation) {
                hoverMarkdown.appendMarkdown(`\n\n*💡 Select text within this annotation block to remove only specific lines*`);
            }
        }
        
        // Create range for the entire annotation
        const range = new vscode.Range(
            annotation.startLine - 1, 0,
            annotation.endLine - 1, document.lineAt(annotation.endLine - 1).text.length
        );
        
        return new vscode.Hover(hoverMarkdown, range);
    }

    /**
     * Find annotation that contains the given position
     */
    private findAnnotationAtPosition(annotations: Annotation[], position: vscode.Position): Annotation | undefined {
        const lineNumber = position.line + 1; // Convert to 1-based line numbers
        
        return annotations.find(annotation => 
            lineNumber >= annotation.startLine && lineNumber <= annotation.endLine
        );
    }
}

/**
 * Register the un-annotate command and hover provider
 */
export function registerHoverProvider(context: vscode.ExtensionContext): void {
    // Load configuration and register hover provider for supported languages
    const config = loadConfig();
    const hoverProvider = new AnnotationHoverProvider(context);

    config.supportedLanguages.forEach(language => {
        const disposable = vscode.languages.registerHoverProvider(
            { language, scheme: 'file' },
            hoverProvider
        );
        context.subscriptions.push(disposable);
    });

    // Register un-annotate command
    const unannotateCommand = vscode.commands.registerCommand(
        'your-code-my-code.unannotateBlock',
        async (args: any) => {
            try {
                // Handle both string and object arguments
                let params;
                if (typeof args === 'string') {
                    params = JSON.parse(decodeURIComponent(args));
                } else {
                    params = args;
                }
                
                await removeAnnotation(params.uri, params.startLine, params.endLine, params.timestamp);
                vscode.window.showInformationMessage('AI annotation removed successfully');
            } catch (error) {
                console.error('Failed to remove annotation:', error);
                vscode.window.showErrorMessage('Failed to remove AI annotation');
            }
        }
    );
    
    // Register partial annotation removal command
    const partialRemoveCommand = vscode.commands.registerCommand(
        'your-code-my-code.removePartialAnnotation',
        async (args: any) => {
            try {
                // Handle both string and object arguments
                let params;
                if (typeof args === 'string') {
                    params = JSON.parse(decodeURIComponent(args));
                } else {
                    params = args;
                }
                
                await removePartialAnnotation(
                    params.uri,
                    params.annotationStartLine,
                    params.annotationEndLine,
                    params.removeStartLine,
                    params.removeEndLine,
                    params.timestamp
                );
                vscode.window.showInformationMessage(`AI annotation removed from lines ${params.removeStartLine}-${params.removeEndLine}`);
            } catch (error) {
                console.error('Failed to remove partial annotation:', error);
                vscode.window.showErrorMessage('Failed to remove partial AI annotation');
            }
        }
    );
    
    context.subscriptions.push(unannotateCommand);
    context.subscriptions.push(partialRemoveCommand);
    
    console.log('Hover provider and un-annotate command registered');
}

/**
 * Remove a specific annotation from the document
 */
async function removeAnnotation(
    uriString: string, 
    startLine: number, 
    endLine: number, 
    timestamp: string
): Promise<void> {
    const uri = vscode.Uri.parse(uriString);
    
    // Load current snapshot
    const snapshot = loadSnapshot(uri);
    
    // Find and remove the specific annotation
    const annotationIndex = snapshot.highlightedRanges.findIndex(annotation =>
        annotation.startLine === startLine &&
        annotation.endLine === endLine &&
        annotation.timestamp === timestamp
    );
    
    if (annotationIndex === -1) {
        throw new Error('Annotation not found');
    }
    
    // Remove the annotation
    snapshot.highlightedRanges.splice(annotationIndex, 1);
    
    // Save updated snapshot
    saveSnapshot(uri, snapshot);
    
    // Refresh highlighting in active editor if it's the same document
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.toString() === uriString) {
        applyHighlightingToEditor(activeEditor, snapshot.highlightedRanges);
    }
    
    console.log(`Removed annotation at lines ${startLine}-${endLine} from ${uri.fsPath}`);
}

/**
 * Remove part of an annotation, potentially splitting it into multiple annotations
 */
async function removePartialAnnotation(
    uriString: string,
    annotationStartLine: number,
    annotationEndLine: number,
    removeStartLine: number,
    removeEndLine: number,
    timestamp: string
): Promise<void> {
    const uri = vscode.Uri.parse(uriString);
    
    // Load current snapshot
    const snapshot = loadSnapshot(uri);
    
    // Find the specific annotation
    const annotationIndex = snapshot.highlightedRanges.findIndex(annotation =>
        annotation.startLine === annotationStartLine &&
        annotation.endLine === annotationEndLine &&
        annotation.timestamp === timestamp
    );
    
    if (annotationIndex === -1) {
        throw new Error('Annotation not found');
    }
    
    const originalAnnotation = snapshot.highlightedRanges[annotationIndex];
    
    // Remove the original annotation
    snapshot.highlightedRanges.splice(annotationIndex, 1);
    
    // Create new annotations for the remaining parts
    const newAnnotations: Annotation[] = [];
    
    // Add annotation for lines before the removed section
    if (removeStartLine > originalAnnotation.startLine) {
        newAnnotations.push({
            startLine: originalAnnotation.startLine,
            endLine: removeStartLine - 1,
            timestamp: new Date().toISOString(), // New timestamp for the split annotation
            type: originalAnnotation.type
        });
    }
    
    // Add annotation for lines after the removed section
    if (removeEndLine < originalAnnotation.endLine) {
        newAnnotations.push({
            startLine: removeEndLine + 1,
            endLine: originalAnnotation.endLine,
            timestamp: new Date().toISOString(), // New timestamp for the split annotation
            type: originalAnnotation.type
        });
    }
    
    // Add the new annotations to the snapshot
    snapshot.highlightedRanges.push(...newAnnotations);
    
    // Save updated snapshot
    saveSnapshot(uri, snapshot);
    
    // Refresh highlighting in active editor if it's the same document
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.toString() === uriString) {
        applyHighlightingToEditor(activeEditor, snapshot.highlightedRanges);
    }
    
    console.log(`Partially removed annotation: removed lines ${removeStartLine}-${removeEndLine} from ${uri.fsPath}`);
}