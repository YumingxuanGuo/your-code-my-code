/**
 * Data structures for the direct annotation approach
 * 
 * This approach maintains only the current annotation state and updates it directly
 * with each document change, rather than maintaining a complex commit history.
 */

/**
 * Represents a highlighted range in the document
 */
export interface Annotation {
	startLine: number;
	endLine: number;
	timestamp: string;
	type: 'ai-generated';
}

/**
 * The current annotation snapshot for a document
 * This is the single source of truth for highlighting
 */
export interface Snapshot {
	highlightedRanges: Annotation[];
	lastUpdated: string;
	documentVersion: number; // For consistency checking
}

/**
 * Content change information extracted from VS Code events
 */
export interface ContentChange {
	startLine: number;
	endLine: number;
	startCharacter: number;
	endCharacter: number;
	text: string;
	rangeLength: number;
	addedLines: number;
	deletedLines: number;
}

/**
 * Document change event context
 */
export interface Commit {
	documentVersion: number;
	isSignificant: boolean;
	contentChanges: ContentChange[];
}