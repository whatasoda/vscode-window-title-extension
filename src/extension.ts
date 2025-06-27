import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

function getWorktreeName(workspacePath: string): string | undefined {
    try {
        const gitPath = path.join(workspacePath, '.git');
        
        if (!fs.existsSync(gitPath)) {
            return undefined;
        }

        const stats = fs.statSync(gitPath);
        
        if (stats.isFile()) {
            const gitFileContent = fs.readFileSync(gitPath, 'utf8').trim();
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
        console.error('Error getting worktree name:', error);
        return undefined;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Window Title Extension is now active!');

    let originalTitle: string | undefined;
    let currentWorktreeName: string | undefined;

    const updateWindowTitle = async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const worktreeName = getWorktreeName(workspacePath);
        currentWorktreeName = worktreeName;

        const windowConfig = vscode.workspace.getConfiguration('window');
        const currentTitle = windowConfig.get<string>('title');
        
        if (!originalTitle && currentTitle && !currentTitle.includes('${worktreeName}')) {
            originalTitle = currentTitle;
        }

        const config = vscode.workspace.getConfiguration('windowTitleExtension');
        let template = config.get<string>('template') || '${activeEditorShort}${separator}${rootName}${separator}${worktreeName}';

        if (worktreeName) {
            template = template.replace(/\$\{worktreeName\}/g, worktreeName);
        } else {
            template = template.replace(/\$\{separator\}\$\{worktreeName\}/g, '');
            template = template.replace(/\$\{worktreeName\}/g, '');
        }

        await vscode.workspace.getConfiguration('window').update('title', template, vscode.ConfigurationTarget.Global);
    };

    updateWindowTitle();

    const watcher = vscode.workspace.createFileSystemWatcher('**/.git');
    context.subscriptions.push(watcher);
    
    watcher.onDidCreate(updateWindowTitle);
    watcher.onDidChange(updateWindowTitle);
    watcher.onDidDelete(updateWindowTitle);

    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('windowTitleExtension.template') || e.affectsConfiguration('window.title')) {
            updateWindowTitle();
        }
    });
    context.subscriptions.push(configWatcher);

    const folderWatcher = vscode.workspace.onDidChangeWorkspaceFolders(updateWindowTitle);
    context.subscriptions.push(folderWatcher);

    const activeEditorWatcher = vscode.window.onDidChangeActiveTextEditor(updateWindowTitle);
    context.subscriptions.push(activeEditorWatcher);

    context.subscriptions.push({
        dispose: async () => {
            if (originalTitle !== undefined) {
                await vscode.workspace.getConfiguration('window').update('title', originalTitle, vscode.ConfigurationTarget.Global);
            }
        }
    });
}

export function deactivate() {}