import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Annotation, Snapshot, ContentChange, Commit } from './dataStructures';

/**
 * Core annotation system for managing highlighting state
 */

/**
 * Load the current annotation snapshot for a document
 */
export function loadSnapshot(documentUri: vscode.Uri): Snapshot {
	try {
		const snapshotPath = getSnapshotPath(documentUri);
		
		if (!fs.existsSync(snapshotPath)) {
			return createEmptySnapshot();
		}
		
		const data = fs.readFileSync(snapshotPath, 'utf8');
		const snapshot: Snapshot = JSON.parse(data);
		
		console.log(`Loaded snapshot with ${snapshot.highlightedRanges.length} annotations for ${documentUri.fsPath}`);
		return snapshot;
		
	} catch (error) {
		console.error(`Failed to load snapshot for ${documentUri.fsPath}:`, error);
		return createEmptySnapshot();
	}
}

/**
 * Save the current annotation snapshot for a document
 */
export function saveSnapshot(documentUri: vscode.Uri, snapshot: Snapshot): void {
	try {
		const snapshotPath = getSnapshotPath(documentUri);
		const snapshotDir = path.dirname(snapshotPath);
		
		// Ensure directory exists
		if (!fs.existsSync(snapshotDir)) {
			fs.mkdirSync(snapshotDir, { recursive: true });
		}
		
		const data = JSON.stringify(snapshot, null, 2);
		fs.writeFileSync(snapshotPath, data);
		
		console.log(`Saved snapshot with ${snapshot.highlightedRanges.length} annotations for ${documentUri.fsPath}`);
		
	} catch (error) {
		console.error(`Failed to save snapshot for ${documentUri.fsPath}:`, error);
	}
}

/**
 * Clear all annotations for a document
 */
export function clearAllAnnotations(documentUri: vscode.Uri): void {
	const emptySnapshot: Snapshot = {
		highlightedRanges: [],
		lastUpdated: new Date().toISOString(),
		documentVersion: 0
	};
	
	saveSnapshot(documentUri, emptySnapshot);
	console.log(`Cleared all annotations for ${documentUri.fsPath}`);
}

/**
 * Convert VS Code content changes to our ContentChange format
 */
export function extractContentChanges(
	vsCodeChanges: readonly vscode.TextDocumentContentChangeEvent[]
): ContentChange[] {
	return vsCodeChanges.map(change => {
		const addedLines = change.text ? (change.text.match(/\n/g) || []).length : 0;
		const deletedLines = change.rangeLength > 0 ? 
			change.range.end.line - change.range.start.line : 0;
		
		return {
			startLine: change.range.start.line + 1, // Convert to 1-based - this is where both deletion starts AND addition starts
			endLine: change.range.end.line + 1,     // Convert to 1-based - this is where deletion ends (addition may end elsewhere)
			startCharacter: change.range.start.character,
			endCharacter: change.range.end.character,
			text: change.text,
			rangeLength: change.rangeLength,
			addedLines,
			deletedLines
		};
	});
}

/**
 * Apply a document change to the current annotation state
 */
export function applyChange(snapshot: Snapshot, commit: Commit): Snapshot {
	// Apply all changes to existing annotations (handles sorting internally)
	let updatedRanges = updateAndCleanAnnotationsForCommit(
		snapshot.highlightedRanges, 
		commit.contentChanges
	);
	
	// Add new annotations for significant changes
	if (commit.isSignificant) {
		const newAnnotations = addAnnotationsForSignificantChanges(commit.contentChanges);
		updatedRanges.push(...newAnnotations);
	}
	
	// Squash overlapping ranges
	updatedRanges = squashOverlappingAnnotations(updatedRanges);
	
	return {
		highlightedRanges: updatedRanges,
		lastUpdated: new Date().toISOString(),
		documentVersion: commit.documentVersion
	};
}

/**
 * Combined function: Apply line shifts AND remove affected highlighting simultaneously
 * This is more efficient than the old 3-pass approach
 * Processes multiple changes in reverse order (high to low line numbers) to avoid interference
 * Exported for testing purposes
 */
export function updateAndCleanAnnotationsForCommit(
	annotations: Annotation[],
	changes: ContentChange[]
): Annotation[] {
	let updatedRanges = [...annotations];
	
	// Process changes from end to beginning (higher line numbers first)
	// This ensures that line number shifts don't interfere with each other
	const sortedChanges = [...changes].sort((a, b) => b.startLine - a.startLine);
	
	for (const change of sortedChanges) {
		updatedRanges = updateAndCleanAnnotationsForContentChange(updatedRanges, change);
	}
	
	return updatedRanges;
}

/**
 * Combined function: Apply line shifts AND remove affected highlighting simultaneously for single change
 * This is more efficient than the old 3-pass approach
 * Exported for testing purposes
 */
export function updateAndCleanAnnotationsForContentChange(
	annotations: Annotation[],
	change: ContentChange
): Annotation[] {
	const updatedAnnotations: Annotation[] = [];
	
	for (const annotation of annotations) {
		const resultingAnnotations = processAnnotationForChangeAndClean(annotation, change);
		updatedAnnotations.push(...resultingAnnotations);
	}
	
	return updatedAnnotations;
}

/**
 * Process annotation for atomic replacement operation (delete range + insert at same position)
 * VS Code changes are atomic: delete content in range, then insert new content at range.start
 * Exported for testing purposes
 */
export function processAnnotationForChangeAndClean(annotation: Annotation, change: ContentChange): Annotation[] {
	const results: Annotation[] = [];
	
	// Define the operation ranges
	const deleteStart = change.startLine;
	const deleteEnd = change.endLine;  // Where deletion ends (from original range)
	const numDeletedLines = change.deletedLines;  // How many lines were removed
	const numInsertedLines = change.addedLines;       // How many lines were added
	const numNetLineChange = numInsertedLines - numDeletedLines;  // Net change in line count
	
	// Case 1: Annotation is completely before the replacement
	if (annotation.endLine < deleteStart) {
		results.push({ ...annotation }); // No change needed
		return results;
	}
	
	// Case 2: Annotation is completely after the replacement
	if (annotation.startLine > deleteEnd) {
		results.push({
			...annotation,
			startLine: annotation.startLine + numNetLineChange,
			endLine: annotation.endLine + numNetLineChange
		});
		return results;
	}
	
	// Case 3: Annotation overlaps with replacement range
	// Split into parts: before replacement, and after replacement
	
	// Part before replacement (if any)
	if (annotation.startLine < deleteStart) {
		results.push({
			...annotation,
			startLine: annotation.startLine,
			endLine: deleteStart - 1
		});
	}
	
	// Part after replacement (if any) - shifted by net line change
	if (annotation.endLine > deleteEnd) {
		// Lines that were after the replacement range get shifted by the net change
		const afterStart = (deleteEnd + 1) + numNetLineChange; // First line after replacement, shifted
		const numRemainingLines = annotation.endLine - deleteEnd; // How many lines remain after replacement
		const afterEnd = afterStart + numRemainingLines - 1;
		
		results.push({
			...annotation,
			startLine: afterStart,
			endLine: afterEnd
		});
	}
	
	// The part that overlapped with the replacement is removed (no highlighting)
	// This implements the "any modified line loses highlighting" rule
	
	return results.filter(ann => ann.startLine <= ann.endLine);
}

/**
 * Create new annotations for significant changes
 * Exported for testing purposes
 */
export function addAnnotationsForSignificantChanges(contentChanges: ContentChange[]): Annotation[] {
	const newAnnotations: Annotation[] = [];
	
	// Use original order for additions since they don't interfere with each other
	for (const change of contentChanges) {
		const newAnnotation: Annotation = {
			startLine: change.startLine,
			endLine: change.startLine + change.addedLines,
			timestamp: new Date().toISOString(),
			type: 'ai-generated'
		};
		newAnnotations.push(newAnnotation);
	}
	
	return newAnnotations;
}

/**
 * Merge overlapping or adjacent annotations into single ranges
 * Exported for testing purposes
 */
export function squashOverlappingAnnotations(annotations: Annotation[]): Annotation[] {
	if (annotations.length <= 1) {
		return annotations;
	}
	
	// Sort by start line
	const sorted = annotations.sort((a, b) => a.startLine - b.startLine);
	const squashed: Annotation[] = [sorted[0]];
	
	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		const last = squashed[squashed.length - 1];
		
		// Check if ranges overlap or are adjacent
		if (current.startLine <= last.endLine + 1) {
			// Merge ranges
			last.endLine = Math.max(last.endLine, current.endLine);
			// Keep the latest timestamp
			last.timestamp = current.timestamp > last.timestamp ? current.timestamp : last.timestamp;
		} else {
			// No overlap, add as separate range
			squashed.push(current);
		}
	}
	
	return squashed;
}

// Private helper functions

function createEmptySnapshot(): Snapshot {
	return {
		highlightedRanges: [],
		lastUpdated: new Date().toISOString(),
		documentVersion: 0
	};
}

function getSnapshotPath(documentUri: vscode.Uri): string {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
	if (!workspaceFolder) {
		throw new Error('No workspace folder found for document');
	}
	
	const vscodeFolderPath = path.join(workspaceFolder.uri.fsPath, '.vscode');
	const relativePath = path.relative(workspaceFolder.uri.fsPath, documentUri.fsPath);
	const safeFilename = relativePath.replace(/[^a-zA-Z0-9.-]/g, '_');
	
	return path.join(vscodeFolderPath, `${safeFilename}.annotations.json`);
}