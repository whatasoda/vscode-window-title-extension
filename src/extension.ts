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

    const updateWindowTitle = () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const worktreeName = getWorktreeName(workspacePath);

        const config = vscode.workspace.getConfiguration('windowTitleExtension');
        let template = config.get<string>('template') || '${activeEditorShort}${separator}${rootName}${separator}${worktreeName}';

        if (worktreeName) {
            template = template.replace(/\$\{worktreeName\}/g, worktreeName);
        } else {
            template = template.replace(/\$\{separator\}\$\{worktreeName\}/g, '');
            template = template.replace(/\$\{worktreeName\}/g, '');
        }

        vscode.workspace.getConfiguration('window').update('title', template, vscode.ConfigurationTarget.Workspace);
    };

    updateWindowTitle();

    const watcher = vscode.workspace.createFileSystemWatcher('**/.git');
    context.subscriptions.push(watcher);
    
    watcher.onDidCreate(updateWindowTitle);
    watcher.onDidChange(updateWindowTitle);
    watcher.onDidDelete(updateWindowTitle);

    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('windowTitleExtension.template')) {
            updateWindowTitle();
        }
    });
    context.subscriptions.push(configWatcher);

    const folderWatcher = vscode.workspace.onDidChangeWorkspaceFolders(updateWindowTitle);
    context.subscriptions.push(folderWatcher);
}

export function deactivate() {}