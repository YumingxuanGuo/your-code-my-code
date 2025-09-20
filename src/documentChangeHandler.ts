import * as vscode from 'vscode';
import { Commit } from './dataStructures';
import { loadSnapshot, saveSnapshot, applyChange, extractContentChanges } from './annotationSystem';
import { applyHighlightingToEditor } from './highlightingHandler';
import { heuristicsSystem } from './heuristicsSystem';
import { shouldMonitorDocument } from './configuration';

/**
 * Handle document changes using the direct annotation approach
 * This updates annotation state directly without maintaining commit history
 */
export async function handleDocumentChange(
	event: vscode.TextDocumentChangeEvent
): Promise<void> {
	const document = event.document;
	const filePath = document.uri.fsPath;
	
	// Check if document should be monitored (includes language and directory checks)
	if (!shouldMonitorDocument(document)) {
		return;
	}

	console.log(`Document changed: ${filePath} (version: ${document.version}, reason: ${event.reason})`);
	
	// Load current annotation state
	const currentSnapshot = loadSnapshot(document.uri);
	
	// Convert VS Code changes to our format
	const contentChanges = extractContentChanges(event.contentChanges);
	
	// Undo/redo's are never significant
	// Otherwise, check if changes are significant using the heuristics system
	const isSignificant = event.reason ? false :
		await heuristicsSystem.isChangeSignificant(contentChanges);

	// Create commit context
	const commit: Commit = {
		documentVersion: document.version,
		isSignificant,
		contentChanges
	};
	
	// Apply the change to get new snapshot
	const newSnapshot = applyChange(currentSnapshot, commit);
	
	// Save updated state
	saveSnapshot(document.uri, newSnapshot);
	
    // Apply highlighting to the active editor if it matches this document
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.fsPath === document.uri.fsPath) {
        applyHighlightingToEditor(activeEditor, newSnapshot.highlightedRanges);
    }
	
	console.log(`Updated highlighting: ${newSnapshot.highlightedRanges.length} ranges for ${filePath}`);
}