import * as vscode from 'vscode';
import { Annotation } from './dataStructures';
import { loadConfig } from './configuration';

// Decoration type for highlighting AI-generated code
let aiCodeDecorationType: vscode.TextEditorDecorationType;

/**
 * Initialize the decoration type for AI code highlighting using configuration
 */
export function initializeHighlighting(): void {
	// Load highlighting configuration
	const config = loadConfig();
	const highlighting = config.highlighting;
	
	// Map overview ruler lane string to VS Code enum
	const overviewRulerLaneMap = {
		'Left': vscode.OverviewRulerLane.Left,
		'Center': vscode.OverviewRulerLane.Center,
		'Right': vscode.OverviewRulerLane.Right,
		'Full': vscode.OverviewRulerLane.Full
	};
	
	// Create decoration type with configurable styles
	aiCodeDecorationType = vscode.window.createTextEditorDecorationType({
		backgroundColor: highlighting.backgroundColor,
		border: `${highlighting.borderWidth} ${highlighting.borderStyle} ${highlighting.borderColor}`,
		borderRadius: highlighting.borderRadius,
		gutterIconPath: highlighting.gutterIcon, // Optional gutter icon
		overviewRulerColor: highlighting.overviewRulerColor,
		overviewRulerLane: overviewRulerLaneMap[highlighting.overviewRulerLane],
		opacity: highlighting.opacity.toString()
	});
	
	console.log('Initialized AI code highlighting with custom configuration');
}

/**
 * Apply highlighting annotations to an editor
 */
export function applyHighlightingToEditor(
	editor: vscode.TextEditor, 
	annotations: readonly Annotation[]
): void {
	if (!aiCodeDecorationType) {
		initializeHighlighting();
	}
	
	// Convert annotations to VS Code decorations
	const decorations: vscode.DecorationOptions[] = [];
	
	for (const annotation of annotations) {
		// Ensure line numbers are within document bounds
		const lineCount = editor.document.lineCount;
		const startLine = Math.max(0, Math.min(annotation.startLine - 1, lineCount - 1)); // Convert to 0-based
		const endLine = Math.max(0, Math.min(annotation.endLine - 1, lineCount - 1)); // Convert to 0-based
		
		// Create range for the annotation
		const range = new vscode.Range(
			startLine, 0,
			endLine, editor.document.lineAt(endLine).text.length
		);
		
		decorations.push({
			range
		});
	}
	
	// Apply decorations to the editor
	editor.setDecorations(aiCodeDecorationType, decorations);
	
	console.log(`Applied ${decorations.length} AI code decorations to ${editor.document.uri.fsPath}`);
}

/**
 * Clear all highlighting from an editor
 */
export function clearHighlighting(editor: vscode.TextEditor): void {
	if (aiCodeDecorationType) {
		editor.setDecorations(aiCodeDecorationType, []);
	}
}

/**
 * Reinitialize highlighting with updated configuration
 * Call this when configuration changes
 */
export function reinitializeHighlighting(): void {
	// Dispose old decoration type
	if (aiCodeDecorationType) {
		aiCodeDecorationType.dispose();
	}
	
	// Initialize with new configuration
	initializeHighlighting();
	
	console.log('Reinitialized AI code highlighting with updated configuration');
}

/**
 * Dispose of highlighting resources
 */
export function disposeHighlighting(): void {
	if (aiCodeDecorationType) {
		aiCodeDecorationType.dispose();
	}
}