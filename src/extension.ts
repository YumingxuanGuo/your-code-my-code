// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { handleDocumentOpen } from './documentOpenHandler';
import { handleDocumentChange } from './documentChangeHandler';
import { handleActiveEditorChange } from './activeEditorHandler';
import { initializeHighlighting, disposeHighlighting, reinitializeHighlighting } from './highlightingHandler';
import { heuristicsSystem } from './heuristicsSystem';
import { registerHoverProvider } from './hoverProvider';
import { openConfigFile, initializeConfigFile, refreshConfigCache } from './configuration';


// This method is called when your extension is activated
// Extension is activated automatically when VS Code finishes startup
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "your-code-my-code" is now active!');

	// Initialize highlighting system
	initializeHighlighting();

	// Initialize heuristics system command interception
	heuristicsSystem.setupCommandInterception(context);

	// Register hover provider for un-annotate functionality
	registerHoverProvider(context);

	// Register commands
	const helloWorldCommand = vscode.commands.registerCommand('your-code-my-code.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Your Code, My Code.!');
	});


	// Command to open configuration file
	const openConfigCommand = vscode.commands.registerCommand('your-code-my-code.openConfiguration', async () => {
		await openConfigFile();
	});

	// Command to initialize configuration file
	const initConfigCommand = vscode.commands.registerCommand('your-code-my-code.initializeConfiguration', () => {
		const success = initializeConfigFile();
		if (success) {
			vscode.window.showInformationMessage('Configuration file created successfully');
		} else {
			vscode.window.showErrorMessage('Failed to create configuration file');
		}
	});

	// Register document event handlers using the new direct annotation approach
	const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument((document) => {
		handleDocumentOpen(document).catch((error: any) => {
			console.error('Failed to handle document open:', error);
		});
	});
    
	// Listen for document changes using direct annotation approach
	const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
		handleDocumentChange(event).catch((error: any) => {
			console.error('Failed to handle document change:', error);
			vscode.window.showErrorMessage('Failed to process document changes for AI detection');
		});
	});

	// Listen for active editor changes to apply highlighting
	const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
		handleActiveEditorChange(editor);
	});

	// Watch for configuration file changes to refresh cache and reinitialize highlighting
	const configWatcher = vscode.workspace.createFileSystemWatcher('**/.vscode/your-code-my-code.json');
	configWatcher.onDidChange(() => {
		console.log('Configuration file changed, refreshing cache and reinitializing highlighting');
		
		// Refresh the configuration cache first
		refreshConfigCache();
		
		// Reinitialize highlighting with new configuration
		reinitializeHighlighting();
		
		// Refresh highlighting in all open editors
		vscode.window.visibleTextEditors.forEach(editor => {
			handleActiveEditorChange(editor);
		});
	});
	
	// Also handle config file creation
	configWatcher.onDidCreate(() => {
		console.log('Configuration file created, refreshing cache and initializing highlighting');
		refreshConfigCache();
		reinitializeHighlighting();
		
		// Refresh highlighting in all open editors  
		vscode.window.visibleTextEditors.forEach(editor => {
			handleActiveEditorChange(editor);
		});
	});

	// Command to resume AI detection
	const resumeAIDetectionCommand = vscode.commands.registerCommand('your-code-my-code.resumeAIDetection', () => {
		heuristicsSystem.resumeAIDetection();
	});

	// context.subscriptions.push(helloWorldCommand);
	context.subscriptions.push(openConfigCommand);
	context.subscriptions.push(initConfigCommand);
	context.subscriptions.push(resumeAIDetectionCommand);
	context.subscriptions.push(onDidOpenTextDocument);
	context.subscriptions.push(onDidChangeTextDocument);
	context.subscriptions.push(onDidChangeActiveTextEditor);
	context.subscriptions.push(configWatcher);
}




// This method is called when your extension is deactivated
export function deactivate() {
	// Dispose of highlighting resources
	disposeHighlighting();
	
	// Dispose of heuristics system resources
	heuristicsSystem.dispose();
}
