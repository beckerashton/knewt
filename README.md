# Knewt

Knewt is a VS Code extension for workspace notes that stay outside the project files. The goal is to let notes sit beside code without changing source files or adding git-visible project artifacts by default.

## Current Features

- Adds a dedicated **Knewt** icon to the VS Code Activity Bar.
- Provides a native VS Code TreeView notes panel with multiple plaintext workspace notes.
- Supports creating, selecting, renaming, and deleting notes.
- Supports creating and renaming note folders.
- Opens notes as editable `knewt:` virtual documents.
- Stores the current note through VS Code extension state, not in the workspace folder.

## Usage

1. Open the Knewt icon in the Activity Bar.
2. Select notes and folders from the Knewt tree.
3. Use the title bar or context menu commands to create notes and folders.
4. Select a note to open it as an editable virtual document.
5. Save the virtual document to persist note text into Knewt extension state.
6. Use context menu commands to rename or delete notes and folders.

## Development

Install dependencies:

```sh
npm install
```

Compile the extension:

```sh
npm run compile
```

Run the extension from VS Code with the generated extension launch configuration.

## Planned Phases

1. Plaintext notes in a sidebar or Activity Bar panel.
2. File-linked notes that automatically follow the active editor.
3. Section-linked notes for symbols such as functions and variables.
4. Inline notes rendered at code lines without editing the source file.
5. Note search.
6. Note organization.

## Design Constraints

- Knewt should not modify workspace files for normal note behavior.
- Storage and UI choices should leave room for file links, symbol links, inline decorations, search, and organization.
- Folders have stable IDs so they can become linkable objects in later phases.
- The note tree uses native VS Code TreeView APIs; note bodies use a `FileSystemProvider` rather than webview textareas.
- Debug or placeholder behavior should be clearly marked and easy to remove.
