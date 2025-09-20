# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is "your-code-my-code" - a project for distinguishing AI-generated code. It aims to be a IDE plugin that highlights the code contributed by AI tools, such as Claude Code.

The repository is currently in its initial state with minimal setup.

## Language
Typescript, the standard language for VS Code extension development.

## Workflow
Adhere to the Todo List section below. Modify the list if necessary, but consult with me first.

## Repository Status
- **Current State**: Minimal repository with only README.md
- **Main Branch**: main
- **Development Stage**: Initial/Planning phase

## Todo List

### Milestone 1: Project Setup & "Hello World"
The goal here is to get a basic, runnable extension working to ensure your development environment is set up correctly.

1.  **Install Prerequisites**: Make sure you have **Node.js** and **npm** installed on your system.
2.  **Install Scaffolding Tool**: Open your terminal and install Yeoman and the VS Code Extension Generator by running `npm install -g yo generator-code`.
3.  **Generate a New Project**: In your terminal, run `yo code`. You will be prompted with several questions. Choose the following:
    * `New Extension (TypeScript)`
    * Give it a name (e.g., `ai-code-marker`)
    * Choose a repository name
    * Initialize a git repository
4.  **Run the Extension**: Open the newly created project folder in VS Code. Press **F5** on your keyboard. This will compile your TypeScript code and launch a new "Extension Development Host" instance of VS Code with your plugin installed.
5.  **Test "Hello World"**: In the new VS Code window, open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run the `Hello World` command. You should see a notification pop up.

***

### Milestone 2: Implement the "Watch and Diff" Core Logic
This is the heart of your plugin. The goal is to detect external file changes and identify the modified lines.

1.  **Cache File State**: In your `extension.ts` file, create an in-memory `Map` to store the content of any file a user opens. You'll use the `vscode.workspace.onDidOpenTextDocument` event to populate this cache.
2.  **Add a File Watcher**: Use the `vscode.workspace.createFileSystemWatcher` API to monitor for changes in the workspace (e.g., `**/*.{js,py,ts}`).
3.  **Listen for Document Changes**: Instead of a generic file watcher, use the more detailed `vscode.workspace.onDidChangeTextDocument` event listener. This event provides specific information about *what* changed inside the document.
4.  **Filter Out Keyboard Input**: Inside your event listener, analyze the `event.contentChanges` array. Implement this simple but effective filter:
    * If a change event represents a small insertion (e.g., the added text length is less than 5 characters) and contains no newline characters (`\n`), **it's keyboard input. Ignore it and do nothing.**
5.  **Process Large Changes**: If a change event *passes* the filter (i.e., it's a large, multi-line change), then trigger your diffing logic.
    a. Get the "before" content from your cache.
    b. The "after" content is now the document's current state.
    c. Use a diffing library to get the modified line numbers.
    d. For now, `console.log` the identified lines to confirm your logic is working.

***

### Milestone 3: Storing and Reading Annotation Metadata
Now, you'll make the annotations persistent so they don't disappear when you close VS Code.

1.  **Define a Data Structure**: Decide on a simple JSON format for your annotations file (e.g., an object where keys are file paths and values are arrays of line number ranges).
2.  **Write to File**: Modify your diff logic from Milestone 2. Instead of logging to the console, write the detected line number changes to a file at `.vscode/ai_annotations.json`.
3.  **Read from File**: When a file is opened (`onDidOpenTextDocument`), check if an `ai_annotations.json` file exists. If it does, read it and load the relevant annotations for that file into memory.

***

### Milestone 4: The Visual Component - Highlighting Code
This is where the user sees the result of your work.

1.  **Create a Decoration**: Use `vscode.window.createTextEditorDecorationType` to define what your highlight will look like. You can specify a `backgroundColor`, a `gutterIconPath`, or other styles. 
2.  **Apply the Decoration**: Create a function that takes the line numbers you loaded in Milestone 3 and applies the decoration to the currently active editor using `TextEditor.setDecorations`.
3.  **Trigger the Highlighting**: Call this function whenever a new editor becomes active (`vscode.window.onDidChangeActiveTextEditor`) or after your diff logic has updated the annotations file.

***

### Milestone 5: Add Heuristics & User Confirmation
This final step handles the main edge case: distinguishing a large AI insertion from a large manual paste.

1.  **Listen for the Paste Command**: Use `vscode.commands.registerCommand` to intercept the `editor.action.paste` command. When it's triggered, set a temporary flag, like `let recentlyPasted = true;`, and then unset it after a short delay (e.g., 100ms).
2.  **Refine the Core Filter**: Modify the logic in Milestone 2. Now, when a large change is detected, first check if the `recentlyPasted` flag is true. If it is, ignore the change.
3.  **Implement User Confirmation**: If a large change occurs that was **not** filtered out as typing and was **not** flagged as a paste, it's very likely from an external AI CLI. As a final safety net, you can use `vscode.window.showInformationMessage` to ask the user to confirm.
    > `An external tool modified this file. Was this an AI?`
If the user clicks "Yes," proceed with saving the annotations. If they click "No," do nothing. This gives the user final control and makes your tool much more reliable.
