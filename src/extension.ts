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
        const worktreeMatch = gitDirPath.match(/\.git[\/\\]worktrees[\/\\]([^\/\\]+)$/);

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

export function activate(context: vscode.ExtensionContext) {
  console.log("Window Title Extension is now active!");

  let currentWorktreeName: string | undefined;
  let originalWindowTitle: string | undefined;

  const updateWorktreeName = () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      currentWorktreeName = undefined;
      return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    currentWorktreeName = getWorktreeName(workspacePath);
  };

  const replaceVariables = (template: string): string => {
    const activeEditor = vscode.window.activeTextEditor;
    const workspace = vscode.workspace.workspaceFolders?.[0];

    const replacements: Record<string, string> = {
      "${worktreeName}": currentWorktreeName || "",
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

    // 空のセパレータをクリーンアップ
    result = result.replace(/\s*-\s*-\s*/g, " - ");
    result = result.replace(/^\s*-\s*/, "");
    result = result.replace(/\s*-\s*$/, "");

    return result;
  };

  const updateTitle = async () => {
    updateWorktreeName();

    const windowConfig = vscode.workspace.getConfiguration("window");
    const currentTitle = windowConfig.get<string>("title");

    // 初回実行時に元のタイトルを保存
    if (originalWindowTitle === undefined && currentTitle) {
      originalWindowTitle = currentTitle;
    }

    // 拡張機能が有効な場合のみ処理
    const extensionConfig = vscode.workspace.getConfiguration("windowTitleExtension");
    const isEnabled = extensionConfig.get<boolean>("enabled", true);

    if (!isEnabled) {
      return;
    }

    let templateToUse = originalWindowTitle || "${activeEditorShort}${separator}${rootName}";

    // ${worktreeName}が含まれていない場合は追加
    if (!templateToUse.includes("${worktreeName}") && currentWorktreeName) {
      templateToUse = templateToUse + "${separator}${worktreeName}";
    }

    const processedTitle = replaceVariables(templateToUse);

    // window.titleを更新（Global設定を使用）
    await windowConfig.update("title", processedTitle, vscode.ConfigurationTarget.Global);
  };

  // 初回実行
  updateTitle();

  const watcher = vscode.workspace.createFileSystemWatcher("**/.git");
  context.subscriptions.push(watcher);

  watcher.onDidCreate(updateTitle);
  watcher.onDidChange(updateTitle);
  watcher.onDidDelete(updateTitle);

  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("windowTitleExtension.enabled")) {
      updateTitle();
    }
  });
  context.subscriptions.push(configWatcher);

  const folderWatcher = vscode.workspace.onDidChangeWorkspaceFolders(updateTitle);
  context.subscriptions.push(folderWatcher);

  const activeEditorWatcher = vscode.window.onDidChangeActiveTextEditor(updateTitle);
  context.subscriptions.push(activeEditorWatcher);

  const saveWatcher = vscode.workspace.onDidSaveTextDocument(updateTitle);
  context.subscriptions.push(saveWatcher);

  const dirtyWatcher = vscode.workspace.onDidChangeTextDocument(updateTitle);
  context.subscriptions.push(dirtyWatcher);

  // 拡張機能が無効化されたときに元のタイトルに戻す
  context.subscriptions.push({
    dispose: async () => {
      if (originalWindowTitle !== undefined) {
        await vscode.workspace
          .getConfiguration("window")
          .update("title", originalWindowTitle, vscode.ConfigurationTarget.Global);
      }
    },
  });
}

export function deactivate() {}