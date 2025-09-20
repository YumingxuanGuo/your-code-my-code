import * as vscode from 'vscode';
import { loadSnapshot } from './annotationSystem';
import { applyHighlightingToEditor } from './highlightingHandler';
import { shouldMonitorDocument } from './configuration';

/**
 * Handle when a document is opened - load existing annotations and apply highlighting
 */
export async function handleDocumentOpen(document: vscode.TextDocument): Promise<void> {
	const filePath = document.uri.fsPath;
	
	// Check if document should be monitored (includes language and directory checks)
	if (!shouldMonitorDocument(document)) {
		return;
	}
	
	console.log(`Document opened: ${filePath} (version: ${document.version})`);
	
	// Load existing annotation state
	const snapshot = loadSnapshot(document.uri);
	
	console.log(`Loaded ${snapshot.highlightedRanges.length} annotations for ${filePath}`);
	
	// Apply highlighting to the active editor if it matches this document
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor && activeEditor.document.uri.fsPath === document.uri.fsPath) {
		applyHighlightingToEditor(activeEditor, snapshot.highlightedRanges);
	}
}