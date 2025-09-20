import * as assert from 'assert';
import { 
    updateAndCleanAnnotationsForContentChange,
    updateAndCleanAnnotationsForCommit,
    processAnnotationForChangeAndClean,
    squashOverlappingAnnotations,
    addAnnotationsForSignificantChanges,
    applyChange
} from '../annotationSystem';
import { Annotation, ContentChange, Snapshot, Commit } from '../dataStructures';

suite('Annotation System Tests', () => {
    
    suite('processAnnotationForChangeAndClean', () => {
        
        test('should not modify annotation that is completely before replacement', () => {
            // Document setup (line-by-line):
            // Line 1: [AI-generated content] (highlighted)
            // Line 2: [AI-generated content] (highlighted) 
            // Line 3: [AI-generated content] (highlighted)
            // Line 4: [user content]
            // Line 5: [user content] ← will be replaced
            // Line 6: [user content] ← will be replaced
            // Line 7: [user content]
            
            const annotation: Annotation = {
                startLine: 1,        // Lines 1-3 are highlighted as AI-generated
                endLine: 3,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 5,        // Replace lines 5-6 with new content
                endLine: 6,
                startCharacter: 0,
                endCharacter: 10,
                text: 'new content\nanother line',
                rangeLength: 10,
                addedLines: 1,       // Net +1 line after replacement
                deletedLines: 1
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: Lines 1-3 remain highlighted (no change)
            // Since annotation is completely before the change area
            assert.strictEqual(result.length, 1);
            assert.deepStrictEqual(result[0], annotation);
        });

        test('should shift annotation that is completely after replacement', () => {
            // Document setup (line-by-line):
            // Line 1-4: [user content]
            // Line 5: [user content] ← will be replaced
            // Line 6: [user content] ← will be replaced  
            // Line 7-9: [user content]
            // Line 10: [AI-generated content] (highlighted) ← will shift to line 11
            // Line 11: [AI-generated content] (highlighted) ← will shift to line 12
            // Line 12: [AI-generated content] (highlighted) ← will shift to line 13
            
            const annotation: Annotation = {
                startLine: 10,       // Lines 10-12 are highlighted as AI-generated
                endLine: 12,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 5,        // Replace lines 5-6 with 3 lines of content
                endLine: 6,
                startCharacter: 0,
                endCharacter: 10,
                text: 'new content\nanother line\nthird line',  // 3 lines
                rangeLength: 10,
                addedLines: 2,       // Net: 3 new lines - 1 newline = 2 added
                deletedLines: 1      // Net: 2 added - 1 deleted = +1 line shift
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: Lines 10-12 shift to lines 11-13 (net +1)
            // Since annotation is completely after the change area
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 11); // 10 + 1
            assert.strictEqual(result[0].endLine, 13);   // 12 + 1
        });

        test('should split annotation that overlaps with replacement - before and after parts', () => {
            // Document setup (line-by-line):
            // Line 1-2: [user content]
            // Line 3: [AI-generated content] (highlighted) ← preserved as "before" part
            // Line 4: [AI-generated content] (highlighted) ← preserved as "before" part
            // Line 5: [AI-generated content] (highlighted) ← will be replaced (lost)
            // Line 6: [AI-generated content] (highlighted) ← will be replaced (lost)
            // Line 7: [AI-generated content] (highlighted) ← becomes line 6 after replacement
            // Line 8: [AI-generated content] (highlighted) ← becomes line 7 after replacement
            // Line 9: [user content]
            
            const annotation: Annotation = {
                startLine: 3,        // Lines 3-8 are highlighted as AI-generated
                endLine: 8,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 5,        // Replace lines 5-6 with single line
                endLine: 6,
                startCharacter: 0,
                endCharacter: 10,
                text: 'replacement line',  // Single line replacement
                rangeLength: 10,
                addedLines: 0,       // No new lines added (single line)
                deletedLines: 1      // Net: 0 added - 1 deleted = -1 line shift
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: Split into two separate highlighted regions
            // Before: lines 3-4 (unchanged), After: lines 6-7 (shifted from original 7-8)
            assert.strictEqual(result.length, 2);
            
            // Before part: lines 3-4 remain highlighted
            assert.strictEqual(result[0].startLine, 3);
            assert.strictEqual(result[0].endLine, 4);
            
            // After part: original lines 7-8 become lines 6-7 (net -1 shift)
            assert.strictEqual(result[1].startLine, 6);
            assert.strictEqual(result[1].endLine, 7);
        });

        test('should return only before part when annotation ends at replacement boundary', () => {
            // Setup: Annotation on lines 3-5, replacement starts at line 5
            const annotation: Annotation = {
                startLine: 3,
                endLine: 5,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 5,
                endLine: 6,
                startCharacter: 0,
                endCharacter: 10,
                text: 'replacement',
                rangeLength: 10,
                addedLines: 0,
                deletedLines: 1
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Should return only before part (lines 3-4)
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 3);
            assert.strictEqual(result[0].endLine, 4);
        });

        test('should return only after part when annotation starts at replacement boundary', () => {
            // Setup: Annotation on lines 5-8, replacement on lines 3-5
            const annotation: Annotation = {
                startLine: 5,
                endLine: 8,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 3,
                endLine: 5,
                startCharacter: 0,
                endCharacter: 10,
                text: 'replacement\nnew line',
                rangeLength: 10,
                addedLines: 1, // 1 line added
                deletedLines: 2 // 2 lines deleted
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Should return only after part, shifted by net change (-1)
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 5); // Originally lines 6-8, shifted by -1, become 5-7
            assert.strictEqual(result[0].endLine, 7);
        });

        test('should return empty array when annotation is completely within replacement', () => {
            // Setup: Annotation on lines 5-6, replacement on lines 4-7
            const annotation: Annotation = {
                startLine: 5,
                endLine: 6,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 4,
                endLine: 7,
                startCharacter: 0,
                endCharacter: 10,
                text: 'replacement',
                rangeLength: 10,
                addedLines: 0,
                deletedLines: 3
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Should return empty array (annotation completely removed)
            assert.strictEqual(result.length, 0);
        });

        test('should handle insertion (no deletions) correctly', () => {
            // Document setup (line-by-line):
            // Line 1-4: [user content]
            // Line 5: [AI-generated content] (highlighted) ← preserved as "before" part
            // Line 6: [insertion point] ← 2 new lines will be inserted here
            // Line 7: [AI-generated content] (highlighted) ← becomes line 9 after insertion
            // Line 8: [AI-generated content] (highlighted) ← becomes line 10 after insertion
            // Line 9: [user content]
            
            const annotation: Annotation = {
                startLine: 5,        // Lines 5-8 are highlighted as AI-generated
                endLine: 8,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 6,        // Insert 2 lines at position 6 (pure insertion)
                endLine: 6,          // Same line (no range being replaced)
                startCharacter: 0,
                endCharacter: 0,
                text: 'inserted line\nanother inserted line',  // 2 new lines
                rangeLength: 0,      // No existing content deleted
                addedLines: 2,       // 2 lines added
                deletedLines: 0      // Net: +2 line shift
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: Split into before (line 5) and after (lines 9-10)
            // Line 5 stays, lines 7-8 shift by +2 to become 9-10
            assert.strictEqual(result.length, 2);
            
            // Before part: line 5 remains highlighted
            assert.strictEqual(result[0].startLine, 5);
            assert.strictEqual(result[0].endLine, 5);
            
            // After part: original lines 7-8 become lines 9-10 (net +2 shift)
            assert.strictEqual(result[1].startLine, 9);
            assert.strictEqual(result[1].endLine, 10);
        });

        test('should handle zero-width insertion (pure insertion at exact position)', () => {
            // Document setup (line-by-line):
            // Line 1-3: [user content]
            // Line 4: [AI-generated content] (highlighted) ← insertion will happen at start of this line
            // Line 5-6: [user content]
            
            const annotation: Annotation = {
                startLine: 4,
                endLine: 4,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 4,        // Insert at start of line 4
                endLine: 4,          // Zero-width change
                startCharacter: 0,
                endCharacter: 0,     // No deletion
                text: 'inserted line\n',  // Pure insertion
                rangeLength: 0,
                addedLines: 1,
                deletedLines: 0
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: annotation is removed because insertion touches the same line
            // The algorithm treats any line that is touched by a change as "modified" and removes highlighting
            assert.strictEqual(result.length, 0);
        });

        test('should handle change at document boundary (line 1)', () => {
            // Document setup (line-by-line):
            // Line 1: [AI-generated content] (highlighted) ← replacement at document start
            // Line 2-3: [user content]
            
            const annotation: Annotation = {
                startLine: 1,
                endLine: 1,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 1,        // Replace line 1
                endLine: 1,
                startCharacter: 0,
                endCharacter: 50,
                text: 'new line 1\nnew line 2\n',
                rangeLength: 50,
                addedLines: 2,
                deletedLines: 1
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: annotation is completely removed (overlaps with replacement)
            assert.strictEqual(result.length, 0);
        });

        test('should handle annotation creating multiple fragments', () => {
            // Document setup (line-by-line):
            // Line 1: [user content]
            // Line 2: [AI-generated content] (highlighted) ← will be preserved
            // Line 3: [AI-generated content] (highlighted) ← will be replaced
            // Line 4: [AI-generated content] (highlighted) ← will be replaced  
            // Line 5: [AI-generated content] (highlighted) ← will be preserved
            // Line 6: [user content]
            
            const annotation: Annotation = {
                startLine: 2,
                endLine: 5,        // Spans 4 lines
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 3,        // Replace lines 3-4
                endLine: 4,
                startCharacter: 0,
                endCharacter: 0,
                text: 'single replacement line\n',
                rangeLength: 100,
                addedLines: 1,
                deletedLines: 2     // Net change: -1 line
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: Split into before (line 2) and after (line 4, shifted from original line 5)
            assert.strictEqual(result.length, 2);
            
            // Before part: line 2 preserved
            assert.strictEqual(result[0].startLine, 2);
            assert.strictEqual(result[0].endLine, 2);
            
            // After part: original line 5 becomes line 4 (shift by -1)
            assert.strictEqual(result[1].startLine, 4);
            assert.strictEqual(result[1].endLine, 4);
        });

        test('should handle very large line shifts (stress test)', () => {
            // Document setup with annotation far from change
            const annotation: Annotation = {
                startLine: 2000,
                endLine: 2005,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 100,      // Large insertion early in document
                endLine: 100,
                startCharacter: 0,
                endCharacter: 0,
                text: Array(1000).fill('inserted line').join('\n') + '\n',  // 1000 line insertion
                rangeLength: 0,
                addedLines: 1000,
                deletedLines: 0
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: annotation shifts by +1000 lines
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 3000);  // 2000 + 1000
            assert.strictEqual(result[0].endLine, 3005);    // 2005 + 1000
        });

        test('should handle character-level precision within line boundaries', () => {
            // Document setup - testing that character positions don't affect line-level logic
            const annotation: Annotation = {
                startLine: 5,
                endLine: 7,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 6,        // Replace middle of annotation at character level
                endLine: 6,
                startCharacter: 10,  // Mid-line replacement
                endCharacter: 30,
                text: 'character replacement', // Single line, no line changes
                rangeLength: 20,
                addedLines: 0,
                deletedLines: 0
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: Split into before (line 5) and after (line 7)
            // Line 6 is removed because it was modified
            assert.strictEqual(result.length, 2);
            
            // Before part: line 5
            assert.strictEqual(result[0].startLine, 5);
            assert.strictEqual(result[0].endLine, 5);
            
            // After part: line 7 (no shift since net change is 0)
            assert.strictEqual(result[1].startLine, 7);
            assert.strictEqual(result[1].endLine, 7);
        });

        test('should handle annotation spanning entire replacement range exactly', () => {
            // Document setup where annotation exactly matches replacement range
            const annotation: Annotation = {
                startLine: 10,
                endLine: 12,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            };
            
            const change: ContentChange = {
                startLine: 10,       // Exactly matches annotation range
                endLine: 12,
                startCharacter: 0,
                endCharacter: 0,
                text: 'complete replacement\n',
                rangeLength: 150,
                addedLines: 1,
                deletedLines: 3      // Net: -2 lines
            };
            
            const result = processAnnotationForChangeAndClean(annotation, change);
            
            // Expected result: annotation completely removed (entirely within replacement)
            assert.strictEqual(result.length, 0);
        });
    });

    suite('updateAndCleanAnnotationsForContentChange', () => {
        
        test('should process multiple annotations with single change', () => {
            // Document setup (line-by-line):
            // Line 1: [AI-generated content] (highlighted - annotation 1) ← unaffected
            // Line 2: [AI-generated content] (highlighted - annotation 1) ← unaffected
            // Line 3-4: [user content]
            // Line 5: [AI-generated content] (highlighted - annotation 2) ← preserved as "before" part
            // Line 6: [insertion point] ← 1 new line will be inserted here
            // Line 7: [AI-generated content] (highlighted - annotation 2) ← becomes line 8 after insertion
            // Line 8-9: [user content]
            // Line 10: [AI-generated content] (highlighted - annotation 3) ← becomes line 11
            // Line 11: [AI-generated content] (highlighted - annotation 3) ← becomes line 12
            // Line 12: [AI-generated content] (highlighted - annotation 3) ← becomes line 13
            
            const annotations: Annotation[] = [
                {
                    startLine: 1,        // Annotation 1: lines 1-2
                    endLine: 2,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 5,        // Annotation 2: lines 5-7 
                    endLine: 7,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 10,       // Annotation 3: lines 10-12
                    endLine: 12,
                    timestamp: '2024-01-01T00:02:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const change: ContentChange = {
                startLine: 6,        // Insert 1 line at position 6
                endLine: 6,
                startCharacter: 0,
                endCharacter: 0,
                text: 'inserted line',  // Single line insertion
                rangeLength: 0,
                addedLines: 1,       // Net: +1 line shift
                deletedLines: 0
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: 4 annotation parts total
            // Annotation 1: unchanged, Annotation 2: split, Annotation 3: shifted
            assert.strictEqual(result.length, 4);
            
            // First annotation: lines 1-2 unaffected (before change)
            assert.strictEqual(result[0].startLine, 1);
            assert.strictEqual(result[0].endLine, 2);
            
            // Second annotation split: before part (line 5) + after part (line 8)
            assert.strictEqual(result[1].startLine, 5);
            assert.strictEqual(result[1].endLine, 5);
            assert.strictEqual(result[2].startLine, 8); // Originally line 7, shifted by +1
            assert.strictEqual(result[2].endLine, 8);   // Single line after shift
            
            // Third annotation: lines 10-12 become 11-13 (shifted by +1)
            assert.strictEqual(result[3].startLine, 11); // 10 + 1
            assert.strictEqual(result[3].endLine, 13);   // 12 + 1
        });

        test('should handle annotations overlapping by exactly 1 line', () => {
            // Document setup (line-by-line):
            // Line 1-4: [user content]
            // Line 5: [AI-generated content] (highlighted) ← will be replaced (lost)
            // Line 6-7: [user content]
            
            const annotations: Annotation[] = [
                {
                    startLine: 5,        // Single line annotation that will be replaced
                    endLine: 5,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const change: ContentChange = {
                startLine: 5,        // Replace exactly the annotated line
                endLine: 5,
                startCharacter: 0,
                endCharacter: 10,
                text: 'replacement content',
                rangeLength: 10,
                addedLines: 0,       // Same number of lines
                deletedLines: 0
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: annotation completely removed (overlaps exactly)
            assert.strictEqual(result.length, 0);
        });

        test('should handle annotations adjacent to change (0 line gap)', () => {
            // Document setup (line-by-line):
            // Line 1-2: [user content]
            // Line 3: [AI-generated content] (highlighted) ← directly adjacent to change
            // Line 4: [user content] ← will be replaced
            // Line 5: [AI-generated content] (highlighted) ← directly adjacent to change
            // Line 6: [user content]
            
            const annotations: Annotation[] = [
                {
                    startLine: 3,        // Annotation directly before change
                    endLine: 3,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 5,        // Annotation directly after change
                    endLine: 5,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const change: ContentChange = {
                startLine: 4,        // Replace line between the two annotations
                endLine: 4,
                startCharacter: 0,
                endCharacter: 10,
                text: 'new line 1\nnew line 2',  // Replace 1 line with 2 lines
                rangeLength: 10,
                addedLines: 1,       // Net +1 line
                deletedLines: 0
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: first annotation unchanged, second annotation shifted
            assert.strictEqual(result.length, 2);
            
            // First annotation: line 3 unchanged (before change)
            assert.strictEqual(result[0].startLine, 3);
            assert.strictEqual(result[0].endLine, 3);
            
            // Second annotation: line 5 becomes line 6 (shifted by +1)
            assert.strictEqual(result[1].startLine, 6);
            assert.strictEqual(result[1].endLine, 6);
        });

        test('should handle multiple overlapping annotations with single change', () => {
            // Document setup (line-by-line):
            // Line 1-2: [user content]
            // Line 3: [AI-generated content] (highlighted - annotation 1) ← preserved
            // Line 4: [AI-generated content] (highlighted - both annotations) ← will be replaced (lost from both)
            // Line 5: [AI-generated content] (highlighted - annotation 2) ← will be replaced (lost)
            // Line 6: [AI-generated content] (highlighted - annotation 2) ← becomes line 5 after replacement
            // Line 7: [user content]
            
            const annotations: Annotation[] = [
                {
                    startLine: 3,        // Annotation 1: lines 3-4 (overlaps with replacement)
                    endLine: 4,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 4,        // Annotation 2: lines 4-6 (overlaps with replacement)
                    endLine: 6,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const change: ContentChange = {
                startLine: 4,        // Replace lines 4-5 with single line
                endLine: 5,
                startCharacter: 0,
                endCharacter: 20,
                text: 'replacement line',
                rangeLength: 20,
                addedLines: 0,       // 1 line replaces 2 lines
                deletedLines: 1      // Net -1 line
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: 2 parts (before parts from both annotations)
            assert.strictEqual(result.length, 2);
            
            // First annotation: only line 3 remains (before part)
            assert.strictEqual(result[0].startLine, 3);
            assert.strictEqual(result[0].endLine, 3);
            
            // Second annotation: only line 6 remains, becomes line 5 (after part, shifted by -1)
            assert.strictEqual(result[1].startLine, 5); // Originally line 6, shifted by -1
            assert.strictEqual(result[1].endLine, 5);
        });

        test('should handle zero-length annotations (invalid but defensive)', () => {
            // Edge case: annotation where startLine > endLine (invalid state)
            const annotations: Annotation[] = [
                {
                    startLine: 5,        // Invalid: start after end
                    endLine: 3,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const change: ContentChange = {
                startLine: 4,
                endLine: 4,
                startCharacter: 0,
                endCharacter: 5,
                text: 'new content',
                rangeLength: 5,
                addedLines: 0,
                deletedLines: 0
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: algorithm processes invalid annotation normally
            // The algorithm doesn't specifically validate annotation ranges before processing
            // It processes the invalid annotation (5-3) against the change, resulting in 1 part
            assert.strictEqual(result.length, 1);
        });

        test('should handle empty annotations array gracefully', () => {
            const annotations: Annotation[] = [];
            
            const change: ContentChange = {
                startLine: 5,
                endLine: 5,
                startCharacter: 0,
                endCharacter: 10,
                text: 'new content',
                rangeLength: 10,
                addedLines: 0,
                deletedLines: 0
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: empty array remains empty
            assert.strictEqual(result.length, 0);
        });

        test('should handle all annotations before change (no overlap)', () => {
            // Document setup: all annotations are before the change
            const annotations: Annotation[] = [
                {
                    startLine: 1,
                    endLine: 2,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 4,
                    endLine: 5,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const change: ContentChange = {
                startLine: 10,       // Change is after all annotations
                endLine: 10,
                startCharacter: 0,
                endCharacter: 5,
                text: 'new content',
                rangeLength: 5,
                addedLines: 0,
                deletedLines: 0
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: all annotations unchanged
            assert.strictEqual(result.length, 2);
            assert.deepStrictEqual(result, annotations);
        });

        test('should handle all annotations after change (all shift)', () => {
            // Document setup: all annotations are after the change
            const annotations: Annotation[] = [
                {
                    startLine: 10,
                    endLine: 12,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 15,
                    endLine: 17,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const change: ContentChange = {
                startLine: 5,        // Insert 2 lines before all annotations
                endLine: 5,
                startCharacter: 0,
                endCharacter: 0,
                text: 'line 1\nline 2',
                rangeLength: 0,
                addedLines: 2,
                deletedLines: 0
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: all annotations shift by +2
            assert.strictEqual(result.length, 2);
            
            // First annotation: 10-12 becomes 12-14
            assert.strictEqual(result[0].startLine, 12);
            assert.strictEqual(result[0].endLine, 14);
            
            // Second annotation: 15-17 becomes 17-19
            assert.strictEqual(result[1].startLine, 17);
            assert.strictEqual(result[1].endLine, 19);
        });

        test('should handle change at line 1 (document boundary)', () => {
            const annotations: Annotation[] = [
                {
                    startLine: 1,        // Annotation at document start
                    endLine: 3,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 5,        // Annotation after change
                    endLine: 6,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const change: ContentChange = {
                startLine: 1,        // Replace first line
                endLine: 1,
                startCharacter: 0,
                endCharacter: 20,
                text: 'new first line',
                rangeLength: 20,
                addedLines: 0,
                deletedLines: 0
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: first annotation split (loses line 1), second unchanged
            assert.strictEqual(result.length, 2);
            
            // First annotation: only lines 2-3 remain (line 1 was modified)
            assert.strictEqual(result[0].startLine, 2);
            assert.strictEqual(result[0].endLine, 3);
            
            // Second annotation: unchanged
            assert.strictEqual(result[1].startLine, 5);
            assert.strictEqual(result[1].endLine, 6);
        });

        test('should handle annotations with large gaps between them', () => {
            // Document setup: annotations with 100-line gaps
            const annotations: Annotation[] = [
                {
                    startLine: 10,
                    endLine: 12,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 200,      // Large gap
                    endLine: 202,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const change: ContentChange = {
                startLine: 100,      // Change in the gap between annotations
                endLine: 100,
                startCharacter: 0,
                endCharacter: 0,
                text: 'inserted line',
                rangeLength: 0,
                addedLines: 1,
                deletedLines: 0
            };
            
            const result = updateAndCleanAnnotationsForContentChange(annotations, change);
            
            // Expected result: first annotation unchanged, second annotation shifts
            assert.strictEqual(result.length, 2);
            
            // First annotation: unchanged (before change)
            assert.strictEqual(result[0].startLine, 10);
            assert.strictEqual(result[0].endLine, 12);
            
            // Second annotation: shifts by +1 (200-202 becomes 201-203)
            assert.strictEqual(result[1].startLine, 201);
            assert.strictEqual(result[1].endLine, 203);
        });
    });

    suite('updateAndCleanAnnotationsForCommit - Multiple Changes', () => {
        
        test('should process multiple changes in reverse order to avoid interference', () => {
            // Document setup (line-by-line):
            // Line 1-2: [user content]
            // Line 3: [user content] ← change 1: will be inserted here  
            // Line 4-5: [user content]
            // Line 6: [AI-generated content] (highlighted) ← will be affected by both insertions
            // Line 7: [user content]
            // Line 8: [user content] ← change 2: will be inserted here
            // Line 9: [user content]
            
            const annotations: Annotation[] = [
                {
                    startLine: 6,        // Annotation between both insertion points
                    endLine: 6,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const changes: ContentChange[] = [
                {
                    startLine: 3,        // Change 1: insert at line 3 (lower line number)
                    endLine: 3,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'inserted at 3',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                },
                {
                    startLine: 8,        // Change 2: insert at line 8 (higher line number)
                    endLine: 8,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'inserted at 8',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                }
            ];
            
            const result = updateAndCleanAnnotationsForCommit(annotations, changes);
            
            // Expected result: annotation at line 6 shifts by +1 (only insertion at line 3 affects it)
            // Changes processed in reverse order: line 8 first (no effect), then line 3 (+1 shift)
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 7); // 6 + 1 (insertion at line 3)
            assert.strictEqual(result[0].endLine, 7);
        });

        test('should handle overlapping changes that split and merge annotations', () => {
            // Document setup (line-by-line):
            // Line 1: [user content]
            // Line 2: [AI-generated content] (highlighted) ← preserved
            // Line 3: [AI-generated content] (highlighted) ← change 1 will split here
            // Line 4: [AI-generated content] (highlighted) ← change 2 will split here
            // Line 5: [AI-generated content] (highlighted) ← preserved
            // Line 6: [user content]
            
            const annotations: Annotation[] = [
                {
                    startLine: 2,
                    endLine: 5,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const changes: ContentChange[] = [
                {
                    startLine: 3,        // Change 1: insert at line 3
                    endLine: 3,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'inserted line 1',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                },
                {
                    startLine: 4,        // Change 2: insert at line 4 (after change 1 processing)
                    endLine: 4,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'inserted line 2',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                }
            ];
            
            const result = updateAndCleanAnnotationsForCommit(annotations, changes);
            
            // Expected result: original annotation (2-5) split by both insertions into 2 parts
            // Processing reverse order: change 2 (line 4) first, then change 1 (line 3)
            // Final result: (2-2) and (7-7) - original line 5 shifted by both insertions (+2)
            assert.strictEqual(result.length, 2);
            
            // Sort results by startLine for consistent testing
            const sortedResult = result.sort((a, b) => a.startLine - b.startLine);
            
            // First part: line 2 (before both insertions, preserved)
            assert.strictEqual(sortedResult[0].startLine, 2);
            assert.strictEqual(sortedResult[0].endLine, 2);
            
            // Second part: line 7 (original line 5 shifted by +2 from both insertions)
            assert.strictEqual(sortedResult[1].startLine, 7);
            assert.strictEqual(sortedResult[1].endLine, 7);
        });

        test('should handle single change validation (behave like single-change function)', () => {
            // This test ensures the multi-change function works correctly with single changes
            const annotations: Annotation[] = [
                {
                    startLine: 5,
                    endLine: 7,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const changes: ContentChange[] = [
                {
                    startLine: 6,        // Single change that splits the annotation
                    endLine: 6,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'inserted line',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                }
            ];
            
            const result = updateAndCleanAnnotationsForCommit(annotations, changes);
            
            // Expected result: same as single-change function (annotation splits into 2 parts)
            assert.strictEqual(result.length, 2);
            
            // Before part: line 5
            assert.strictEqual(result[0].startLine, 5);
            assert.strictEqual(result[0].endLine, 5);
            
            // After part: lines 7 shifts to line 8
            assert.strictEqual(result[1].startLine, 8);
            assert.strictEqual(result[1].endLine, 8);
        });

        test('should handle all changes before annotations', () => {
            // Document setup: all changes are before all annotations
            const annotations: Annotation[] = [
                {
                    startLine: 20,
                    endLine: 22,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 25,
                    endLine: 26,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const changes: ContentChange[] = [
                {
                    startLine: 5,        // Change 1: insert at line 5
                    endLine: 5,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'insert 1',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                },
                {
                    startLine: 10,       // Change 2: insert at line 10
                    endLine: 10,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'insert 2',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                }
            ];
            
            const result = updateAndCleanAnnotationsForCommit(annotations, changes);
            
            // Expected result: both annotations shift by +2 (total insertions)
            assert.strictEqual(result.length, 2);
            
            // First annotation: 20-22 becomes 22-24
            assert.strictEqual(result[0].startLine, 22);
            assert.strictEqual(result[0].endLine, 24);
            
            // Second annotation: 25-26 becomes 27-28  
            assert.strictEqual(result[1].startLine, 27);
            assert.strictEqual(result[1].endLine, 28);
        });

        test('should handle changes with zero net effect (add then remove same lines)', () => {
            const annotations: Annotation[] = [
                {
                    startLine: 10,
                    endLine: 12,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const changes: ContentChange[] = [
                {
                    startLine: 5,        // Change 1: add 2 lines
                    endLine: 5,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'line 1\nline 2',
                    rangeLength: 0,
                    addedLines: 2,
                    deletedLines: 0
                },
                {
                    startLine: 7,        // Change 2: remove 2 lines (net effect = 0)
                    endLine: 8,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: '',
                    rangeLength: 50,
                    addedLines: 0,
                    deletedLines: 2
                }
            ];
            
            const result = updateAndCleanAnnotationsForCommit(annotations, changes);
            
            // Expected result: annotation returns to original position (net 0 effect)
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 10);
            assert.strictEqual(result[0].endLine, 12);
        });

        test('should handle non-sequential line number changes (mixed order)', () => {
            // Test with changes at lines 15, 3, 20 (not in sequential order)
            const annotations: Annotation[] = [
                {
                    startLine: 10,       // Between changes at 3 and 15
                    endLine: 12,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const changes: ContentChange[] = [
                {
                    startLine: 15,       // Change at line 15
                    endLine: 15,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'insert at 15',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                },
                {
                    startLine: 3,        // Change at line 3 (earlier)
                    endLine: 3,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'insert at 3',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                },
                {
                    startLine: 20,       // Change at line 20 (later)
                    endLine: 20,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'insert at 20',
                    rangeLength: 0,
                    addedLines: 1,
                    deletedLines: 0
                }
            ];
            
            const result = updateAndCleanAnnotationsForCommit(annotations, changes);
            
            // Expected result: annotation shifts by +1 (only change at line 3 affects it)
            // Processing order: 20 (no effect), 15 (no effect), 3 (+1 effect)
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 11); // 10 + 1
            assert.strictEqual(result[0].endLine, 13);   // 12 + 1
        });

        test('should demonstrate why reverse order processing is necessary', () => {
            // This test shows that processing changes in forward order would cause INCORRECT BEHAVIOR
            // because change 2 would intersect with the annotation after change 1 shifts it
            
            const annotations: Annotation[] = [
                {
                    startLine: 8,        // Annotation at lines 8-10
                    endLine: 10,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const changes: ContentChange[] = [
                {
                    startLine: 5,        // Change 1: insert 2 lines at line 5
                    endLine: 5,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'line 1\nline 2\nline3',
                    rangeLength: 0,
                    addedLines: 3,
                    deletedLines: 0
                },
                {
                    startLine: 10,       // Change 2: replace at line 10 (ORIGINAL position)
                    endLine: 10,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'replaced line',
                    rangeLength: 20,
                    addedLines: 0,
                    deletedLines: 0
                }
            ];
            
            const result = updateAndCleanAnnotationsForCommit(annotations, changes);
            
            // CORRECT result with reverse processing:
            // 1. Process line 10 first: annotation (8-10) splits into (8-9) - line 10 is removed
            // 2. Process line 5 second: annotation (8-9) shifts to (11-12)
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 11); // 8 + 3
            assert.strictEqual(result[0].endLine, 12);   // 9 + 3
            
            // WRONG result if forward processing was used:
            // 1. Process line 5 first: annotation (8-10) shifts to (11-13)
            // 2. Process line 10 second: the change will not touch the annotation. The result will
            //    be (11-13).
            
            // This test verifies that reverse-order processing prevents annotation interference
        });
    });

    suite('squashOverlappingAnnotations', () => {
        
        test('should return same array for single annotation', () => {
            const annotations: Annotation[] = [{
                startLine: 1,
                endLine: 3,
                timestamp: '2024-01-01T00:00:00.000Z',
                type: 'ai-generated'
            }];
            
            const result = squashOverlappingAnnotations(annotations);
            assert.deepStrictEqual(result, annotations);
        });

        test('should merge overlapping annotations', () => {
            const annotations: Annotation[] = [
                {
                    startLine: 1,
                    endLine: 3,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 2,
                    endLine: 5,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const result = squashOverlappingAnnotations(annotations);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 1);
            assert.strictEqual(result[0].endLine, 5);
            assert.strictEqual(result[0].timestamp, '2024-01-01T00:01:00.000Z'); // Later timestamp
        });

        test('should merge adjacent annotations', () => {
            const annotations: Annotation[] = [
                {
                    startLine: 1,
                    endLine: 3,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 4,
                    endLine: 6,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const result = squashOverlappingAnnotations(annotations);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 1);
            assert.strictEqual(result[0].endLine, 6);
        });

        test('should keep separate non-overlapping annotations', () => {
            const annotations: Annotation[] = [
                {
                    startLine: 1,
                    endLine: 3,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 5,
                    endLine: 7,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const result = squashOverlappingAnnotations(annotations);
            
            assert.strictEqual(result.length, 2);
            assert.deepStrictEqual(result, annotations);
        });

        test('should handle empty array gracefully', () => {
            const annotations: Annotation[] = [];
            
            const result = squashOverlappingAnnotations(annotations);
            
            // Expected result: empty array remains empty
            assert.strictEqual(result.length, 0);
            assert.deepStrictEqual(result, []);
        });

        test('should handle invalid annotations defensively (startLine > endLine)', () => {
            const annotations: Annotation[] = [
                {
                    startLine: 5,        // Invalid: start > end
                    endLine: 3,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 10,       // Valid annotation
                    endLine: 12,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const result = squashOverlappingAnnotations(annotations);
            
            // Expected result: algorithm processes invalid annotations normally
            // Sorting and merging logic should handle this gracefully
            assert.ok(result.length >= 1);
            
            // Verify at least the valid annotation is present
            const validAnnotation = result.find(ann => ann.startLine === 10);
            assert.ok(validAnnotation !== undefined);
        });

        test('should handle chain merging (A→B→C→D)', () => {
            // Setup: A overlaps B, B overlaps C, C overlaps D
            const annotations: Annotation[] = [
                {
                    startLine: 1,
                    endLine: 5,          // Overlaps with B
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 4,
                    endLine: 8,          // Overlaps with A and C
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 7,
                    endLine: 11,         // Overlaps with B and D
                    timestamp: '2024-01-01T00:02:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 10,
                    endLine: 15,         // Overlaps with C
                    timestamp: '2024-01-01T00:03:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const result = squashOverlappingAnnotations(annotations);
            
            // Expected result: all merge into single annotation (1-15)
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 1);
            assert.strictEqual(result[0].endLine, 15);
            
            // Should preserve the latest timestamp
            assert.strictEqual(result[0].timestamp, '2024-01-01T00:03:00.000Z');
        });

        test('should handle nested annotations (small inside large)', () => {
            const annotations: Annotation[] = [
                {
                    startLine: 1,
                    endLine: 20,         // Large outer annotation
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 5,
                    endLine: 8,          // Small inner annotation
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 12,
                    endLine: 15,         // Another small inner annotation
                    timestamp: '2024-01-01T00:02:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const result = squashOverlappingAnnotations(annotations);
            
            // Expected result: all merge into the large annotation (1-20)
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 1);
            assert.strictEqual(result[0].endLine, 20);
        });

        test('should handle complex interleaved pattern', () => {
            // Complex overlapping: 1-3, 2-4, 6-8, 7-9, 11-13
            const annotations: Annotation[] = [
                {
                    startLine: 1,
                    endLine: 3,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 2,
                    endLine: 4,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 6,
                    endLine: 8,
                    timestamp: '2024-01-01T00:02:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 7,
                    endLine: 9,
                    timestamp: '2024-01-01T00:03:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 11,
                    endLine: 13,
                    timestamp: '2024-01-01T00:04:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const result = squashOverlappingAnnotations(annotations);
            
            // Expected result: 3 merged annotations (1-4, 6-9, 11-13)
            assert.strictEqual(result.length, 3);
            
            // Sort by startLine for consistent testing
            const sortedResult = result.sort((a, b) => a.startLine - b.startLine);
            
            // First merged group: 1-4
            assert.strictEqual(sortedResult[0].startLine, 1);
            assert.strictEqual(sortedResult[0].endLine, 4);
            
            // Second merged group: 6-9
            assert.strictEqual(sortedResult[1].startLine, 6);
            assert.strictEqual(sortedResult[1].endLine, 9);
            
            // Third group: 11-13 (no merging needed)
            assert.strictEqual(sortedResult[2].startLine, 11);
            assert.strictEqual(sortedResult[2].endLine, 13);
        });

        test('should handle annotations differing by exactly 1 line (edge boundary)', () => {
            // Test annotations that are exactly 1 line apart (should merge due to adjacent rule)
            const annotations: Annotation[] = [
                {
                    startLine: 5,
                    endLine: 7,
                    timestamp: '2024-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 8,        // Exactly 1 line after first annotation ends
                    endLine: 10,
                    timestamp: '2024-01-01T00:01:00.000Z',
                    type: 'ai-generated'
                }
            ];
            
            const result = squashOverlappingAnnotations(annotations);
            
            // Expected result: merge into single annotation (5-10)
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].startLine, 5);
            assert.strictEqual(result[0].endLine, 10);
        });
    });

    suite('applyChange - Multiple Changes Processing', () => {
        
        test('should process changes in reverse order (high to low line numbers)', () => {
            // Document setup (line-by-line):
            // Line 1-2: [user content]
            // Line 3: [user content] ← change 1: will be inserted here
            // Line 4-5: [user content]
            // Line 6: [AI-generated content] (highlighted) ← will be affected by both insertions
            // Line 7: [user content] 
            // Line 8: [user content] ← change 2: will be inserted here
            // Line 9-10: [user content]
            
            const initialSnapshot: Snapshot = {
                highlightedRanges: [
                    {
                        startLine: 6,        // Annotation after both insertion points
                        endLine: 6,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2024-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            
            const commit: Commit = {
                documentVersion: 2,
                isSignificant: false,  // Just testing change processing, not adding new annotations
                contentChanges: [
                    {
                        startLine: 3,        // Change 1: insert at line 3 (should be processed second)
                        endLine: 3,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'inserted at 3',
                        rangeLength: 0,
                        addedLines: 1,
                        deletedLines: 0
                    },
                    {
                        startLine: 8,        // Change 2: insert at line 8 (should be processed first due to higher line number)
                        endLine: 8,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'inserted at 8',
                        rangeLength: 0,
                        addedLines: 1,
                        deletedLines: 0
                    }
                ]
            };
            
            const result = applyChange(initialSnapshot, commit);
            
            // Expected result: annotation at line 6 shifts by +1 (only the insertion at line 3 affects it)
            // The insertion at line 8 is after the annotation, so it doesn't shift the annotation
            // Changes processed in reverse order: line 8 first (no effect), then line 3 (+1 shift)
            assert.strictEqual(result.highlightedRanges.length, 1);
            assert.strictEqual(result.highlightedRanges[0].startLine, 7); // 6 + 1 (insertion at line 3)
            assert.strictEqual(result.highlightedRanges[0].endLine, 7);
        });

        test('should add new annotations for significant changes', () => {
            // Document setup (line-by-line):
            // Line 1-3: [user content]
            // Line 4: [AI-generated content] (existing highlight)
            // Line 5-6: [user content]
            // Line 7: [new AI content will be added here] ← significant change
            // Line 8: [user content]
            
            const initialSnapshot: Snapshot = {
                highlightedRanges: [
                    {
                        startLine: 4,
                        endLine: 4,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2024-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            
            const commit: Commit = {
                documentVersion: 2,
                isSignificant: true,   // This will add new annotations
                contentChanges: [
                    {
                        startLine: 7,        // Insert 2 lines of significant content
                        endLine: 7,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'function newFunction() {\n    return "ai generated";\n}',  // Multi-line significant change
                        rangeLength: 0,
                        addedLines: 2,       // 3 lines total in text - 1 = 2 added lines
                        deletedLines: 0
                    }
                ]
            };
            
            const result = applyChange(initialSnapshot, commit);
            
            // Expected result: original annotation unchanged + new annotation for added lines
            assert.strictEqual(result.highlightedRanges.length, 2);
            
            // Original annotation unchanged (before the insertion)
            assert.strictEqual(result.highlightedRanges[0].startLine, 4);
            assert.strictEqual(result.highlightedRanges[0].endLine, 4);
            
            // New annotation for the inserted significant content
            assert.strictEqual(result.highlightedRanges[1].startLine, 7);
            assert.strictEqual(result.highlightedRanges[1].endLine, 9);  // 7 + 2 = 9
        });

        test('should handle complex scenario: overlapping changes with significant additions', () => {
            // Document setup (line-by-line):
            // Line 1: [user content]
            // Line 2: [AI-generated content] (highlighted) ← will be split by change at line 3
            // Line 3: [AI-generated content] (highlighted) ← will be replaced
            // Line 4: [AI-generated content] (highlighted) ← will be split by change at line 3
            // Line 5: [user content]
            // Line 6: [user content] ← significant new content will be added
            
            const initialSnapshot: Snapshot = {
                highlightedRanges: [
                    {
                        startLine: 2,
                        endLine: 4,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2024-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            
            const commit: Commit = {
                documentVersion: 2,
                isSignificant: true,
                contentChanges: [
                    {
                        startLine: 3,        // Change 1: replace line 3 (middle of annotation)
                        endLine: 3,
                        startCharacter: 0,
                        endCharacter: 10,
                        text: 'user edited line',
                        rangeLength: 10,
                        addedLines: 0,
                        deletedLines: 0
                    },
                    {
                        startLine: 6,        // Change 2: add significant content
                        endLine: 6,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'class AIGeneratedClass {\n    constructor() {}\n}',
                        rangeLength: 0,
                        addedLines: 2,
                        deletedLines: 0
                    }
                ]
            };
            
            const result = applyChange(initialSnapshot, commit);
            
            // Expected result: two annotation parts (squashed by overlapping logic)
            // 1. Merged annotation covering original parts + replacement (lines 2-4)
            // 2. New significant content (lines 6-7)
            assert.strictEqual(result.highlightedRanges.length, 2);
            
            // Sort results by startLine for consistent testing
            const sortedRanges = result.highlightedRanges.sort((a: Annotation, b: Annotation) => a.startLine - b.startLine);
            
            // First annotation: merged from original parts and replacement annotation
            assert.strictEqual(sortedRanges[0].startLine, 2);
            assert.strictEqual(sortedRanges[0].endLine, 4);
            
            // Second annotation: new significant content added at lines 6-8
            assert.strictEqual(sortedRanges[1].startLine, 6);
            assert.strictEqual(sortedRanges[1].endLine, 8);
        });

        test('should handle sequential changes that affect same annotation', () => {
            // Document setup (line-by-line):
            // Line 1: [user content]
            // Line 2: [AI-generated content] (highlighted) ← will be affected by both changes
            // Line 3: [AI-generated content] (highlighted) ← change 1 will insert before this
            // Line 4: [AI-generated content] (highlighted) ← change 2 will insert before this  
            // Line 5: [user content]
            
            const initialSnapshot: Snapshot = {
                highlightedRanges: [
                    {
                        startLine: 2,
                        endLine: 4,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2024-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            
            const commit: Commit = {
                documentVersion: 2,
                isSignificant: false,
                contentChanges: [
                    {
                        startLine: 3,        // Change 1: insert at line 3 (within annotation)
                        endLine: 3,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'inserted line 1',
                        rangeLength: 0,
                        addedLines: 1,
                        deletedLines: 0
                    },
                    {
                        startLine: 4,        // Change 2: insert at line 4 (within annotation, after change 1)
                        endLine: 4,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'inserted line 2',
                        rangeLength: 0,
                        addedLines: 1,
                        deletedLines: 0
                    }
                ]
            };
            
            const result = applyChange(initialSnapshot, commit);
            
            // Expected result: annotation split by sequential insertions leaves only the before part
            // Processing order: line 4 first (higher), then line 3
            // Original annotation (2-4) becomes just line 2 after both insertions split it
            assert.strictEqual(result.highlightedRanges.length, 1);
            assert.strictEqual(result.highlightedRanges[0].startLine, 2);
            assert.strictEqual(result.highlightedRanges[0].endLine, 2);
        });

        test('should handle non-significant changes only (no new annotations)', () => {
            const initialSnapshot: Snapshot = {
                highlightedRanges: [
                    {
                        startLine: 5,
                        endLine: 7,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2024-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            
            const commit: Commit = {
                documentVersion: 2,
                isSignificant: false,  // No new annotations should be added
                contentChanges: [
                    {
                        startLine: 3,
                        endLine: 3,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'user typed line',
                        rangeLength: 0,
                        addedLines: 1,
                        deletedLines: 0
                    }
                ]
            };
            
            const result = applyChange(initialSnapshot, commit);
            
            // Expected result: existing annotation shifts, no new annotations
            assert.strictEqual(result.highlightedRanges.length, 1);
            assert.strictEqual(result.highlightedRanges[0].startLine, 6); // 5 + 1
            assert.strictEqual(result.highlightedRanges[0].endLine, 8);   // 7 + 1
        });

        test('should handle significant changes only (add new annotations)', () => {
            const initialSnapshot: Snapshot = {
                highlightedRanges: [],
                lastUpdated: '2024-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            
            const commit: Commit = {
                documentVersion: 2,
                isSignificant: true,   // Only significant changes
                contentChanges: [
                    {
                        startLine: 10,
                        endLine: 10,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'function aiGenerated() {\n    return true;\n}',
                        rangeLength: 0,
                        addedLines: 2,
                        deletedLines: 0
                    }
                ]
            };
            
            const result = applyChange(initialSnapshot, commit);
            
            // Expected result: new annotation for AI-generated code
            assert.strictEqual(result.highlightedRanges.length, 1);
            assert.strictEqual(result.highlightedRanges[0].startLine, 10);
            assert.strictEqual(result.highlightedRanges[0].endLine, 12); // 10 + 2
        });

        test('should handle mixed significant and non-significant changes', () => {
            const initialSnapshot: Snapshot = {
                highlightedRanges: [
                    {
                        startLine: 15,
                        endLine: 16,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2024-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            
            const commit: Commit = {
                documentVersion: 2,
                isSignificant: true,   // Has significant changes
                contentChanges: [
                    {
                        startLine: 5,        // Non-significant: small user edit
                        endLine: 5,
                        startCharacter: 10,
                        endCharacter: 15,
                        text: 'edit',
                        rangeLength: 5,
                        addedLines: 0,
                        deletedLines: 0
                    },
                    {
                        startLine: 10,       // Significant: AI-generated block
                        endLine: 10,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'class NewClass {\n    method() {}\n}',
                        rangeLength: 0,
                        addedLines: 2,
                        deletedLines: 0
                    }
                ]
            };
            
            const result = applyChange(initialSnapshot, commit);
            
            // Expected result: existing annotation + new annotations for ALL changes (since isSignificant=true)
            // The algorithm creates annotations for ALL changes when isSignificant is true
            assert.strictEqual(result.highlightedRanges.length, 3);
            
            // Sort by startLine for consistent testing
            const sortedRanges = result.highlightedRanges.sort((a, b) => a.startLine - b.startLine);
            
            // First new annotation for change at line 5 (character edit)
            assert.strictEqual(sortedRanges[0].startLine, 5);
            assert.strictEqual(sortedRanges[0].endLine, 5);
            
            // Second new annotation for change at line 10 (AI-generated block)
            assert.strictEqual(sortedRanges[1].startLine, 10);
            assert.strictEqual(sortedRanges[1].endLine, 12);
            
            // Existing annotation shifted by net changes (+2 from insertion)
            assert.strictEqual(sortedRanges[2].startLine, 17); // 15 + 2
            assert.strictEqual(sortedRanges[2].endLine, 18);   // 16 + 2
        });

        test('should update document version and timestamp correctly', () => {
            const initialSnapshot: Snapshot = {
                highlightedRanges: [
                    {
                        startLine: 5,
                        endLine: 5,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2024-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            
            const commit: Commit = {
                documentVersion: 3,    // Version jump
                isSignificant: false,
                contentChanges: [
                    {
                        startLine: 10,
                        endLine: 10,
                        startCharacter: 0,
                        endCharacter: 0,
                        text: 'user addition',
                        rangeLength: 0,
                        addedLines: 1,
                        deletedLines: 0
                    }
                ]
            };
            
            const result = applyChange(initialSnapshot, commit);
            
            // Expected result: version and timestamp updated
            assert.strictEqual(result.documentVersion, 3);
            assert.ok(result.lastUpdated !== initialSnapshot.lastUpdated);
            assert.ok(new Date(result.lastUpdated) > new Date(initialSnapshot.lastUpdated));
        });
    });
});