import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { 
    initializeHighlighting, 
    applyHighlightingToEditor, 
    clearHighlighting, 
    reinitializeHighlighting, 
    disposeHighlighting 
} from '../highlightingHandler';
import { Annotation } from '../dataStructures';

suite('Highlighting Handler Tests', () => {
    let mockEditor: vscode.TextEditor;
    let mockDocument: vscode.TextDocument;
    let mockDecorationType: vscode.TextEditorDecorationType;
    let configStubs: sinon.SinonStub[];
    let vscodeStubs: sinon.SinonStub[];

    setup(() => {
        // Reset stub arrays
        configStubs = [];
        vscodeStubs = [];

        // Mock decoration type
        mockDecorationType = {
            dispose: sinon.stub()
        } as any;

        // Mock VS Code window API
        const createDecorationStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationStub.returns(mockDecorationType);
        vscodeStubs.push(createDecorationStub);

        // Mock document with lines
        mockDocument = {
            uri: vscode.Uri.file('/fake/test.ts'),
            lineAt: sinon.stub().callsFake((line: number) => ({
                text: `line ${line} content`
            }))
        } as any;
        
        // Set lineCount as a property descriptor to avoid read-only issues
        Object.defineProperty(mockDocument, 'lineCount', {
            value: 10,
            writable: true,
            configurable: true
        });

        // Mock editor
        mockEditor = {
            document: mockDocument,
            setDecorations: sinon.stub()
        } as any;

        // Mock configuration
        const mockConfig = {
            highlighting: {
                backgroundColor: 'rgba(255, 215, 0, 0.15)',
                borderColor: 'rgba(255, 215, 0, 0.3)',
                borderWidth: '1px',
                borderRadius: '2px',
                borderStyle: 'solid',
                overviewRulerColor: 'rgba(255, 215, 0, 0.5)',
                overviewRulerLane: 'Right' as const,
                gutterIcon: undefined,
                opacity: 1.0
            }
        };

        // Mock loadConfig
        const loadConfigStub = sinon.stub();
        loadConfigStub.returns(mockConfig);
        configStubs.push(loadConfigStub);

        // Replace the import
        const configModule = require('../configuration');
        configModule.loadConfig = loadConfigStub;
    });

    teardown(() => {
        // Restore all stubs
        configStubs.forEach(stub => stub.restore?.());
        vscodeStubs.forEach(stub => stub.restore());
        sinon.restore();
    });

    suite('Initialization & Configuration', () => {
        test('should initialize decoration type with default configuration', () => {
            initializeHighlighting();

            const createDecorationStub = vscodeStubs.find(stub => 
                stub === vscode.window.createTextEditorDecorationType
            ) as sinon.SinonStub;

            assert.strictEqual(createDecorationStub.calledOnce, true, 'Should call createTextEditorDecorationType once');

            const decorationOptions = createDecorationStub.getCall(0).args[0];
            assert.strictEqual(decorationOptions.backgroundColor, 'rgba(255, 215, 0, 0.15)');
            assert.strictEqual(decorationOptions.border, '1px solid rgba(255, 215, 0, 0.3)');
            assert.strictEqual(decorationOptions.borderRadius, '2px');
        });

        test('should map overview ruler lanes correctly', () => {
            // Test different lane configurations
            const testConfigs = [
                { lane: 'Left', expected: vscode.OverviewRulerLane.Left },
                { lane: 'Center', expected: vscode.OverviewRulerLane.Center },
                { lane: 'Right', expected: vscode.OverviewRulerLane.Right },
                { lane: 'Full', expected: vscode.OverviewRulerLane.Full }
            ];

            testConfigs.forEach(({ lane, expected }) => {
                // Reset stubs
                vscodeStubs.forEach(stub => stub.resetHistory());

                // Update config
                const configModule = require('../configuration');
                configModule.loadConfig.returns({
                    highlighting: {
                        backgroundColor: 'rgba(255, 215, 0, 0.15)',
                        borderColor: 'rgba(255, 215, 0, 0.3)',
                        borderWidth: '1px',
                        borderRadius: '2px',
                        borderStyle: 'solid',
                        overviewRulerColor: 'rgba(255, 215, 0, 0.5)',
                        overviewRulerLane: lane,
                        opacity: 1.0
                    }
                });

                initializeHighlighting();

                const createDecorationStub = vscode.window.createTextEditorDecorationType as sinon.SinonStub;
                const decorationOptions = createDecorationStub.getCall(0).args[0];
                assert.strictEqual(decorationOptions.overviewRulerLane, expected, `Should map ${lane} to correct enum value`);
            });
        });

        test('should handle optional gutter icon configuration', () => {
            const configModule = require('../configuration');
            configModule.loadConfig.returns({
                highlighting: {
                    backgroundColor: 'rgba(255, 215, 0, 0.15)',
                    borderColor: 'rgba(255, 215, 0, 0.3)',
                    borderWidth: '1px',
                    borderRadius: '2px',
                    borderStyle: 'solid',
                    overviewRulerColor: 'rgba(255, 215, 0, 0.5)',
                    overviewRulerLane: 'Right',
                    gutterIcon: '/path/to/icon.svg',
                    opacity: 1.0
                }
            });

            initializeHighlighting();

            const createDecorationStub = vscode.window.createTextEditorDecorationType as sinon.SinonStub;
            const decorationOptions = createDecorationStub.getCall(0).args[0];
            assert.strictEqual(decorationOptions.gutterIconPath, '/path/to/icon.svg');
        });
    });

    suite('Annotation Application', () => {
        test('should convert annotations to VS Code decorations', () => {
            const annotations: Annotation[] = [
                {
                    startLine: 1,
                    endLine: 3,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 5,
                    endLine: 5,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];

            // Initialize first
            initializeHighlighting();

            // Apply annotations
            applyHighlightingToEditor(mockEditor, annotations);

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            assert.strictEqual(setDecorationsStub.calledOnce, true, 'Should call setDecorations once');

            const [decorationType, decorations] = setDecorationsStub.getCall(0).args;
            assert.strictEqual(decorationType, mockDecorationType);
            assert.strictEqual(decorations.length, 2, 'Should create 2 decorations');

            // Check first decoration (lines 1-3, converted to 0-based: 0-2)
            const firstDecoration = decorations[0];
            assert.strictEqual(firstDecoration.range.start.line, 0);
            assert.strictEqual(firstDecoration.range.end.line, 2);

            // Check second decoration (line 5, converted to 0-based: 4)
            const secondDecoration = decorations[1];
            assert.strictEqual(secondDecoration.range.start.line, 4);
            assert.strictEqual(secondDecoration.range.end.line, 4);
        });

        test('should handle empty annotations array', () => {
            initializeHighlighting();
            applyHighlightingToEditor(mockEditor, []);

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            assert.strictEqual(setDecorationsStub.calledOnce, true);

            const [, decorations] = setDecorationsStub.getCall(0).args;
            assert.strictEqual(decorations.length, 0, 'Should create no decorations for empty array');
        });

        test('should lazy initialize decoration type if not exists', () => {
            // Apply without explicit initialization
            const annotations: Annotation[] = [{
                startLine: 1,
                endLine: 1,
                timestamp: '2023-01-01T00:00:00.000Z',
                type: 'ai-generated'
            }];

            applyHighlightingToEditor(mockEditor, annotations);

            // Should have called createTextEditorDecorationType during lazy init
            const createDecorationStub = vscode.window.createTextEditorDecorationType as sinon.SinonStub;
            assert.strictEqual(createDecorationStub.calledOnce, true, 'Should initialize decoration type lazily');
        });
    });

    suite('Range Calculation & Boundary Handling', () => {
        test('should convert 1-based line numbers to 0-based', () => {
            const annotations: Annotation[] = [{
                startLine: 5,  // 1-based
                endLine: 7,    // 1-based
                timestamp: '2023-01-01T00:00:00.000Z',
                type: 'ai-generated'
            }];

            initializeHighlighting();
            applyHighlightingToEditor(mockEditor, annotations);

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            const [, decorations] = setDecorationsStub.getCall(0).args;
            const decoration = decorations[0];

            assert.strictEqual(decoration.range.start.line, 4, 'Should convert startLine to 0-based');
            assert.strictEqual(decoration.range.end.line, 6, 'Should convert endLine to 0-based');
        });

        test('should handle out-of-bounds line numbers', () => {
            // Document has 10 lines (0-9 in 0-based)
            const annotations: Annotation[] = [
                {
                    startLine: -1,    // Below bounds
                    endLine: 2,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 8,
                    endLine: 15,      // Above bounds (document has 10 lines)
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ];

            initializeHighlighting();
            applyHighlightingToEditor(mockEditor, annotations);

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            const [, decorations] = setDecorationsStub.getCall(0).args;

            // First annotation: -1 should be clamped to 0
            const firstDecoration = decorations[0];
            assert.strictEqual(firstDecoration.range.start.line, 0, 'Should clamp negative line to 0');

            // Second annotation: 15 should be clamped to 9 (document has 10 lines, so max index is 9)
            const secondDecoration = decorations[1];
            assert.strictEqual(secondDecoration.range.end.line, 9, 'Should clamp high line to document bounds');
        });

        test('should handle single-line annotations', () => {
            const annotations: Annotation[] = [{
                startLine: 3,
                endLine: 3,  // Same line
                timestamp: '2023-01-01T00:00:00.000Z',
                type: 'ai-generated'
            }];

            initializeHighlighting();
            applyHighlightingToEditor(mockEditor, annotations);

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            const [, decorations] = setDecorationsStub.getCall(0).args;
            const decoration = decorations[0];

            assert.strictEqual(decoration.range.start.line, 2);
            assert.strictEqual(decoration.range.end.line, 2);
            assert.strictEqual(decoration.range.start.character, 0);
        });

        test('should set range to full line width', () => {
            const annotations: Annotation[] = [{
                startLine: 1,
                endLine: 1,
                timestamp: '2023-01-01T00:00:00.000Z',
                type: 'ai-generated'
            }];

            // Mock lineAt to return specific text length
            (mockDocument.lineAt as sinon.SinonStub).returns({ text: 'some line content' });

            initializeHighlighting();
            applyHighlightingToEditor(mockEditor, annotations);

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            const [, decorations] = setDecorationsStub.getCall(0).args;
            const decoration = decorations[0];

            assert.strictEqual(decoration.range.start.character, 0);
            assert.strictEqual(decoration.range.end.character, 17, 'Should span full line width');
        });
    });

    suite('Editor Integration', () => {
        test('should call editor.setDecorations with correct parameters', () => {
            const annotations: Annotation[] = [{
                startLine: 1,
                endLine: 2,
                timestamp: '2023-01-01T00:00:00.000Z',
                type: 'ai-generated'
            }];

            initializeHighlighting();
            applyHighlightingToEditor(mockEditor, annotations);

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            assert.strictEqual(setDecorationsStub.calledOnce, true);

            const [decorationType, decorations] = setDecorationsStub.getCall(0).args;
            assert.strictEqual(decorationType, mockDecorationType);
            assert.strictEqual(Array.isArray(decorations), true);
            assert.strictEqual(decorations.length, 1);
        });

        test('should clear decorations from editor', () => {
            initializeHighlighting();
            clearHighlighting(mockEditor);

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            assert.strictEqual(setDecorationsStub.calledOnce, true);

            const [decorationType, decorations] = setDecorationsStub.getCall(0).args;
            assert.strictEqual(decorationType, mockDecorationType);
            assert.strictEqual(decorations.length, 0, 'Should pass empty array to clear decorations');
        });

        test('should handle editor with different document sizes', () => {
            // Test with small document
            Object.defineProperty(mockDocument, 'lineCount', { value: 1, writable: true, configurable: true });
            const annotations: Annotation[] = [{
                startLine: 1,
                endLine: 1,
                timestamp: '2023-01-01T00:00:00.000Z',
                type: 'ai-generated'
            }];

            initializeHighlighting();
            applyHighlightingToEditor(mockEditor, annotations);

            let setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            let [, decorations] = setDecorationsStub.getCall(0).args;
            assert.strictEqual(decorations.length, 1);

            // Reset and test with larger document
            setDecorationsStub.resetHistory();
            Object.defineProperty(mockDocument, 'lineCount', { value: 100, writable: true, configurable: true });

            applyHighlightingToEditor(mockEditor, annotations);
            [, decorations] = setDecorationsStub.getCall(0).args;
            assert.strictEqual(decorations.length, 1);
        });
    });

    suite('Lifecycle Management', () => {
        test('should dispose old decoration type during reinitialization', () => {
            // Initialize first time
            initializeHighlighting();
            const firstDecorationType = mockDecorationType;

            // Create new mock for second initialization
            const secondMockDecorationType = {
                dispose: sinon.stub()
            } as any;

            (vscode.window.createTextEditorDecorationType as sinon.SinonStub)
                .returns(secondMockDecorationType);

            // Reinitialize
            reinitializeHighlighting();

            // Should dispose the first decoration type
            const disposeStub = firstDecorationType.dispose as sinon.SinonStub;
            assert.strictEqual(disposeStub.calledOnce, true, 'Should dispose old decoration type');

            // Should create new decoration type
            const createStub = vscode.window.createTextEditorDecorationType as sinon.SinonStub;
            assert.strictEqual(createStub.calledTwice, true, 'Should create new decoration type');
        });

        test('should dispose highlighting resources', () => {
            initializeHighlighting();
            disposeHighlighting();

            const disposeStub = mockDecorationType.dispose as sinon.SinonStub;
            assert.strictEqual(disposeStub.calledOnce, true, 'Should dispose decoration type');
        });

        test('should handle disposal when decoration type is null', () => {
            // Call dispose without initialization
            assert.doesNotThrow(() => {
                disposeHighlighting();
            }, 'Should not throw when disposing null decoration type');
        });

        test('should handle multiple initialization calls', () => {
            initializeHighlighting();
            initializeHighlighting();
            initializeHighlighting();

            const createStub = vscode.window.createTextEditorDecorationType as sinon.SinonStub;
            assert.strictEqual(createStub.callCount, 3, 'Should handle multiple initialization calls');
        });
    });

    suite('Configuration Changes', () => {
        test('should use different highlighting configurations', () => {
            const customConfig = {
                highlighting: {
                    backgroundColor: 'rgba(255, 0, 0, 0.2)',
                    borderColor: 'red',
                    borderWidth: '2px',
                    borderRadius: '4px',
                    borderStyle: 'dashed',
                    overviewRulerColor: 'red',
                    overviewRulerLane: 'Left' as const,
                    opacity: 0.8
                }
            };

            const configModule = require('../configuration');
            configModule.loadConfig.returns(customConfig);

            initializeHighlighting();

            const createStub = vscode.window.createTextEditorDecorationType as sinon.SinonStub;
            const decorationOptions = createStub.getCall(0).args[0];

            assert.strictEqual(decorationOptions.backgroundColor, 'rgba(255, 0, 0, 0.2)');
            assert.strictEqual(decorationOptions.border, '2px dashed red');
            assert.strictEqual(decorationOptions.borderRadius, '4px');
            assert.strictEqual(decorationOptions.opacity, '0.8');
        });

        test('should reinitialize with new configuration', () => {
            // Initial config
            initializeHighlighting();

            // Change config
            const newConfig = {
                highlighting: {
                    backgroundColor: 'blue',
                    borderColor: 'blue',
                    borderWidth: '3px',
                    borderRadius: '6px',
                    borderStyle: 'dotted',
                    overviewRulerColor: 'blue',
                    overviewRulerLane: 'Full' as const,
                    opacity: 0.5
                }
            };

            const configModule = require('../configuration');
            configModule.loadConfig.returns(newConfig);

            // Create new mock decoration type for reinitialization
            const newMockDecorationType = { dispose: sinon.stub() } as any;
            (vscode.window.createTextEditorDecorationType as sinon.SinonStub)
                .returns(newMockDecorationType);

            reinitializeHighlighting();

            const createStub = vscode.window.createTextEditorDecorationType as sinon.SinonStub;
            const decorationOptions = createStub.getCall(1).args[0]; // Second call

            assert.strictEqual(decorationOptions.backgroundColor, 'blue');
            assert.strictEqual(decorationOptions.border, '3px dotted blue');
        });
    });

    suite('Edge Cases & Error Handling', () => {
        test('should handle malformed annotations gracefully', () => {
            const malformedAnnotations = [
                {
                    startLine: 0,  // Invalid (should be >= 1)
                    endLine: -5,   // Invalid 
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 1000,  // Very high number
                    endLine: 999,     // End before start
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ] as Annotation[];

            initializeHighlighting();

            assert.doesNotThrow(() => {
                applyHighlightingToEditor(mockEditor, malformedAnnotations);
            }, 'Should handle malformed annotations without throwing');

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            assert.strictEqual(setDecorationsStub.calledOnce, true, 'Should still call setDecorations');
        });

        test('should handle null/undefined editor gracefully', () => {
            initializeHighlighting();

            assert.throws(() => {
                clearHighlighting(null as any);
            }, 'Should handle null editor');
        });

        test('should handle empty document', () => {
            Object.defineProperty(mockDocument, 'lineCount', { value: 0, writable: true, configurable: true });
            const annotations: Annotation[] = [{
                startLine: 1,
                endLine: 1,
                timestamp: '2023-01-01T00:00:00.000Z',
                type: 'ai-generated'
            }];

            initializeHighlighting();
            
            assert.doesNotThrow(() => {
                applyHighlightingToEditor(mockEditor, annotations);
            }, 'Should handle empty document gracefully');
        });

        test('should handle concurrent decoration operations', async () => {
            const annotations: Annotation[] = [{
                startLine: 1,
                endLine: 2,
                timestamp: '2023-01-01T00:00:00.000Z',
                type: 'ai-generated'
            }];

            initializeHighlighting();

            // Simulate concurrent operations
            const promises = [
                Promise.resolve(applyHighlightingToEditor(mockEditor, annotations)),
                Promise.resolve(clearHighlighting(mockEditor)),
                Promise.resolve(applyHighlightingToEditor(mockEditor, annotations))
            ];

            await Promise.all(promises);

            const setDecorationsStub = mockEditor.setDecorations as sinon.SinonStub;
            assert.strictEqual(setDecorationsStub.callCount, 3, 'Should handle concurrent operations');
        });
    });
});