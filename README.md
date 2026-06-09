# Knewt

Knewt is a VS Code extension for workspace notes that stay outside the project files. The goal is to let notes sit beside code without changing source files or adding git-visible project artifacts by default.

## Current Features

- Adds a dedicated **Knewt** icon to the VS Code Activity Bar.
- Provides a **Notes** panel with one plaintext workspace note.
- Autosaves note text while editing.
- Stores the current note through VS Code extension state, not in the workspace folder.

## Usage

1. Open the Knewt icon in the Activity Bar.
2. Type notes in the **Notes** panel.
3. Leave the panel or switch files as needed; note text is autosaved.

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
- Debug or placeholder behavior should be clearly marked and easy to remove.
