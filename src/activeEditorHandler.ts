import * as vscode from 'vscode';
import { loadSnapshot } from './annotationSystem';
import { applyHighlightingToEditor, clearHighlighting } from './highlightingHandler';
import { shouldMonitorDocument } from './configuration';

/**
 * Handle when the active editor changes - apply highlighting to the new editor
 */
export function handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
	if (!editor) {
		console.log('No active editor');
		return;
	}

	const document = editor.document;
	const filePath = document.uri.fsPath;
	
	// Check if document should be monitored (includes language and directory checks)
	if (!shouldMonitorDocument(document)) {
		clearHighlighting(editor);
		return;
	}
	
	console.log(`Active editor changed to: ${filePath}`);
	
	// Load current annotation state
	const snapshot = loadSnapshot(document.uri);
	
	// Apply highlighting to the new active editor
	applyHighlightingToEditor(editor, snapshot.highlightedRanges);
	
	console.log(`Applied ${snapshot.highlightedRanges.length} annotations to active editor: ${filePath}`);
}