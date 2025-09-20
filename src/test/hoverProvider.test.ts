import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { 
    AnnotationHoverProvider, 
    registerHoverProvider 
} from '../hoverProvider';
import { Annotation } from '../dataStructures';

suite('Hover Provider Tests', () => {
    let mockContext: vscode.ExtensionContext;
    let mockDocument: vscode.TextDocument;
    let mockEditor: vscode.TextEditor;
    let hoverProvider: AnnotationHoverProvider;
    let annotationStubs: sinon.SinonStub[];
    let highlightingStubs: sinon.SinonStub[];
    let vscodeStubs: sinon.SinonStub[];

    setup(() => {
        // Reset stub arrays
        annotationStubs = [];
        highlightingStubs = [];
        vscodeStubs = [];

        // Mock extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '/fake/path',
            extensionUri: vscode.Uri.file('/fake/path'),
            globalState: {} as any,
            workspaceState: {} as any,
            secrets: {} as any,
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => `/fake/path/${relativePath}`,
            storagePath: '/fake/storage',
            globalStoragePath: '/fake/global-storage',
            storageUri: vscode.Uri.file('/fake/storage'),
            globalStorageUri: vscode.Uri.file('/fake/global-storage'),
            logUri: vscode.Uri.file('/fake/log'),
            logPath: '/fake/log',
            extensionMode: vscode.ExtensionMode.Test,
            extension: {} as any,
            languageModelAccessInformation: {} as any
        } as unknown as vscode.ExtensionContext;

        // Mock document
        mockDocument = {
            uri: vscode.Uri.file('/fake/test.ts'),
            lineAt: sinon.stub().callsFake((line: number) => ({
                text: `line ${line} content`
            }))
        } as any;

        // Mock editor with selection
        mockEditor = {
            document: mockDocument,
            selection: new vscode.Selection(5, 0, 5, 0) // Default empty selection
        } as any;

        // Mock active editor
        const activeEditorStub = sinon.stub(vscode.window, 'activeTextEditor');
        Object.defineProperty(vscode.window, 'activeTextEditor', {
            get: () => mockEditor,
            configurable: true
        });
        vscodeStubs.push(activeEditorStub);

        // Create hover provider instance
        hoverProvider = new AnnotationHoverProvider(mockContext);

        // Mock annotation system
        const mockSnapshot = {
            highlightedRanges: [
                {
                    startLine: 5,
                    endLine: 10,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 15,
                    endLine: 15,
                    timestamp: '2023-01-01T01:00:00.000Z',
                    type: 'ai-generated'
                }
            ] as Annotation[],
            lastUpdated: '2023-01-01T00:00:00.000Z',
            documentVersion: 1
        };

        // Import and mock the modules before creating stubs
        const annotationModule = require('../annotationSystem');
        const highlightingModule = require('../highlightingHandler');

        const loadSnapshotStub = sinon.stub(annotationModule, 'loadSnapshot');
        loadSnapshotStub.returns(mockSnapshot);
        annotationStubs.push(loadSnapshotStub);

        const saveSnapshotStub = sinon.stub(annotationModule, 'saveSnapshot');
        annotationStubs.push(saveSnapshotStub);

        // Mock highlighting handler
        const applyHighlightingStub = sinon.stub(highlightingModule, 'applyHighlightingToEditor');
        highlightingStubs.push(applyHighlightingStub);
    });

    teardown(() => {
        // Restore all stubs
        annotationStubs.forEach(stub => stub.restore?.());
        highlightingStubs.forEach(stub => stub.restore?.());
        vscodeStubs.forEach(stub => stub.restore());
        sinon.restore();
    });

    suite('Hover Provider Core Functionality', () => {
        test('should provide hover when position is within annotation', async () => {
            const position = new vscode.Position(6, 10); // Line 7 (0-based), within annotation lines 5-10
            const token = {} as vscode.CancellationToken;

            const hover = await hoverProvider.provideHover(mockDocument, position, token);

            assert.strictEqual(hover !== undefined, true, 'Should provide hover for annotated position');
            assert.strictEqual(hover!.contents.length, 1, 'Should have hover content');
            
            const content = hover!.contents[0] as vscode.MarkdownString;
            assert.strictEqual(content.value.includes('🤖 **AI-Generated Code Block**'), true, 'Should show AI annotation header');
            assert.strictEqual(content.value.includes('**Lines:** 5-10'), true, 'Should show line range');
            assert.strictEqual(content.value.includes('🗑️ Remove AI Annotation'), true, 'Should show removal option');
        });

        test('should return undefined when position is not within any annotation', async () => {
            const position = new vscode.Position(12, 5); // Line 13, not within any annotation
            const token = {} as vscode.CancellationToken;

            const hover = await hoverProvider.provideHover(mockDocument, position, token);

            assert.strictEqual(hover, undefined, 'Should not provide hover for non-annotated position');
        });

        test('should find annotation at exact boundary positions', async () => {
            // Test at start of annotation (line 5, 0-based = line 4)
            const startPosition = new vscode.Position(4, 0);
            const startHover = await hoverProvider.provideHover(mockDocument, startPosition, {} as vscode.CancellationToken);
            assert.strictEqual(startHover !== undefined, true, 'Should provide hover at annotation start');

            // Test at end of annotation (line 10, 0-based = line 9)
            const endPosition = new vscode.Position(9, 10);
            const endHover = await hoverProvider.provideHover(mockDocument, endPosition, {} as vscode.CancellationToken);
            assert.strictEqual(endHover !== undefined, true, 'Should provide hover at annotation end');
        });

        test('should handle single-line annotations', async () => {
            const position = new vscode.Position(14, 5); // Line 15 (0-based), single-line annotation
            const hover = await hoverProvider.provideHover(mockDocument, position, {} as vscode.CancellationToken);

            assert.strictEqual(hover !== undefined, true, 'Should provide hover for single-line annotation');
            
            const content = hover!.contents[0] as vscode.MarkdownString;
            assert.strictEqual(content.value.includes('**Lines:** 15-15'), true, 'Should show single line range');
        });
    });

    suite('Selection-Based Hover Behavior', () => {
        test('should show only full removal when no text is selected', async () => {
            // Empty selection (cursor position)
            mockEditor.selection = new vscode.Selection(6, 10, 6, 10);
            
            const position = new vscode.Position(6, 10);
            const hover = await hoverProvider.provideHover(mockDocument, position, {} as vscode.CancellationToken);

            const content = hover!.contents[0] as vscode.MarkdownString;
            assert.strictEqual(content.value.includes('🗑️ Remove AI Annotation'), true, 'Should show full removal option');
            assert.strictEqual(content.value.includes('🎯 Remove Selected Lines'), false, 'Should not show partial removal option');
        });

        test('should show both partial and full removal when selection is within annotation', async () => {
            // Selection within annotation (lines 6-8, 0-based = lines 7-9 in 1-based)
            mockEditor.selection = new vscode.Selection(5, 0, 7, 10);
            
            const position = new vscode.Position(6, 10);
            const hover = await hoverProvider.provideHover(mockDocument, position, {} as vscode.CancellationToken);

            const content = hover!.contents[0] as vscode.MarkdownString;
            assert.strictEqual(content.value.includes('**Remove Options:**'), true, 'Should show remove options header');
            assert.strictEqual(content.value.includes('🎯 Remove Selected Lines (6-8)'), true, 'Should show partial removal option');
            assert.strictEqual(content.value.includes('🗑️ Remove Entire Block'), true, 'Should show full removal option');
        });

        test('should show hint when selection is outside annotation', async () => {
            // Selection outside annotation (lines 2-3)
            mockEditor.selection = new vscode.Selection(1, 0, 2, 10);
            
            const position = new vscode.Position(6, 10); // Still hover within annotation
            const hover = await hoverProvider.provideHover(mockDocument, position, {} as vscode.CancellationToken);

            const content = hover!.contents[0] as vscode.MarkdownString;
            assert.strictEqual(content.value.includes('🗑️ Remove AI Annotation'), true, 'Should show full removal option');
            assert.strictEqual(content.value.includes('💡 Select text within this annotation block'), true, 'Should show hint message');
        });

        test('should handle selection boundaries correctly', async () => {
            // Selection that exactly matches annotation boundaries
            mockEditor.selection = new vscode.Selection(4, 0, 9, 10); // Lines 5-10 (1-based)
            
            const position = new vscode.Position(6, 10);
            const hover = await hoverProvider.provideHover(mockDocument, position, {} as vscode.CancellationToken);

            const content = hover!.contents[0] as vscode.MarkdownString;
            assert.strictEqual(content.value.includes('🎯 Remove Selected Lines (5-10)'), true, 'Should handle full annotation selection');
        });
    });

    suite('Hover Content Generation', () => {
        test('should generate correct markdown structure', async () => {
            const position = new vscode.Position(6, 10);
            const hover = await hoverProvider.provideHover(mockDocument, position, {} as vscode.CancellationToken);

            const content = hover!.contents[0] as vscode.MarkdownString;
            
            // Check markdown properties
            assert.strictEqual(content.isTrusted, true, 'Should trust markdown for command links');
            assert.strictEqual(content.supportHtml, true, 'Should support HTML');
            
            // Check content structure
            assert.strictEqual(content.value.includes('🤖 **AI-Generated Code Block**'), true, 'Should have header');
            assert.strictEqual(content.value.includes('**Lines:** 5-10'), true, 'Should show line range');
            assert.strictEqual(content.value.includes('**Timestamp:**'), true, 'Should show timestamp');
            assert.strictEqual(content.value.includes('**Type:** ai-generated'), true, 'Should show type');
        });

        test('should format timestamp correctly', async () => {
            const position = new vscode.Position(6, 10);
            const hover = await hoverProvider.provideHover(mockDocument, position, {} as vscode.CancellationToken);

            const content = hover!.contents[0] as vscode.MarkdownString;
            
            // Should contain formatted date (exact format may vary by locale)
            assert.strictEqual(content.value.includes('**Timestamp:**'), true, 'Should include timestamp label');
            assert.strictEqual(content.value.includes('2023'), true, 'Should include year from timestamp');
        });

        test('should generate valid command links', async () => {
            const position = new vscode.Position(6, 10);
            const hover = await hoverProvider.provideHover(mockDocument, position, {} as vscode.CancellationToken);

            const content = hover!.contents[0] as vscode.MarkdownString;
            
            // Check for command link structure
            assert.strictEqual(content.value.includes('command:your-code-my-code.unannotateBlock?'), true, 'Should have command link');
            
            // Should contain encoded JSON parameters
            const hasEncodedParams = content.value.includes('%22uri%22') || content.value.includes('"uri"');
            assert.strictEqual(hasEncodedParams, true, 'Should have encoded command parameters');
        });

        test('should create correct hover range', async () => {
            const position = new vscode.Position(6, 10);
            const hover = await hoverProvider.provideHover(mockDocument, position, {} as vscode.CancellationToken);

            const range = hover!.range;
            assert.strictEqual(range !== undefined, true, 'Should have hover range');
            
            // Range should cover the entire annotation (lines 5-10, converted to 0-based: 4-9)
            assert.strictEqual(range!.start.line, 4, 'Should start at annotation start line (0-based)');
            assert.strictEqual(range!.end.line, 9, 'Should end at annotation end line (0-based)');
            assert.strictEqual(range!.start.character, 0, 'Should start at beginning of line');
        });
    });

    suite('Position & Range Calculations', () => {
        test('should convert position coordinates correctly', () => {
            // Test the private findAnnotationAtPosition method through public interface
            const position = new vscode.Position(6, 10); // 0-based line 6 = 1-based line 7
            
            // This should find the annotation at lines 5-10 (1-based)
            const findMethod = (hoverProvider as any).findAnnotationAtPosition;
            const annotations = [
                {
                    startLine: 5,
                    endLine: 10,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ] as Annotation[];
            
            const result = findMethod.call(hoverProvider, annotations, position);
            assert.strictEqual(result !== undefined, true, 'Should find annotation for position');
            assert.strictEqual(result.startLine, 5, 'Should return correct annotation');
        });

        test('should handle edge positions correctly', () => {
            const findMethod = (hoverProvider as any).findAnnotationAtPosition;
            const annotations = [
                {
                    startLine: 5,
                    endLine: 10,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                }
            ] as Annotation[];

            // Test just before annotation
            const beforePosition = new vscode.Position(3, 0); // Line 4 (1-based)
            const beforeResult = findMethod.call(hoverProvider, annotations, beforePosition);
            assert.strictEqual(beforeResult, undefined, 'Should not find annotation before range');

            // Test just after annotation
            const afterPosition = new vscode.Position(10, 0); // Line 11 (1-based)
            const afterResult = findMethod.call(hoverProvider, annotations, afterPosition);
            assert.strictEqual(afterResult, undefined, 'Should not find annotation after range');
        });

        test('should handle overlapping annotations', () => {
            const findMethod = (hoverProvider as any).findAnnotationAtPosition;
            const annotations = [
                {
                    startLine: 5,
                    endLine: 10,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    type: 'ai-generated'
                },
                {
                    startLine: 8,
                    endLine: 12,
                    timestamp: '2023-01-01T01:00:00.000Z',
                    type: 'ai-generated'
                }
            ] as Annotation[];

            const position = new vscode.Position(8, 0); // Line 9 (1-based), overlaps both
            const result = findMethod.call(hoverProvider, annotations, position);
            
            // Should return the first matching annotation
            assert.strictEqual(result !== undefined, true, 'Should find annotation in overlap');
            assert.strictEqual(result.startLine, 5, 'Should return first matching annotation');
        });
    });

    suite('Command Registration & Execution', () => {
        test('should register hover provider for supported languages', () => {
            const registerHoverStub = sinon.stub(vscode.languages, 'registerHoverProvider');
            registerHoverStub.returns({ dispose: sinon.stub() });
            vscodeStubs.push(registerHoverStub);

            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            registerCommandStub.returns({ dispose: sinon.stub() });
            vscodeStubs.push(registerCommandStub);

            registerHoverProvider(mockContext);

            // Should register for multiple languages
            const expectedLanguages = [
                'typescript', 'javascript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust'
            ];
            
            assert.strictEqual(registerHoverStub.callCount, expectedLanguages.length, 'Should register for all supported languages');
            
            // Check that each language was registered
            expectedLanguages.forEach((language, index) => {
                const callArgs = registerHoverStub.getCall(index).args;
                const selector = callArgs[0] as vscode.DocumentSelector;
                assert.strictEqual((selector as any).language, language, `Should register for ${language}`);
                assert.strictEqual((selector as any).scheme, 'file', 'Should register for file scheme');
            });
        });

        test('should register annotation removal commands', () => {
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            registerCommandStub.returns({ dispose: sinon.stub() });
            vscodeStubs.push(registerCommandStub);

            registerHoverProvider(mockContext);

            // Should register both commands
            const commandNames = registerCommandStub.getCalls().map(call => call.args[0]);
            assert.strictEqual(commandNames.includes('your-code-my-code.unannotateBlock'), true, 'Should register unannotate command');
            assert.strictEqual(commandNames.includes('your-code-my-code.removePartialAnnotation'), true, 'Should register partial removal command');
        });

        test('should add disposables to context subscriptions', () => {
            const mockDisposable = { dispose: sinon.stub() };
            const registerHoverStub = sinon.stub(vscode.languages, 'registerHoverProvider');
            registerHoverStub.returns(mockDisposable);
            vscodeStubs.push(registerHoverStub);

            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            registerCommandStub.returns(mockDisposable);
            vscodeStubs.push(registerCommandStub);

            const initialSubscriptionCount = mockContext.subscriptions.length;
            registerHoverProvider(mockContext);

            // Should add disposables to context
            assert.strictEqual(mockContext.subscriptions.length > initialSubscriptionCount, true, 'Should add disposables to context');
        });
    });

    suite('Annotation Removal Logic', () => {
        test('should execute unannotate command with correct parameters', async () => {
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            vscodeStubs.push(showInfoStub);

            // Get the command handler
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            let unannotateHandler: Function;
            registerCommandStub.callsFake((commandName, handler) => {
                if (commandName === 'your-code-my-code.unannotateBlock') {
                    unannotateHandler = handler;
                }
                return { dispose: sinon.stub() };
            });
            vscodeStubs.push(registerCommandStub);

            registerHoverProvider(mockContext);

            // Execute command with test parameters
            const commandArgs = {
                uri: '/fake/test.ts',
                startLine: 5,
                endLine: 10,
                timestamp: '2023-01-01T00:00:00.000Z'
            };

            await unannotateHandler!(commandArgs);

            // Verify annotation system calls
            const saveSnapshotStub = annotationStubs[1]; // saveSnapshot is second stub
            assert.strictEqual(saveSnapshotStub.calledOnce, true, 'Should save updated snapshot');
            
            // Verify success message
            assert.strictEqual(showInfoStub.calledWith('AI annotation removed successfully'), true, 'Should show success message');
        });

        test('should handle command argument parsing for string parameters', async () => {
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            vscodeStubs.push(showInfoStub);

            // Get the command handler
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            let unannotateHandler: Function;
            registerCommandStub.callsFake((commandName, handler) => {
                if (commandName === 'your-code-my-code.unannotateBlock') {
                    unannotateHandler = handler;
                }
                return { dispose: sinon.stub() };
            });
            vscodeStubs.push(registerCommandStub);

            registerHoverProvider(mockContext);

            // Execute command with encoded string parameters (like from hover link)
            const commandArgs = {
                uri: '/fake/test.ts',
                startLine: 5,
                endLine: 10,
                timestamp: '2023-01-01T00:00:00.000Z'
            };
            const encodedArgs = encodeURIComponent(JSON.stringify(commandArgs));

            await unannotateHandler!(encodedArgs);

            // Should still work with encoded parameters
            assert.strictEqual(showInfoStub.calledWith('AI annotation removed successfully'), true, 'Should handle encoded parameters');
        });

        test('should handle annotation not found error', async () => {
            const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
            vscodeStubs.push(showErrorStub);

            // Mock empty snapshot (no annotations)
            const loadSnapshotStub = annotationStubs[0];
            loadSnapshotStub.returns({
                highlightedRanges: [],
                lastUpdated: '2023-01-01T00:00:00.000Z',
                documentVersion: 1
            });

            // Get the command handler
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            let unannotateHandler: Function;
            registerCommandStub.callsFake((commandName, handler) => {
                if (commandName === 'your-code-my-code.unannotateBlock') {
                    unannotateHandler = handler;
                }
                return { dispose: sinon.stub() };
            });
            vscodeStubs.push(registerCommandStub);

            registerHoverProvider(mockContext);

            const commandArgs = {
                uri: '/fake/test.ts',
                startLine: 5,
                endLine: 10,
                timestamp: '2023-01-01T00:00:00.000Z'
            };

            await unannotateHandler!(commandArgs);

            // Should show error message
            assert.strictEqual(showErrorStub.calledWith('Failed to remove AI annotation'), true, 'Should show error for missing annotation');
        });
    });

    suite('Partial Annotation Removal', () => {
        test('should split annotation when removing middle section', async () => {
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            vscodeStubs.push(showInfoStub);

            // Mock snapshot with annotation that will be split
            const loadSnapshotStub = annotationStubs[0];
            const mockSnapshot = {
                highlightedRanges: [
                    {
                        startLine: 5,
                        endLine: 15, // Large annotation
                        timestamp: '2023-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2023-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            loadSnapshotStub.reset();
            loadSnapshotStub.returns(mockSnapshot);

            // Get the partial removal command handler
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            let partialRemoveHandler: Function;
            registerCommandStub.callsFake((commandName, handler) => {
                if (commandName === 'your-code-my-code.removePartialAnnotation') {
                    partialRemoveHandler = handler;
                }
                return { dispose: sinon.stub() };
            });
            vscodeStubs.push(registerCommandStub);

            registerHoverProvider(mockContext);

            // Remove middle section (lines 8-12)
            const commandArgs = {
                uri: '/fake/test.ts',
                annotationStartLine: 5,
                annotationEndLine: 15,
                removeStartLine: 8,
                removeEndLine: 12,
                timestamp: '2023-01-01T00:00:00.000Z'
            };

            await partialRemoveHandler!(commandArgs);

            // Verify the annotation was modified correctly
            const saveSnapshotStub = annotationStubs[1];
            assert.strictEqual(saveSnapshotStub.calledOnce, true, 'Should save updated snapshot');

            // Should show success message with line range
            const expectedMessage = 'AI annotation removed from lines 8-12';
            assert.strictEqual(showInfoStub.calledWith(expectedMessage), true, 'Should show partial removal success message');
        });

        test('should remove from beginning of annotation', async () => {
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            vscodeStubs.push(showInfoStub);

            // Reset the mock to use the large annotation for this test
            const loadSnapshotStub = annotationStubs[0];
            const mockSnapshot = {
                highlightedRanges: [
                    {
                        startLine: 5,
                        endLine: 15, // Large annotation
                        timestamp: '2023-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2023-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            loadSnapshotStub.reset();
            loadSnapshotStub.returns(mockSnapshot);

            // Test removing from the beginning (lines 5-7 from annotation 5-15)
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            let partialRemoveHandler: Function;
            registerCommandStub.callsFake((commandName, handler) => {
                if (commandName === 'your-code-my-code.removePartialAnnotation') {
                    partialRemoveHandler = handler;
                }
                return { dispose: sinon.stub() };
            });
            vscodeStubs.push(registerCommandStub);

            registerHoverProvider(mockContext);

            const commandArgs = {
                uri: '/fake/test.ts',
                annotationStartLine: 5,
                annotationEndLine: 15,
                removeStartLine: 5,
                removeEndLine: 7,
                timestamp: '2023-01-01T00:00:00.000Z'
            };

            await partialRemoveHandler!(commandArgs);

            assert.strictEqual(showInfoStub.calledWith('AI annotation removed from lines 5-7'), true, 'Should handle removal from beginning');
        });

        test('should remove from end of annotation', async () => {
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            vscodeStubs.push(showInfoStub);

            // Reset the mock to use the large annotation for this test
            const loadSnapshotStub = annotationStubs[0];
            const mockSnapshot = {
                highlightedRanges: [
                    {
                        startLine: 5,
                        endLine: 15, // Large annotation
                        timestamp: '2023-01-01T00:00:00.000Z',
                        type: 'ai-generated'
                    }
                ],
                lastUpdated: '2023-01-01T00:00:00.000Z',
                documentVersion: 1
            };
            loadSnapshotStub.reset();
            loadSnapshotStub.returns(mockSnapshot);

            // Test removing from the end (lines 13-15 from annotation 5-15)
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            let partialRemoveHandler: Function;
            registerCommandStub.callsFake((commandName, handler) => {
                if (commandName === 'your-code-my-code.removePartialAnnotation') {
                    partialRemoveHandler = handler;
                }
                return { dispose: sinon.stub() };
            });
            vscodeStubs.push(registerCommandStub);

            registerHoverProvider(mockContext);

            const commandArgs = {
                uri: '/fake/test.ts',
                annotationStartLine: 5,
                annotationEndLine: 15,
                removeStartLine: 13,
                removeEndLine: 15,
                timestamp: '2023-01-01T00:00:00.000Z'
            };

            await partialRemoveHandler!(commandArgs);

            assert.strictEqual(showInfoStub.calledWith('AI annotation removed from lines 13-15'), true, 'Should handle removal from end');
        });
    });

    suite('Integration & Error Handling', () => {
        test('should refresh highlighting after annotation removal', async () => {
            // Reset highlighting stub to track calls for this test
            const applyHighlightingStub = highlightingStubs[0];
            applyHighlightingStub.resetHistory();

            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            let unannotateHandler: Function;
            registerCommandStub.callsFake((commandName, handler) => {
                if (commandName === 'your-code-my-code.unannotateBlock') {
                    unannotateHandler = handler;
                }
                return { dispose: sinon.stub() };
            });
            vscodeStubs.push(registerCommandStub);

            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            vscodeStubs.push(showInfoStub);

            registerHoverProvider(mockContext);

            // Mock active editor with matching document
            Object.defineProperty(mockEditor.document, 'uri', {
                value: vscode.Uri.parse('file:///fake/test.ts'),
                writable: true,
                configurable: true
            });

            const commandArgs = {
                uri: 'file:///fake/test.ts',
                startLine: 5,
                endLine: 10,
                timestamp: '2023-01-01T00:00:00.000Z'
            };

            await unannotateHandler!(commandArgs);

            // Should refresh highlighting
            assert.strictEqual(applyHighlightingStub.calledOnce, true, 'Should refresh highlighting after removal');
        });

        test('should handle malformed command arguments', async () => {
            const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
            vscodeStubs.push(showErrorStub);

            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            let unannotateHandler: Function;
            registerCommandStub.callsFake((commandName, handler) => {
                if (commandName === 'your-code-my-code.unannotateBlock') {
                    unannotateHandler = handler;
                }
                return { dispose: sinon.stub() };
            });
            vscodeStubs.push(registerCommandStub);

            registerHoverProvider(mockContext);

            // Execute with malformed arguments
            await unannotateHandler!('invalid-json-string');

            assert.strictEqual(showErrorStub.calledWith('Failed to remove AI annotation'), true, 'Should handle malformed arguments gracefully');
        });

        test('should handle cancellation token', async () => {
            const token = {} as vscode.CancellationToken;
            
            // Mock cancelled token
            Object.defineProperty(token, 'isCancellationRequested', {
                value: true
            });

            const position = new vscode.Position(6, 10);
            const hover = await hoverProvider.provideHover(mockDocument, position, token);

            // Should still work even with cancelled token (our implementation doesn't check it explicitly)
            // But the test verifies the method handles the parameter correctly
            assert.strictEqual(typeof hover, 'object', 'Should handle cancellation token parameter');
        });
    });
});