import * as vscode from "vscode";

const legacyWorkspaceNoteKey = "knewt.workspaceNote";
const notesStateKey = "knewt.notesState";
const knewtScheme = "knewt";

export function activate(context: vscode.ExtensionContext) {
  const store = new KnewtStore(context);
  const fileSystemProvider = new KnewtFileSystemProvider(store);
  const treeProvider = new KnewtTreeDataProvider(store);
  const treeView = vscode.window.createTreeView("knewt.notesView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(
    store,
    vscode.workspace.registerFileSystemProvider(
      knewtScheme,
      fileSystemProvider,
      {
        isCaseSensitive: true,
      },
    ),
    treeView,
    vscode.commands.registerCommand("knewt.newNote", async (item?: KnewtTreeItem) => {
      const folderId = item?.type === "folder" ? item.id : item?.folderId ?? null;
      const title = await vscode.window.showInputBox({
        placeHolder: "Note name",
        prompt: "Create Knewt note",
        value: store.getNextNoteTitle(),
      });

      if (!title) {
        return;
      }

      const note = await store.createNote(title, folderId);
      await openNote(note);
    }),
    vscode.commands.registerCommand("knewt.newFolder", async () => {
      const title = await vscode.window.showInputBox({
        placeHolder: "Folder name",
        prompt: "Create Knewt folder",
        value: store.getNextFolderTitle(),
      });

      if (!title) {
        return;
      }

      await store.createFolder(title);
    }),
    vscode.commands.registerCommand("knewt.openNote", async (item?: KnewtTreeItem) => {
      if (item?.type !== "note") {
        return;
      }

      const note = store.getNote(item.id);

      if (note) {
        await openNote(note);
      }
    }),
    vscode.commands.registerCommand("knewt.renameItem", async (item?: KnewtTreeItem) => {
      if (!item) {
        return;
      }

      const title = await vscode.window.showInputBox({
        placeHolder: item.type === "folder" ? "Folder name" : "Note name",
        prompt: `Rename Knewt ${item.type}`,
        value: item.title,
      });

      if (!title) {
        return;
      }

      await store.renameItem(item.type, item.id, title);
    }),
    vscode.commands.registerCommand("knewt.deleteItem", async (item?: KnewtTreeItem) => {
      if (!item) {
        return;
      }

      const choice = await vscode.window.showWarningMessage(
        `Delete "${item.title}"?`,
        { modal: true },
        "Delete",
      );

      if (choice !== "Delete") {
        return;
      }

      await store.deleteItem(item.type, item.id);
    }),
  );

  store.onDidChange(() => {
    treeProvider.refresh();
    fileSystemProvider.refresh();
  }, undefined, context.subscriptions);
}

export function deactivate() {}

class KnewtStore implements vscode.Disposable {
  private state: NotesState;
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  public readonly onDidChange = this.changeEmitter.event;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.state = this.getInitialState();
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  public getFolders(): KnewtFolder[] {
    return [...this.state.folders];
  }

  public getRootNotes(): KnewtNote[] {
    return this.getNotesInFolder(null);
  }

  public getNotesInFolder(folderId: string | null): KnewtNote[] {
    return this.state.notes.filter((note) => note.folderId === folderId);
  }

  public getNote(id: string): KnewtNote | undefined {
    return this.state.notes.find((note) => note.id === id);
  }

  public getNoteByUri(uri: vscode.Uri): KnewtNote | undefined {
    return this.getNote(getNoteIdFromUri(uri));
  }

  public getNextNoteTitle(): string {
    return `Note ${this.state.notes.length + 1}`;
  }

  public getNextFolderTitle(): string {
    return `Folder ${this.state.folders.length + 1}`;
  }

  public async createNote(title: string, folderId: string | null): Promise<KnewtNote> {
    const now = new Date().toISOString();
    const note = {
      id: createId("note"),
      folderId,
      title,
      text: "",
      createdAt: now,
      updatedAt: now,
    };

    this.state = {
      ...this.state,
      activeItemId: note.id,
      activeItemType: "note",
      notes: [...this.state.notes, note],
    };
    await this.save();

    return note;
  }

  public async createFolder(title: string): Promise<KnewtFolder> {
    const now = new Date().toISOString();
    const folder = {
      id: createId("folder"),
      title,
      createdAt: now,
      updatedAt: now,
    };

    this.state = {
      ...this.state,
      activeItemId: folder.id,
      activeItemType: "folder",
      folders: [...this.state.folders, folder],
    };
    await this.save();

    return folder;
  }

  public async renameItem(
    type: KnewtItemType,
    id: string,
    title: string,
  ): Promise<void> {
    const now = new Date().toISOString();

    if (type === "folder") {
      this.state = {
        ...this.state,
        folders: this.state.folders.map((folder) =>
          folder.id === id
            ? {
                ...folder,
                title,
                updatedAt: now,
              }
            : folder,
        ),
      };
    } else {
      this.state = {
        ...this.state,
        notes: this.state.notes.map((note) =>
          note.id === id
            ? {
                ...note,
                title,
                updatedAt: now,
              }
            : note,
        ),
      };
    }

    await this.save();
  }

  public async deleteItem(type: KnewtItemType, id: string): Promise<void> {
    if (type === "folder") {
      const notes = this.state.notes.map((note) =>
        note.folderId === id
          ? {
              ...note,
              folderId: null,
            }
          : note,
      );
      const nextNote = notes.find((note) => note.folderId === null) ?? notes[0];

      this.state = {
        ...this.state,
        activeItemId: nextNote.id,
        activeItemType: "note",
        collapsedFolderIds: this.state.collapsedFolderIds.filter(
          (folderId) => folderId !== id,
        ),
        folders: this.state.folders.filter((folder) => folder.id !== id),
        notes,
      };
      await this.save();
      return;
    }

    if (this.state.notes.length <= 1) {
      void vscode.window.showWarningMessage("Knewt must keep at least one note.");
      return;
    }

    const activeIndex = this.state.notes.findIndex((note) => note.id === id);
    const notes = this.state.notes.filter((note) => note.id !== id);
    const nextNote = notes[Math.max(0, activeIndex - 1)] ?? notes[0];

    this.state = {
      ...this.state,
      activeItemId: nextNote.id,
      activeItemType: "note",
      notes,
    };
    await this.save();
  }

  public async updateNoteText(id: string, text: string): Promise<void> {
    const now = new Date().toISOString();

    this.state = {
      ...this.state,
      notes: this.state.notes.map((note) =>
        note.id === id
          ? {
              ...note,
              text,
              updatedAt: now,
            }
          : note,
      ),
    };
    await this.save();
  }

  private async save(): Promise<void> {
    await this.context.workspaceState.update(notesStateKey, normalizeNotesState(this.state));
    this.changeEmitter.fire();
  }

  private getInitialState(): NotesState {
    const state = this.context.workspaceState.get<StoredNotesState>(notesStateKey);

    if (state) {
      return normalizeNotesState(state);
    }

    const legacyNote = this.context.workspaceState.get<string>(
      legacyWorkspaceNoteKey,
      "",
    );

    return createInitialState(legacyNote);
  }
}

class KnewtTreeDataProvider implements vscode.TreeDataProvider<KnewtTreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<
    KnewtTreeItem | undefined | null | void
  >();

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(private readonly store: KnewtStore) {}

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public getTreeItem(item: KnewtTreeItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      item.title,
      item.type === "folder"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    treeItem.id = item.id;
    treeItem.contextValue = item.type === "folder" ? "knewtFolder" : "knewtNote";
    treeItem.iconPath = new vscode.ThemeIcon(
      item.type === "folder" ? "folder" : "note",
    );
    treeItem.tooltip = item.title;

    if (item.type === "note") {
      treeItem.command = {
        command: "knewt.openNote",
        title: "Open Note",
        arguments: [item],
      };
    }

    return treeItem;
  }

  public getChildren(item?: KnewtTreeItem): KnewtTreeItem[] {
    if (item?.type === "folder") {
      return this.store.getNotesInFolder(item.id).map(noteToTreeItem);
    }

    if (item) {
      return [];
    }

    return [
      ...this.store.getFolders().map(folderToTreeItem),
      ...this.store.getRootNotes().map(noteToTreeItem),
    ];
  }
}

class KnewtFileSystemProvider implements vscode.FileSystemProvider {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

  public readonly onDidChangeFile = this.changeEmitter.event;

  public constructor(private readonly store: KnewtStore) {}

  public refresh(): void {
    this.changeEmitter.fire([
      {
        type: vscode.FileChangeType.Changed,
        uri: rootUri(),
      },
    ]);
  }

  public watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  public stat(uri: vscode.Uri): vscode.FileStat {
    if (uri.path === "/") {
      return {
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: Date.now(),
        size: 0,
      };
    }

    const note = this.store.getNoteByUri(uri);

    if (!note) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const updatedAt = Date.parse(note.updatedAt);
    const createdAt = Date.parse(note.createdAt);

    return {
      type: vscode.FileType.File,
      ctime: Number.isNaN(createdAt) ? 0 : createdAt,
      mtime: Number.isNaN(updatedAt) ? 0 : updatedAt,
      size: Buffer.byteLength(note.text),
    };
  }

  public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    if (uri.path !== "/") {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    return this.store.getRootNotes().map<[string, vscode.FileType]>((note) => [
      getNoteFileName(note),
      vscode.FileType.File,
    ]);
  }

  public createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions("Use Knewt: New Folder.");
  }

  public readFile(uri: vscode.Uri): Uint8Array {
    const note = this.store.getNoteByUri(uri);

    if (!note) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    return Buffer.from(note.text);
  }

  public async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    const note = this.store.getNoteByUri(uri);

    if (!note) {
      if (options.create) {
        throw vscode.FileSystemError.NoPermissions("Use Knewt: New Note.");
      }

      throw vscode.FileSystemError.FileNotFound(uri);
    }

    if (!options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    await this.store.updateNoteText(note.id, Buffer.from(content).toString("utf8"));
    this.changeEmitter.fire([
      {
        type: vscode.FileChangeType.Changed,
        uri,
      },
    ]);
  }

  public delete(): void {
    throw vscode.FileSystemError.NoPermissions("Use the Knewt tree to delete notes.");
  }

  public rename(): void {
    throw vscode.FileSystemError.NoPermissions("Use the Knewt tree to rename notes.");
  }
}

type StoredNotesState = Partial<NotesState> & {
  activeNoteId?: string;
};

type NotesState = {
  activeItemId: string;
  activeItemType: KnewtItemType;
  collapsedFolderIds: string[];
  folders: KnewtFolder[];
  notes: KnewtNote[];
};

type KnewtItemType = "folder" | "note";

type KnewtFolder = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type KnewtNote = {
  id: string;
  folderId: string | null;
  title: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

type KnewtTreeItem =
  | {
      type: "folder";
      id: string;
      title: string;
    }
  | {
      type: "note";
      id: string;
      folderId: string | null;
      title: string;
    };

async function openNote(note: KnewtNote): Promise<void> {
  const document = await vscode.workspace.openTextDocument(noteUri(note));
  await vscode.window.showTextDocument(document, {
    preview: false,
  });
}

function folderToTreeItem(folder: KnewtFolder): KnewtTreeItem {
  return {
    type: "folder",
    id: folder.id,
    title: folder.title,
  };
}

function noteToTreeItem(note: KnewtNote): KnewtTreeItem {
  return {
    type: "note",
    id: note.id,
    folderId: note.folderId,
    title: note.title,
  };
}

function normalizeNotesState(state: StoredNotesState): NotesState {
  if (!Array.isArray(state.notes) || state.notes.length === 0) {
    return createInitialState("");
  }

  const now = new Date().toISOString();
  const folders = Array.isArray(state.folders)
    ? state.folders.map((folder, index) => ({
        id: folder.id || `folder-${index + 1}`,
        title: folder.title || `Folder ${index + 1}`,
        createdAt: folder.createdAt || now,
        updatedAt: folder.updatedAt || now,
      }))
    : [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  const notes = state.notes.map((note, index) => ({
    id: note.id || `note-${index + 1}`,
    folderId: note.folderId && folderIds.has(note.folderId) ? note.folderId : null,
    title: note.title || `Note ${index + 1}`,
    text: note.text || "",
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || now,
  }));
  const activeItem = getNormalizedActiveItem(state, notes, folders);

  return {
    activeItemId: activeItem.id,
    activeItemType: activeItem.type,
    collapsedFolderIds: Array.isArray(state.collapsedFolderIds)
      ? state.collapsedFolderIds.filter((id) => folderIds.has(id))
      : [],
    folders,
    notes,
  };
}

function getNormalizedActiveItem(
  state: StoredNotesState,
  notes: KnewtNote[],
  folders: KnewtFolder[],
): { id: string; type: KnewtItemType } {
  const activeItemId = state.activeItemId;
  const activeNoteId = state.activeNoteId;

  if (
    activeItemId &&
    state.activeItemType === "folder" &&
    folders.some((folder) => folder.id === activeItemId)
  ) {
    return {
      id: activeItemId,
      type: "folder",
    };
  }

  if (
    activeItemId &&
    state.activeItemType === "note" &&
    notes.some((note) => note.id === activeItemId)
  ) {
    return {
      id: activeItemId,
      type: "note",
    };
  }

  if (activeNoteId && notes.some((note) => note.id === activeNoteId)) {
    return {
      id: activeNoteId,
      type: "note",
    };
  }

  return {
    id: notes[0].id,
    type: "note",
  };
}

function createInitialState(text: string): NotesState {
  const now = new Date().toISOString();
  const note = {
    id: "note-1",
    folderId: null,
    title: "Workspace note",
    text,
    createdAt: now,
    updatedAt: now,
  };

  return {
    activeItemId: note.id,
    activeItemType: "note",
    collapsedFolderIds: [],
    folders: [],
    notes: [note],
  };
}

function noteUri(note: KnewtNote): vscode.Uri {
  return vscode.Uri.from({
    scheme: knewtScheme,
    path: `/${getNoteFileName(note)}`,
  });
}

function rootUri(): vscode.Uri {
  return vscode.Uri.from({
    scheme: knewtScheme,
    path: "/",
  });
}

function getNoteIdFromUri(uri: vscode.Uri): string {
  const match = /--([a-z0-9-]+)\.md$/i.exec(uri.path);

  return match ? match[1] : "";
}

function getNoteFileName(note: KnewtNote): string {
  return `${sanitizeFileName(note.title)}--${note.id}.md`;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-") || "Untitled note";
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
