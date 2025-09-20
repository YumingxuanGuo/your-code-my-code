# Your Code My Code

A VS Code extension that intelligently identifies and highlights AI-generated code contributions. This extension monitors file changes and distinguishes between human-typed code and AI-generated insertions from tools like Claude Code, GitHub Copilot, and other AI assistants.

## Features

- **Smart Detection**: Automatically detects AI-generated code insertions vs. manual typing
- **Visual Highlighting**: Highlights AI-contributed code sections with customizable decorations
- **Persistent Annotations**: Stores AI code markers that persist across VS Code sessions
- **Intelligent Filtering**: Distinguishes between manual paste operations and AI tool insertions
- **User Confirmation**: Optional user confirmation for ambiguous code changes

## Requirements

- VS Code 1.74.0 or higher
- Node.js and npm (for development)

## Extension Settings

This extension will contribute the following settings:

* `yourCodeMyCode.enable`: Enable/disable AI code detection
* `yourCodeMyCode.highlightStyle`: Customize the visual style for AI code highlighting
* `yourCodeMyCode.requireConfirmation`: Require user confirmation for detected AI changes

## Known Issues

- Initial version in development
- Detection accuracy may vary with different AI tools
- Large file changes may require manual verification

## Release Notes

### 0.1.0

Initial development version of Your Code My Code extension.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
