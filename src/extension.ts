import * as vscode from 'vscode';

const workspaceNoteKey = 'knewt.workspaceNote';

export function activate(context: vscode.ExtensionContext) {
	const provider = new KnewtNotesViewProvider(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(KnewtNotesViewProvider.viewType, provider),
	);
}

export function deactivate() {}

class KnewtNotesViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'knewt.notesView';

	public constructor(private readonly context: vscode.ExtensionContext) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		webviewView.webview.options = {
			enableScripts: true,
		};

		webviewView.webview.html = this.getHtml(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(
			async (message: NoteMessage) => {
				if (message.type === 'saveNote') {
					await this.context.workspaceState.update(workspaceNoteKey, message.text);
				}
			},
			undefined,
			this.context.subscriptions,
		);
	}

	private getHtml(webview: vscode.Webview): string {
		const note = this.context.workspaceState.get<string>(workspaceNoteKey, '');
		const nonce = getNonce();

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<title>Knewt Notes</title>
	<style>
		:root {
			color-scheme: light dark;
		}

		body {
			background: var(--vscode-sideBar-background);
			color: var(--vscode-sideBar-foreground);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			margin: 0;
			padding: 0;
		}

		#note {
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, transparent);
			box-sizing: border-box;
			color: var(--vscode-input-foreground);
			display: block;
			font-family: var(--vscode-editor-font-family);
			font-size: var(--vscode-editor-font-size);
			height: 100vh;
			line-height: 1.45;
			margin: 0;
			min-height: 100vh;
			outline: none;
			padding: 10px;
			resize: none;
			width: 100%;
		}

		#note:focus {
			border-color: var(--vscode-focusBorder);
		}

		#note::placeholder {
			color: var(--vscode-input-placeholderForeground);
		}
	</style>
</head>
<body>
	<textarea id="note" spellcheck="false" placeholder="Workspace notes">${escapeHtml(note)}</textarea>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const note = document.getElementById('note');
		let saveTimer;

		note.addEventListener('input', () => {
			window.clearTimeout(saveTimer);
			saveTimer = window.setTimeout(() => {
				vscode.postMessage({
					type: 'saveNote',
					text: note.value,
				});
			}, 250);
		});
	</script>
</body>
</html>`;
	}
}

type NoteMessage = {
	type: 'saveNote';
	text: string;
};

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function getNonce(): string {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let text = '';

	for (let i = 0; i < 32; i += 1) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}
