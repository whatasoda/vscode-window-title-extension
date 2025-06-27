# VSCodeパッチ方法

## 1. VSCodeソースコードパッチ

### 手順
1. VSCodeのソースをクローン
```bash
git clone https://github.com/microsoft/vscode.git
cd vscode
```

2. worktreeName変数を追加するパッチを作成

### パッチファイル (worktree-variable.patch)

```diff
--- a/src/vs/workbench/browser/parts/titlebar/titlebarPart.ts
+++ b/src/vs/workbench/browser/parts/titlebar/titlebarPart.ts
@@ -15,6 +15,7 @@ import { IStorageService } from 'vs/platform/storage/common/storage';
 import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
 import { IThemeService } from 'vs/platform/theme/common/themeService';
 import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
+import { execSync } from 'child_process';
+import * as path from 'path';
 
 export class TitlebarPart extends Part implements ITitleService {
 
@@ -120,6 +121,24 @@ export class TitlebarPart extends Part implements ITitleService {
 		return this.getWindowTitle();
 	}
 
+	private getWorktreeName(): string {
+		const workspaceFolders = this.contextService.getWorkspace().folders;
+		if (!workspaceFolders || workspaceFolders.length === 0) {
+			return '';
+		}
+
+		try {
+			const workspacePath = workspaceFolders[0].uri.fsPath;
+			const gitPath = path.join(workspacePath, '.git');
+			const gitContent = require('fs').readFileSync(gitPath, 'utf8').trim();
+			const match = gitContent.match(/^gitdir: (.+)$/);
+			if (match) {
+				const worktreeMatch = match[1].match(/\.git[\/\\]worktrees[\/\\]([^\/\\]+)$/);
+				return worktreeMatch ? worktreeMatch[1] : '';
+			}
+		} catch (error) {}
+		return '';
+	}
+
 	private getWindowTitle(): string {
 		let title = this.doGetWindowTitle();
 		if (!title) {
@@ -140,6 +159,7 @@ export class TitlebarPart extends Part implements ITitleService {
 		const activeEditorLong = activeEditor ? activeEditor.resource?.fsPath ?? activeEditor.getName() : '';
 		const activeFolderShort = activeFolder ? activeFolder.name : '';
 		const activeFolderMedium = activeFolder ? activeFolder.uri.fsPath : '';
+		const worktreeName = this.getWorktreeName();
 
 		return template
 			.replace(/\$\{activeEditorShort\}/g, activeEditorShort)
@@ -151,6 +171,7 @@ export class TitlebarPart extends Part implements ITitleService {
 			.replace(/\$\{rootPath\}/g, this.contextService.getWorkspace().folders.length ? this.labelService.getUriLabel(this.contextService.getWorkspace().folders[0].uri) : '')
 			.replace(/\$\{appName\}/g, this.productService.nameLong)
 			.replace(/\$\{remoteName\}/g, Schemas.vscodeRemote)
+			.replace(/\$\{worktreeName\}/g, worktreeName)
 			.replace(/\$\{dirty\}/g, dirty)
 			.replace(/\$\{separator\}/g, this.labelService.getSeparator(activeEditor?.resource?.scheme ?? Schemas.file));
 	}
```

### ビルド手順
```bash
# 依存関係をインストール
yarn install

# ビルド
yarn watch  # または yarn compile
```

## 2. Monkey Patchingアプローチ

### パッチスクリプト (vscode-monkey-patch.js)

```javascript
const fs = require('fs');
const path = require('path');

// VSCodeのインストールパスを検出
function findVSCodePath() {
    const possiblePaths = [
        '/Applications/Visual Studio Code.app/Contents/Resources/app',
        '/usr/share/code',
        path.join(process.env.HOME, '.vscode/extensions'),
        path.join(process.env.APPDATA, 'Code'),
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error('VSCode installation not found');
}

// workbench.desktop.main.jsを修正
function patchWorkbench() {
    const vscodeRoot = findVSCodePath();
    const workbenchPath = path.join(vscodeRoot, 'out/vs/workbench/workbench.desktop.main.js');
    
    let content = fs.readFileSync(workbenchPath, 'utf8');
    
    // worktree検出関数を追加
    const worktreeFunction = `
    function getWorktreeName() {
        try {
            const workspace = contextService.getWorkspace();
            if (!workspace.folders.length) return '';
            
            const gitPath = workspace.folders[0].uri.fsPath + '/.git';
            const gitContent = require('fs').readFileSync(gitPath, 'utf8').trim();
            const match = gitContent.match(/^gitdir: (.+)$/);
            if (match) {
                const worktreeMatch = match[1].match(/\\.git[\/\\\\]worktrees[\/\\\\]([^\/\\\\]+)$/);
                return worktreeMatch ? worktreeMatch[1] : '';
            }
        } catch (e) {}
        return '';
    }
    `;
    
    // 変数置換部分を修正
    content = content.replace(
        /(\\.replace\(\/\\\$\\\{separator\\\}\/g,.*?\))/,
        '$1.replace(/\\${worktreeName}/g, getWorktreeName())'
    );
    
    // 関数を追加
    content = worktreeFunction + content;
    
    fs.writeFileSync(workbenchPath + '.backup', fs.readFileSync(workbenchPath));
    fs.writeFileSync(workbenchPath, content);
    
    console.log('VSCode patched successfully!');
}

// 実行
patchWorkbench();
```

## 3. VSCode Dev版でのテスト

```bash
# VSCode開発版をクローン
git clone https://github.com/microsoft/vscode.git
cd vscode

# パッチを適用
git apply ../worktree-variable.patch

# 開発版を起動
./scripts/code.sh
```

## 使用方法

パッチ適用後、VSCodeの設定で以下のようにworktreeNameを使用可能：

```json
{
    "window.title": "${activeEditorShort}${separator}${rootName}${separator}${worktreeName}"
}
```

## 注意事項

- VSCode更新時にパッチが失われる可能性
- バックアップを作成してから実行
- 自己責任での使用