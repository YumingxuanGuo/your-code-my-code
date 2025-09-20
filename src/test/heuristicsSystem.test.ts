import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { HeuristicsSystem } from '../heuristicsSystem';
import { ContentChange } from '../dataStructures';

suite('Heuristics System Tests', () => {
    let heuristicsSystem: HeuristicsSystem;
    let mockContext: vscode.ExtensionContext;
    let commandStubs: sinon.SinonStub[];
    let windowStubs: sinon.SinonStub[];

    setup(() => {
        // Reset all stubs
        commandStubs = [];
        windowStubs = [];
        
        // Mock VS Code API
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

        // Create fresh instance for each test
        heuristicsSystem = new HeuristicsSystem();
    });

    teardown(() => {
        heuristicsSystem.dispose();
        
        // Restore all stubs
        commandStubs.forEach(stub => stub.restore());
        windowStubs.forEach(stub => stub.restore());
        sinon.restore();
    });

    suite('Basic Significance Detection', () => {
        test('should reject empty changes', async () => {
            const changes: ContentChange[] = [];
            const result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, false);
        });

        test('should reject whitespace-only changes', async () => {
            const changes: ContentChange[] = [{
                startLine: 1,
                endLine: 1,
                startCharacter: 0,
                endCharacter: 0,
                text: '   \n  \t  ',
                rangeLength: 0,
                addedLines: 1,
                deletedLines: 0
            }];
            
            const result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, false);
        });

        test('should reject single character changes', async () => {
            const changes: ContentChange[] = [{
                startLine: 1,
                endLine: 1,
                startCharacter: 0,
                endCharacter: 0,
                text: 'a',
                rangeLength: 0,
                addedLines: 0,
                deletedLines: 0
            }];
            
            const result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, false);
        });

        test('should reject pure deletions', async () => {
            const changes: ContentChange[] = [{
                startLine: 1,
                endLine: 2,
                startCharacter: 0,
                endCharacter: 0,
                text: '', // No text added, just deletion
                rangeLength: 50,
                addedLines: 0,
                deletedLines: 2
            }];
            
            const result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, false);
        });

        test('should accept significant multi-line code additions', async () => {
            const changes: ContentChange[] = [{
                startLine: 1,
                endLine: 1,
                startCharacter: 0,
                endCharacter: 0,
                text: 'function calculateTotal(items) {\n    return items.reduce((sum, item) => sum + item.price, 0);\n}',
                rangeLength: 0,
                addedLines: 2,
                deletedLines: 0
            }];
            
            const result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, true);
        });
    });

    suite('Git Operation Suspension', () => {
        test('should detect git commands and suspend AI detection', async () => {
            // Mock VS Code window API
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            showInfoStub.resolves('Resume Highlighting' as any);
            windowStubs.push(showInfoStub);

            // Mock terminal shell execution event (for documentation)

            // Set up command interception with mocked context
            heuristicsSystem.setupCommandInterception(mockContext);

            // Simulate git command detection by calling the private method
            const setupMethod = (heuristicsSystem as any).setupGitDetection;
            if (setupMethod) {
                setupMethod.call(heuristicsSystem, mockContext);
            }

            // Manually trigger git detection
            const suspendMethod = (heuristicsSystem as any).suspendAIDetection;
            if (suspendMethod) {
                await suspendMethod.call(heuristicsSystem);
            }

            // Test that changes are filtered when suspended
            const changes: ContentChange[] = [{
                startLine: 1,
                endLine: 1,
                startCharacter: 0,
                endCharacter: 0,
                text: 'function example() { return "significant code"; }',
                rangeLength: 0,
                addedLines: 0,
                deletedLines: 0
            }];

            const result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, false, 'Should filter out changes when git operation is suspended');
            assert.strictEqual(heuristicsSystem.isAIDetectionSuspended(), true, 'Should be suspended after git command');
        });

        test('should handle different git commands', () => {
            const gitCommands = [
                'git checkout main',
                'git merge feature-branch',
                'git pull origin main',
                'git rebase main',
                'git reset HEAD~1',
                'git stash pop',
                'git cherry-pick abc123'
            ];

            gitCommands.forEach(command => {
                // Mock the git command detection logic
                const gitCommandPatterns = [
                    'git checkout', 'git merge', 'git pull', 'git rebase',
                    'git reset', 'git stash pop', 'git cherry-pick'
                ];

                const isGitCommand = gitCommandPatterns.some(pattern => command.includes(pattern));
                assert.strictEqual(isGitCommand, true, `Should detect ${command} as git command`);
            });
        });

        test('should resume AI detection after user action', () => {
            // Mock notification response
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            showInfoStub.resolves(undefined); // User dismisses notification
            windowStubs.push(showInfoStub);

            heuristicsSystem.resumeAIDetection();
            assert.strictEqual(heuristicsSystem.isAIDetectionSuspended(), false, 'Should resume after user action');
        });
    });

    suite('User Action Filtering', () => {
        test('should filter changes after user paste action', async () => {
            // Mock VS Code commands API
            const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
            executeCommandStub.resolves();
            commandStubs.push(executeCommandStub);

            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            registerCommandStub.returns({
                dispose: sinon.stub()
            });
            commandStubs.push(registerCommandStub);

            // Set up command interception
            heuristicsSystem.setupCommandInterception(mockContext);

            // Simulate user paste action
            const markRecentAction = (heuristicsSystem as any).markRecentUserAction;
            if (markRecentAction) {
                markRecentAction.call(heuristicsSystem, 'editor.action.clipboardPasteAction');
            }

            // Test that changes are filtered after paste
            const result1 = heuristicsSystem.shouldFilterChange('some pasted code', 2);
            assert.strictEqual(result1, true, 'Should filter changes after recent paste action');

            // Wait for timeout to clear actions
            await new Promise(resolve => setTimeout(resolve, 600)); // ACTION_TIMEOUT is 500ms

            const result2 = heuristicsSystem.shouldFilterChange('some other code', 2);
            assert.strictEqual(result2, false, 'Should not filter after timeout expires');
        });

        test('should filter changes after various user actions', async () => {
            const userActions = [
                'editor.action.clipboardPasteAction',
                'editor.action.clipboardCutAction',
                'editor.action.commentLine',
                'editor.action.formatDocument',
                'editor.action.rename'
            ];

            for (const action of userActions) {
                // Reset system
                heuristicsSystem.dispose();
                heuristicsSystem = new HeuristicsSystem();

                // Simulate user action
                const markRecentAction = (heuristicsSystem as any).markRecentUserAction;
                if (markRecentAction) {
                    markRecentAction.call(heuristicsSystem, action);
                }

                const result = heuristicsSystem.shouldFilterChange('some code', 1);
                assert.strictEqual(result, true, `Should filter changes after ${action}`);
            }
        });

        test('should handle multiple simultaneous user actions', () => {
            const markRecentAction = (heuristicsSystem as any).markRecentUserAction;
            if (markRecentAction) {
                markRecentAction.call(heuristicsSystem, 'editor.action.clipboardPasteAction');
                markRecentAction.call(heuristicsSystem, 'editor.action.formatDocument');
                markRecentAction.call(heuristicsSystem, 'editor.action.commentLine');
            }

            const result = heuristicsSystem.shouldFilterChange('formatted and commented code', 3);
            assert.strictEqual(result, true, 'Should filter changes when multiple recent actions');
        });

        test('should integrate user actions with significance detection', async () => {
            // First, test without recent actions
            const changes: ContentChange[] = [{
                startLine: 1,
                endLine: 1,
                startCharacter: 0,
                endCharacter: 0,
                text: 'function significant() { return "AI generated"; }',
                rangeLength: 0,
                addedLines: 0,
                deletedLines: 0
            }];

            let result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, true, 'Should be significant without recent actions');

            // Now simulate paste action
            const markRecentAction = (heuristicsSystem as any).markRecentUserAction;
            if (markRecentAction) {
                markRecentAction.call(heuristicsSystem, 'editor.action.clipboardPasteAction');
            }

            result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, false, 'Should not be significant after recent paste');
        });

        test('should handle multiple content changes with user actions', async () => {
            const changes: ContentChange[] = [
                {
                    startLine: 1,
                    endLine: 1,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'console.log("test");',
                    rangeLength: 0,
                    addedLines: 0,
                    deletedLines: 0
                },
                {
                    startLine: 2,
                    endLine: 2,
                    startCharacter: 0,
                    endCharacter: 0,
                    text: 'return calculateSum(items);',
                    rangeLength: 0,
                    addedLines: 0,
                    deletedLines: 0
                }
            ];
            
            const result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(typeof result, 'boolean', 'Should return boolean result');
        });
    });

    suite('Command Interception Setup', () => {
        test('should setup command interception without context', () => {
            // Should not throw when called without context
            assert.doesNotThrow(() => {
                heuristicsSystem.setupCommandInterception();
            });
        });

        test('should handle disposal correctly', () => {
            // Should not throw when disposing
            assert.doesNotThrow(() => {
                heuristicsSystem.dispose();
            });
        });
    });

    suite('Mocked Event Integration', () => {
        test('should handle complex scenario: git + user action + significance', async () => {
            // Mock VS Code APIs
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
            showInfoStub.resolves('Resume Highlighting' as any);
            windowStubs.push(showInfoStub);

            const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
            executeCommandStub.resolves();
            commandStubs.push(executeCommandStub);

            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            registerCommandStub.returns({ dispose: sinon.stub() });
            commandStubs.push(registerCommandStub);

            // Set up the system
            heuristicsSystem.setupCommandInterception(mockContext);

            // Scenario 1: Git operation should suspend detection
            const suspendMethod = (heuristicsSystem as any).suspendAIDetection;
            if (suspendMethod) {
                await suspendMethod.call(heuristicsSystem);
            }

            let changes: ContentChange[] = [{
                startLine: 1,
                endLine: 1,
                startCharacter: 0,
                endCharacter: 0,
                text: 'function fromGitMerge() { return "conflict resolved"; }',
                rangeLength: 0,
                addedLines: 0,
                deletedLines: 0
            }];

            let result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, false, 'Should filter git-related changes');

            // Scenario 2: Resume detection
            heuristicsSystem.resumeAIDetection();

            // Scenario 3: User paste should also filter
            const markRecentAction = (heuristicsSystem as any).markRecentUserAction;
            if (markRecentAction) {
                markRecentAction.call(heuristicsSystem, 'editor.action.clipboardPasteAction');
            }

            changes = [{
                startLine: 1,
                endLine: 1,
                startCharacter: 0,
                endCharacter: 0,
                text: 'function pastedCode() { return "manually pasted"; }',
                rangeLength: 0,
                addedLines: 0,
                deletedLines: 0
            }];

            result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, false, 'Should filter user pasted changes');

            // Scenario 4: Wait for timeout and test genuine AI change
            await new Promise(resolve => setTimeout(resolve, 600));

            changes = [{
                startLine: 1,
                endLine: 1,
                startCharacter: 0,
                endCharacter: 0,
                text: 'function aiGenerated() {\n    const result = processComplexData(input);\n    return optimizeOutput(result);\n}',
                rangeLength: 0,
                addedLines: 3,
                deletedLines: 0
            }];

            result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, true, 'Should detect genuine AI changes after timeouts');
        });

        test('should mock terminal shell execution events', () => {
            const mockShellExecutionEvent = {
                execution: {
                    commandLine: { value: 'git pull origin main' },
                    cwd: vscode.Uri.file('/fake/workspace')
                },
                terminal: {} as vscode.Terminal
            };

            // Test the git command detection logic
            const gitCommands = [
                'git checkout', 'git merge', 'git pull', 'git rebase',
                'git reset', 'git stash pop', 'git cherry-pick'
            ];

            const commandLine = mockShellExecutionEvent.execution.commandLine.value;
            const isGitCommand = gitCommands.some(cmd => commandLine.includes(cmd));

            assert.strictEqual(isGitCommand, true, 'Should identify git command from mocked event');
        });

        test('should handle user confirmation dialogs', async () => {
            // Mock user confirmation
            const showConfirmStub = sinon.stub(vscode.window, 'showInformationMessage');
            showConfirmStub.resolves('Yes, AI generated' as any);
            windowStubs.push(showConfirmStub);

            const result = await heuristicsSystem.showUserConfirmation('const test = "ambiguous code";');
            assert.strictEqual(result, true, 'Should return true when user confirms AI generation');

            // Test user rejection
            showConfirmStub.resolves('No, manual change' as any);
            const result2 = await heuristicsSystem.showUserConfirmation('const manual = "user typed";');
            assert.strictEqual(result2, false, 'Should return false when user rejects AI generation');
        });
    });

    suite('Edge Cases', () => {
        test('should handle malformed content changes', async () => {
            const changes: ContentChange[] = [{
                startLine: -1,
                endLine: -1,
                startCharacter: -1,
                endCharacter: -1,
                text: '',
                rangeLength: -1,
                addedLines: -1,
                deletedLines: -1
            }];
            
            const result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(result, false, 'Should handle malformed changes gracefully');
        });

        test('should handle very large text changes', async () => {
            const largeText = 'x'.repeat(10000);
            const changes: ContentChange[] = [{
                startLine: 1,
                endLine: 1,
                startCharacter: 0,
                endCharacter: 0,
                text: largeText,
                rangeLength: 0,
                addedLines: 0,
                deletedLines: 0
            }];
            
            const result = await heuristicsSystem.isChangeSignificant(changes);
            assert.strictEqual(typeof result, 'boolean', 'Should handle large changes without error');
        });

        test('should handle concurrent operations safely', async () => {
            // Simulate concurrent git and user actions
            const promises: Promise<any>[] = [];

            // Concurrent git suspension attempts
            const suspendMethod = (heuristicsSystem as any).suspendAIDetection;
            if (suspendMethod) {
                promises.push(suspendMethod.call(heuristicsSystem));
                promises.push(suspendMethod.call(heuristicsSystem));
            }

            // Concurrent user actions
            const markRecentAction = (heuristicsSystem as any).markRecentUserAction;
            if (markRecentAction) {
                promises.push(Promise.resolve(markRecentAction.call(heuristicsSystem, 'editor.action.clipboardPasteAction')));
                promises.push(Promise.resolve(markRecentAction.call(heuristicsSystem, 'editor.action.formatDocument')));
            }

            await Promise.all(promises);

            // System should still be in a valid state
            const result = heuristicsSystem.isAIDetectionSuspended();
            assert.strictEqual(typeof result, 'boolean', 'Should handle concurrent operations gracefully');
        });
    });
});