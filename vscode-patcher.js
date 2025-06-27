#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// VSCodeのインストールパスを検出
function findVSCodeInstallation() {
    const platform = process.platform;
    let basePaths = [];
    
    if (platform === 'darwin') {
        basePaths = [
            '/Applications/Visual Studio Code.app/Contents/Resources/app',
            '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app'
        ];
    } else if (platform === 'win32') {
        basePaths = [
            path.join(process.env.PROGRAMFILES, 'Microsoft VS Code/resources/app'),
            path.join(process.env.LOCALAPPDATA, 'Programs/Microsoft VS Code/resources/app')
        ];
    } else {
        basePaths = [
            '/usr/share/code/resources/app',
            '/opt/visual-studio-code/resources/app'
        ];
    }
    
    for (const basePath of basePaths) {
        if (fs.existsSync(basePath)) {
            return basePath;
        }
    }
    
    throw new Error('VSCode installation not found');
}

// メインのworkbenchファイルを特定
function findWorkbenchFile(appPath) {
    const possiblePaths = [
        'out/vs/workbench/workbench.desktop.main.js',
        'out/vs/code/electron-sandbox/workbench/workbench.js'
    ];
    
    for (const relativePath of possiblePaths) {
        const fullPath = path.join(appPath, relativePath);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
    }
    
    throw new Error('Workbench file not found');
}

// worktree名を取得する関数を注入
function injectWorktreeSupport(filePath) {
    console.log(`Patching: ${filePath}`);
    
    // バックアップを作成
    const backupPath = filePath + '.backup';
    if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(filePath, backupPath);
        console.log(`Backup created: ${backupPath}`);
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 既にパッチ済みかチェック
    if (content.includes('getWorktreeName')) {
        console.log('Already patched!');
        return;
    }
    
    // worktree検出関数を追加
    const worktreeCode = `
// Worktree support injection
function getWorktreeName() {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // ワークスペースフォルダを取得（contextServiceから）
        if (typeof contextService !== 'undefined' && contextService.getWorkspace) {
            const workspace = contextService.getWorkspace();
            if (workspace && workspace.folders && workspace.folders.length > 0) {
                const workspacePath = workspace.folders[0].uri.fsPath;
                const gitPath = path.join(workspacePath, '.git');
                
                if (fs.existsSync(gitPath)) {
                    const stats = fs.statSync(gitPath);
                    if (stats.isFile()) {
                        const gitContent = fs.readFileSync(gitPath, 'utf8').trim();
                        const match = gitContent.match(/^gitdir: (.+)$/);
                        if (match) {
                            const worktreeMatch = match[1].match(/\\.git[\\/\\\\]worktrees[\\/\\\\]([^\\/\\\\]+)$/);
                            if (worktreeMatch) {
                                return worktreeMatch[1];
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Worktree detection error:', error);
    }
    return '';
}
`;
    
    // 変数置換処理を拡張
    const replacementPattern = /(\\${separator}.*?[,;])/;
    const replacement = `$1.replace(/\\$\\{worktreeName\\}/g, getWorktreeName())`;
    
    // 複数のパターンを試す
    const patterns = [
        /(\\.replace\(\\/\\\$\\\{separator\\\}\\/g[^}]+\}[^}]*\})/,
        /(\\.replace\(\\/\\\$\\\{dirty\\\}\\/g[^}]+\})/,
        /(template\s*=\s*template\s*\.[^;]+;)/
    ];
    
    let patched = false;
    for (const pattern of patterns) {
        if (pattern.test(content)) {
            content = content.replace(pattern, `$1.replace(/\\$\\{worktreeName\\}/g, getWorktreeName())`);
            patched = true;
            break;
        }
    }
    
    if (!patched) {
        // フォールバック：ファイルの最初に関数を追加し、グローバルにする
        content = worktreeCode + '\nglobal.getWorktreeName = getWorktreeName;\n' + content;
        
        // String.prototype.replaceを拡張
        const stringExtension = `
        const originalReplace = String.prototype.replace;
        String.prototype.replace = function(searchValue, replaceValue) {
            let result = originalReplace.call(this, searchValue, replaceValue);
            if (typeof searchValue === 'object' && searchValue.source && searchValue.source.includes('separator')) {
                result = originalReplace.call(result, /\\$\\{worktreeName\\}/g, getWorktreeName());
            }
            return result;
        };
        `;
        content = stringExtension + content;
    } else {
        content = worktreeCode + content;
    }
    
    fs.writeFileSync(filePath, content);
    console.log('VSCode patched successfully!');
    console.log('Restart VSCode to apply changes.');
    console.log('You can now use ${worktreeName} in window.title setting.');
}

// バックアップを復元
function restoreBackup(filePath) {
    const backupPath = filePath + '.backup';
    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        console.log('Backup restored');
    } else {
        console.log('No backup found');
    }
}

// メイン実行
function main() {
    const args = process.argv.slice(2);
    
    try {
        const appPath = findVSCodeInstallation();
        const workbenchPath = findWorkbenchFile(appPath);
        
        if (args.includes('--restore')) {
            restoreBackup(workbenchPath);
        } else {
            injectWorktreeSupport(workbenchPath);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { injectWorktreeSupport, restoreBackup };