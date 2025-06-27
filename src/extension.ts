import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

function getWorktreeName(workspacePath: string): string | undefined {
  try {
    const gitPath = path.join(workspacePath, ".git");

    if (!fs.existsSync(gitPath)) {
      return undefined;
    }

    const stats = fs.statSync(gitPath);

    if (stats.isFile()) {
      const gitFileContent = fs.readFileSync(gitPath, "utf8").trim();
      const match = gitFileContent.match(/^gitdir: (.+)$/);

      if (match) {
        const gitDirPath = match[1];
        const worktreeMatch = gitDirPath.match(/\.git[/\\]worktrees[/\\]([^/\\]+)$/);

        if (worktreeMatch) {
          return worktreeMatch[1];
        }
      }
    }

    return undefined;
  } catch (error) {
    console.error("Error getting worktree name:", error);
    return undefined;
  }
}

class WorktreeVariableProvider {
  private worktreeName: string | undefined;

  constructor() {
    this.updateWorktreeName();
  }

  updateWorktreeName() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.worktreeName = undefined;
      return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    this.worktreeName = getWorktreeName(workspacePath);
  }

  getWorktreeName(): string {
    return this.worktreeName || "";
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Window Title Extension is now active!");

  const provider = new WorktreeVariableProvider();
  let isSettingTitle = false;

  const replaceVariables = (template: string): string => {
    const activeEditor = vscode.window.activeTextEditor;
    const workspace = vscode.workspace.workspaceFolders?.[0];

    const replacements: Record<string, string> = {
      "${worktreeName}": provider.getWorktreeName(),
      "${activeEditorShort}": activeEditor ? path.basename(activeEditor.document.fileName) : "",
      "${activeEditorMedium}": activeEditor
        ? vscode.workspace.asRelativePath(activeEditor.document.fileName)
        : "",
      "${activeEditorLong}": activeEditor ? activeEditor.document.fileName : "",
      "${rootName}": workspace ? path.basename(workspace.uri.fsPath) : "",
      "${rootPath}": workspace ? workspace.uri.fsPath : "",
      "${folderName}": workspace ? workspace.name : "",
      "${folderPath}": workspace ? workspace.uri.fsPath : "",
      "${separator}": " - ",
      "${dirty}": activeEditor?.document.isDirty ? "●" : "",
    };

    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), value);
    }

    result = result.replace(/\s*-\s*-\s*/g, " - ");
    result = result.replace(/^\s*-\s*/, "");
    result = result.replace(/\s*-\s*$/, "");

    return result;
  };

  const updateTitle = () => {
    if (isSettingTitle) return;

    provider.updateWorktreeName();

    const config = vscode.workspace.getConfiguration("windowTitleExtension");
    const template =
      config.get<string>("template") ||
      "${activeEditorShort}${separator}${rootName}${separator}${worktreeName}";
    const processedTitle = replaceVariables(template);

    const currentProcessedTitle = (vscode.window as any).title || "";
    if (currentProcessedTitle !== processedTitle) {
      isSettingTitle = true;
      setTimeout(() => {
        const setWindowTitle = (vscode.window as any).setWindowTitle;
        if (setWindowTitle) {
          setWindowTitle(processedTitle);
        } else {
          const terminal = vscode.window.createTerminal({
            name: "Window Title Setter",
            hideFromUser: true,
          });
          terminal.sendText(`echo -ne "\033]0;${processedTitle}\007"`);
          setTimeout(() => terminal.dispose(), 100);
        }
        isSettingTitle = false;
      }, 0);
    }
  };

  const debounce = (func: () => void, wait: number) => {
    let timeout: NodeJS.Timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(func, wait);
    };
  };

  const debouncedUpdateTitle = debounce(updateTitle, 100);

  debouncedUpdateTitle();

  const watcher = vscode.workspace.createFileSystemWatcher("**/.git");
  context.subscriptions.push(watcher);

  watcher.onDidCreate(debouncedUpdateTitle);
  watcher.onDidChange(debouncedUpdateTitle);
  watcher.onDidDelete(debouncedUpdateTitle);

  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("windowTitleExtension.template")) {
      debouncedUpdateTitle();
    }
  });
  context.subscriptions.push(configWatcher);

  const folderWatcher = vscode.workspace.onDidChangeWorkspaceFolders(debouncedUpdateTitle);
  context.subscriptions.push(folderWatcher);

  const activeEditorWatcher = vscode.window.onDidChangeActiveTextEditor(debouncedUpdateTitle);
  context.subscriptions.push(activeEditorWatcher);

  const saveWatcher = vscode.workspace.onDidSaveTextDocument(debouncedUpdateTitle);
  context.subscriptions.push(saveWatcher);

  const dirtyWatcher = vscode.workspace.onDidChangeTextDocument(debouncedUpdateTitle);
  context.subscriptions.push(dirtyWatcher);
}

export function deactivate() {}
